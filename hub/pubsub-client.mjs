/**
 * Google Cloud Pub/Sub client for cross-instance broadcasting.
 *
 * Enables WebSocket messages to be broadcast across all hub instances.
 * Messages published to the topic are received by all subscribed instances.
 *
 * Setup Required:
 * 1. Create Pub/Sub topic: `gcloud pubsub topics create swarm-broadcast`
 * 2. Create subscription per instance: `gcloud pubsub subscriptions create swarm-broadcast-sub-1 --topic=swarm-broadcast`
 * 3. Set GOOGLE_APPLICATION_CREDENTIALS env var for authentication
 *
 * Environment Variables:
 * - GCP_PROJECT_ID: Your Google Cloud project ID
 * - PUBSUB_TOPIC: Topic name (default: swarm-broadcast)
 * - PUBSUB_SUBSCRIPTION: Subscription name (default: auto-generated per instance)
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON
 */
import { PubSub } from "@google-cloud/pubsub";

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const TOPIC_NAME = process.env.PUBSUB_TOPIC || "swarm-broadcast";
const INSTANCE_ID = process.env.INSTANCE_ID || `instance-${process.pid}`;
const SUBSCRIPTION_NAME =
  process.env.PUBSUB_SUBSCRIPTION || `swarm-broadcast-${INSTANCE_ID}`;

let pubsubClient = null;
let topic = null;
let subscription = null;

/**
 * Initialize Pub/Sub client.
 * Call during server startup.
 */
export function initPubSub() {
  if (!PROJECT_ID) {
    console.warn(
      "[PubSub] GCP_PROJECT_ID not set - multi-instance broadcasting disabled"
    );
    return null;
  }

  try {
    pubsubClient = new PubSub({ projectId: PROJECT_ID });
    topic = pubsubClient.topic(TOPIC_NAME);
    subscription = topic.subscription(SUBSCRIPTION_NAME);

    console.log(`[PubSub] Initialized with topic: ${TOPIC_NAME}`);
    console.log(`[PubSub] Subscription: ${SUBSCRIPTION_NAME}`);

    return pubsubClient;
  } catch (err) {
    console.error("[PubSub] Failed to initialize:", err);
    return null;
  }
}

/**
 * Publish a message to all instances.
 *
 * @param {object} message - Message payload
 * @returns {Promise<string>} Message ID
 */
export async function publishMessage(message) {
  if (!topic) {
    console.warn("[PubSub] Not initialized - message not published");
    return null;
  }

  try {
    const data = Buffer.from(JSON.stringify(message));
    const messageId = await topic.publishMessage({ data });
    return messageId;
  } catch (err) {
    console.error("[PubSub] Failed to publish:", err);
    throw err;
  }
}

/**
 * Subscribe to messages from other instances.
 * Callback receives parsed message payload.
 *
 * @param {function} callback - Handler for received messages
 */
export function subscribeToMessages(callback) {
  if (!subscription) {
    console.warn("[PubSub] Not initialized - cannot subscribe");
    return;
  }

  const messageHandler = (message) => {
    try {
      const payload = JSON.parse(message.data.toString());

      // Ignore messages from this instance (echo prevention)
      if (payload.sourceInstance === INSTANCE_ID) {
        message.ack();
        return;
      }

      callback(payload);
      message.ack();
    } catch (err) {
      console.error("[PubSub] Failed to process message:", err);
      message.nack(); // Retry delivery
    }
  };

  subscription.on("message", messageHandler);
  subscription.on("error", (err) => {
    console.error("[PubSub] Subscription error:", err);
  });

  console.log("[PubSub] Subscribed to messages");
}

/**
 * Broadcast a WebSocket message to all instances.
 * Adds metadata for routing and echo prevention.
 *
 * @param {string} channelId - Target channel ID
 * @param {object} message - WebSocket message payload
 */
export async function broadcastToChannel(channelId, message) {
  if (!topic) {
    // Pub/Sub not configured - skip cross-instance broadcast
    return;
  }

  const envelope = {
    type: "broadcast",
    sourceInstance: INSTANCE_ID,
    channelId,
    message,
    timestamp: Date.now(),
  };

  await publishMessage(envelope);
}

/**
 * Send a message to a specific agent across all instances.
 * The instance with the active WebSocket connection will deliver it.
 *
 * @param {string} agentId - Target agent ID
 * @param {object} message - Message payload
 */
export async function sendToAgent(agentId, message) {
  if (!topic) {
    return;
  }

  const envelope = {
    type: "direct",
    sourceInstance: INSTANCE_ID,
    targetAgentId: agentId,
    message,
    timestamp: Date.now(),
  };

  await publishMessage(envelope);
}

/**
 * Gracefully shutdown Pub/Sub client.
 * Call during server shutdown.
 */
export async function closePubSub() {
  if (subscription) {
    await subscription.close();
  }
  if (pubsubClient) {
    await pubsubClient.close();
  }
  console.log("[PubSub] Closed successfully");
}

/**
 * Check if Pub/Sub is configured and healthy.
 */
export async function isPubSubHealthy() {
  if (!pubsubClient || !topic) {
    return false;
  }

  try {
    const [exists] = await topic.exists();
    return exists;
  } catch {
    return false;
  }
}

export { INSTANCE_ID };
