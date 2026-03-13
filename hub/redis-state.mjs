/**
 * Redis-Backed State Management for Multi-Instance WebSocket Hub
 *
 * Replaces in-memory Maps with distributed Redis state using ioredis.
 * Enables horizontal scaling across multiple hub instances.
 */

import Redis from 'ioredis';

const INSTANCE_ID = process.env.INSTANCE_ID || `hub-${process.pid}`;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient = null;
let pubClient = null;
let subClient = null;

/**
 * Initialize Redis connections
 */
export async function initRedis() {
  if (redisClient) return redisClient;

  console.log(`[Redis] Connecting to ${REDIS_URL.replace(/:.+@/, ':***@')}`);

  // Main client for state operations
  redisClient = new Redis(REDIS_URL);
  redisClient.on('error', (err) => console.error('[Redis] Client error:', err));
  redisClient.on('connect', () => console.log(`[Redis] Connected as instance ${INSTANCE_ID}`));

  // Pub/Sub clients (must be separate connections)
  pubClient = new Redis(REDIS_URL);
  subClient = new Redis(REDIS_URL);

  // Cleanup on shutdown
  process.on('SIGINT', async () => {
    await cleanupInstance();
    await redisClient.quit();
    await pubClient.quit();
    await subClient.quit();
  });

  // Register this instance
  await registerInstance();

  return redisClient;
}

/**
 * Get Redis clients
 */
export function getRedis() {
  if (!redisClient) throw new Error('Redis not initialized. Call initRedis() first.');
  return { client: redisClient, pub: pubClient, sub: subClient };
}

/* ────────────────────────────────────────────────────────────────────────
 *  Agent Connections (Presence Tracking)
 * ──────────────────────────────────────────────────────────────────────── */

export async function trackAgentConnection(agentId, orgId, agentName, agentType) {
  const key = `agent:${agentId}:instance`;
  const metadata = JSON.stringify({ orgId, agentName, agentType, connectedAt: Date.now() });

  // Store agent's current instance with 5-minute TTL
  await redisClient.setex(key, 300, INSTANCE_ID);
  await redisClient.setex(`agent:${agentId}:meta`, 300, metadata);
  await redisClient.sadd(`instance:${INSTANCE_ID}:agents`, agentId);

  console.log(`[Redis] Agent ${agentId} connected to ${INSTANCE_ID}`);
}

export async function untrackAgentConnection(agentId) {
  await redisClient.del(`agent:${agentId}:instance`, `agent:${agentId}:meta`);
  await redisClient.srem(`instance:${INSTANCE_ID}:agents`, agentId);
  console.log(`[Redis] Agent ${agentId} disconnected from ${INSTANCE_ID}`);
}

export async function refreshAgentPresence(agentId) {
  await redisClient.expire(`agent:${agentId}:instance`, 300);
  await redisClient.expire(`agent:${agentId}:meta`, 300);
}

export async function getAgentInstance(agentId) {
  return await redisClient.get(`agent:${agentId}:instance`);
}

export async function getInstanceAgents() {
  return await redisClient.smembers(`instance:${INSTANCE_ID}:agents`);
}

export async function getAllOnlineAgents() {
  const keys = await redisClient.keys('agent:*:instance');
  const agents = [];

  for (const key of keys) {
    const agentId = key.split(':')[1];
    const instance = await redisClient.get(key);
    const metaJson = await redisClient.get(`agent:${agentId}:meta`);
    const metadata = metaJson ? JSON.parse(metaJson) : {};
    agents.push({ agentId, instance, ...metadata });
  }

  return agents;
}

/* ────────────────────────────────────────────────────────────────────────
 *  Channel Subscriptions
 * ──────────────────────────────────────────────────────────────────────── */

export async function subscribeChannel(channelId, agentId) {
  await redisClient.sadd(`channel:${channelId}:subscribers`, agentId);
  await redisClient.sadd(`agent:${agentId}:channels`, channelId);
  console.log(`[Redis] Agent ${agentId} subscribed to channel ${channelId}`);
}

export async function unsubscribeChannel(channelId, agentId) {
  await redisClient.srem(`channel:${channelId}:subscribers`, agentId);
  await redisClient.srem(`agent:${agentId}:channels`, channelId);
}

export async function getChannelSubscribers(channelId) {
  return await redisClient.smembers(`channel:${channelId}:subscribers`);
}

export async function getAgentChannels(agentId) {
  return await redisClient.smembers(`agent:${agentId}:channels`);
}

export async function unsubscribeAllChannels(agentId) {
  const channels = await getAgentChannels(agentId);
  for (const channelId of channels) {
    await unsubscribeChannel(channelId, agentId);
  }
}

/* ────────────────────────────────────────────────────────────────────────
 *  Rate Limiting (Sliding Window)
 * ──────────────────────────────────────────────────────────────────────── */

export async function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const rateLimitKey = `ratelimit:${key}`;

  // Remove expired entries
  await redisClient.zremrangebyscore(rateLimitKey, 0, windowStart);

  // Count current requests
  const count = await redisClient.zcard(rateLimitKey);

  if (count >= limit) {
    const oldest = await redisClient.zrange(rateLimitKey, 0, 0);
    const resetAt = oldest.length > 0 ? parseInt(oldest[0]) + windowMs : now + windowMs;
    return { allowed: false, remaining: 0, resetAt };
  }

  // Add current request
  await redisClient.zadd(rateLimitKey, now, now.toString());
  await redisClient.expire(rateLimitKey, Math.ceil(windowMs / 1000));

  return { allowed: true, remaining: limit - count - 1, resetAt: now + windowMs };
}

export async function resetRateLimit(key) {
  await redisClient.del(`ratelimit:${key}`);
}

/* ────────────────────────────────────────────────────────────────────────
 *  Cross-Instance Messaging (Pub/Sub)
 * ──────────────────────────────────────────────────────────────────────── */

export async function publishToInstances(channel, message) {
  await pubClient.publish(channel, JSON.stringify(message));
}

export async function subscribeToInstances(channel, handler) {
  await subClient.subscribe(channel);
  subClient.on('message', (ch, message) => {
    if (ch === channel) {
      try {
        const parsed = JSON.parse(message);
        handler(parsed);
      } catch (err) {
        console.error('[Redis] Failed to parse pub/sub message:', err);
      }
    }
  });
  console.log(`[Redis] Subscribed to ${channel}`);
}

/* ────────────────────────────────────────────────────────────────────────
 *  Instance Management
 * ──────────────────────────────────────────────────────────────────────── */

export async function registerInstance() {
  const key = `instance:${INSTANCE_ID}:heartbeat`;
  await redisClient.setex(key, 60, Date.now().toString());

  // Periodic heartbeat every 30s
  setInterval(async () => {
    await redisClient.setex(key, 60, Date.now().toString());
  }, 30000);
}

export async function getActiveInstances() {
  const keys = await redisClient.keys('instance:*:heartbeat');
  return keys.map((k) => k.split(':')[1]);
}

export async function cleanupInstance() {
  console.log(`[Redis] Cleaning up instance ${INSTANCE_ID}`);
  const agents = await getInstanceAgents();

  for (const agentId of agents) {
    await untrackAgentConnection(agentId);
    await unsubscribeAllChannels(agentId);
  }

  await redisClient.del(`instance:${INSTANCE_ID}:agents`, `instance:${INSTANCE_ID}:heartbeat`);
}

export function getInstanceId() {
  return INSTANCE_ID;
}

export async function checkRedisHealth() {
  try {
    const pong = await redisClient.ping();
    return { healthy: pong === 'PONG', latency: 0 };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}
