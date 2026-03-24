/**
 * Hub WebSocket Client — Server-side singleton that connects to the Swarm hub
 * as a service agent and relays agent lifecycle events.
 *
 * Runs server-side only (Node.js). Browser clients consume events via SSE.
 */

import { EventEmitter } from "events";
import crypto from "crypto";

const HUB_URL = process.env.SWARM_HUB_URL || "https://swarmprotocol.fun";
const SERVICE_AGENT_ID = process.env.OFFICE_SIM_SERVICE_AGENT_ID || "";
const SERVICE_PRIVATE_KEY = process.env.OFFICE_SIM_SERVICE_PRIVATE_KEY || "";

export interface HubAgentEvent {
  type: "agent:online" | "agent:offline" | "agent:status" | "agent:typing" | "agent:message" | "agent:task";
  agentId: string;
  agentName?: string;
  orgId?: string;
  data?: Record<string, unknown>;
  ts: number;
}

class HubWSClient extends EventEmitter {
  private ws: import("ws") | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private connected = false;
  private agentStatuses = new Map<string, { online: boolean; name?: string; orgId?: string }>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  get isConnected() {
    return this.connected;
  }

  getOnlineAgents(): Map<string, { online: boolean; name?: string; orgId?: string }> {
    return new Map(this.agentStatuses);
  }

  async connect() {
    if (!SERVICE_AGENT_ID || !SERVICE_PRIVATE_KEY) {
      console.warn("[hub-ws-client] Service agent not configured (OFFICE_SIM_SERVICE_AGENT_ID / OFFICE_SIM_SERVICE_PRIVATE_KEY). SSE relay disabled.");
      return;
    }

    try {
      const WebSocket = (await import("ws")).default;
      const ts = Date.now().toString();
      const message = `WS:connect:${SERVICE_AGENT_ID}:${ts}`;
      const sig = this.sign(message);

      const wsUrl = HUB_URL.replace(/^http/, "ws");
      const url = `${wsUrl}/ws/agents/${SERVICE_AGENT_ID}?sig=${encodeURIComponent(sig)}&ts=${ts}`;

      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        console.log("[hub-ws-client] Connected to hub");
        this.connected = true;
        this.reconnectDelay = 1000;
        this.emit("connected");
        this.startHeartbeat();
      });

      this.ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {
          // Ignore unparseable messages
        }
      });

      this.ws.on("ping", () => {
        this.ws?.pong();
      });

      this.ws.on("close", () => {
        console.log("[hub-ws-client] Disconnected from hub");
        this.connected = false;
        this.stopHeartbeat();
        this.emit("disconnected");
        this.scheduleReconnect();
      });

      this.ws.on("error", (err: Error) => {
        console.error("[hub-ws-client] WebSocket error:", err.message);
        this.ws?.close();
      });
    } catch (err) {
      console.error("[hub-ws-client] Failed to connect:", err);
      this.scheduleReconnect();
    }
  }

  private sign(message: string): string {
    const privateKey = crypto.createPrivateKey({
      key: SERVICE_PRIVATE_KEY,
      format: "pem",
      type: "pkcs8",
    });
    const sig = crypto.sign(null, Buffer.from(message, "utf-8"), privateKey);
    return sig.toString("base64");
  }

  private handleMessage(msg: Record<string, unknown>) {
    // Hub broadcasts agent lifecycle events to connected agents
    const type = msg.type as string;

    if (type === "agent:online" || type === "agent_online") {
      const event: HubAgentEvent = {
        type: "agent:online",
        agentId: msg.agentId as string,
        agentName: msg.agentName as string | undefined,
        orgId: msg.orgId as string | undefined,
        ts: Date.now(),
      };
      this.agentStatuses.set(event.agentId, { online: true, name: event.agentName, orgId: event.orgId });
      this.emit("event", event);
    } else if (type === "agent:offline" || type === "agent_offline") {
      const event: HubAgentEvent = {
        type: "agent:offline",
        agentId: msg.agentId as string,
        agentName: msg.agentName as string | undefined,
        orgId: msg.orgId as string | undefined,
        ts: Date.now(),
      };
      this.agentStatuses.set(event.agentId, { online: false, name: event.agentName, orgId: event.orgId });
      this.emit("event", event);
    } else if (type === "typing") {
      const event: HubAgentEvent = {
        type: "agent:typing",
        agentId: msg.from as string || msg.agentId as string,
        ts: Date.now(),
      };
      this.emit("event", event);
    } else if (type === "a2a" || type === "broadcast") {
      const event: HubAgentEvent = {
        type: "agent:message",
        agentId: msg.from as string || msg.agentId as string,
        agentName: msg.fromName as string | undefined,
        data: msg as Record<string, unknown>,
        ts: Date.now(),
      };
      this.emit("event", event);
    } else if (type === "task:assign" || type === "task:complete" || type === "task:progress") {
      const event: HubAgentEvent = {
        type: "agent:task",
        agentId: msg.agentId as string || msg.assignee as string,
        agentName: msg.agentName as string | undefined,
        orgId: msg.orgId as string | undefined,
        data: msg as Record<string, unknown>,
        ts: Date.now(),
      };
      this.emit("event", event);
    } else if (type === "agent:status" || type === "status_update") {
      const event: HubAgentEvent = {
        type: "agent:status",
        agentId: msg.agentId as string || msg.from as string,
        agentName: msg.agentName as string | undefined,
        orgId: msg.orgId as string | undefined,
        data: { status: msg.status, task: msg.task },
        ts: Date.now(),
      };
      const existingStatus = this.agentStatuses.get(event.agentId);
      if (existingStatus) {
        this.agentStatuses.set(event.agentId, { ...existingStatus, online: true });
      }
      this.emit("event", event);
    }
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === 1) {
        this.ws.ping();
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}

// Singleton — one connection per server process
let instance: HubWSClient | null = null;

export function getHubWSClient(): HubWSClient {
  if (!instance) {
    instance = new HubWSClient();
    instance.connect();
  }
  return instance;
}
