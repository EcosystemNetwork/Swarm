"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { Send, MessageSquare, Briefcase, Plus, Trash2, Link as LinkIcon } from "lucide-react";
import {
  type PlatformConnection,
  getAllPlatformConnections,
  getPlatformIcon,
  getPlatformColor,
} from "@/lib/platform-bridge";

export default function IntegrationsPage() {
  const { currentOrg } = useOrg();
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState<"telegram" | "discord" | "slack" | null>(null);
  const [formData, setFormData] = useState({ token: "", webhookUrl: "" });
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!currentOrg?.id) return;
    fetchConnections();
  }, [currentOrg?.id]);

  async function fetchConnections() {
    if (!currentOrg?.id) return;
    setLoading(true);
    try {
      // TODO: masterSecret should be fetched securely or this should use an API endpoint
      const conns = await getAllPlatformConnections(currentOrg.id, "");
      setConnections(conns);
    } catch (err) {
      console.error("Failed to fetch connections:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(platform: "telegram" | "discord" | "slack") {
    if (!currentOrg?.id || !formData.token) return;
    setConnecting(true);
    try {
      const res = await fetch(`/api/platforms/${platform}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: currentOrg.id,
          token: formData.token,
          webhookUrl: formData.webhookUrl || undefined,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setShowConnect(null);
        setFormData({ token: "", webhookUrl: "" });
        await fetchConnections();
      } else {
        alert(`Failed to connect: ${data.error}`);
      }
    } catch (err) {
      console.error("Failed to connect platform:", err);
      alert("Failed to connect platform");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect(connectionId: string) {
    if (!confirm("Are you sure you want to disconnect this integration?")) return;

    try {
      const res = await fetch(`/api/platforms/${connectionId}/disconnect`, {
        method: "POST",
      });

      if (res.ok) {
        await fetchConnections();
      }
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  }

  const hasConnection = (platform: "telegram" | "discord" | "slack") =>
    connections.some((c) => c.platform === platform && c.active);

  const platformCards = [
    {
      platform: "telegram" as const,
      name: "Telegram",
      icon: <Send className="w-8 h-8 text-blue-400" />,
      description: "Connect Telegram groups and channels",
      color: "border-blue-500/30 bg-blue-500/10",
    },
    {
      platform: "discord" as const,
      name: "Discord",
      icon: <MessageSquare className="w-8 h-8 text-indigo-400" />,
      description: "Bridge Discord channels to Swarm",
      color: "border-indigo-500/30 bg-indigo-500/10",
    },
    {
      platform: "slack" as const,
      name: "Slack",
      icon: <Briefcase className="w-8 h-8 text-purple-400" />,
      description: "Integrate with Slack workspaces",
      color: "border-purple-500/30 bg-purple-500/10",
    },
  ];

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Platform Integrations</h1>
        <p className="text-gray-400 mt-2">
          Connect Telegram, Discord, and Slack to bridge messages with Swarm channels
        </p>
      </div>

      {/* Platform Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {platformCards.map((card) => {
          const connected = hasConnection(card.platform);
          const connection = connections.find((c) => c.platform === card.platform && c.active);

          return (
            <div
              key={card.platform}
              className={`border rounded-lg p-6 ${card.color}`}
            >
              <div className="flex items-start justify-between mb-4">
                {card.icon}
                {connected ? (
                  <span className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-xs text-green-400">
                    Connected
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-gray-500/20 border border-gray-500/30 rounded text-xs text-gray-400">
                    Not Connected
                  </span>
                )}
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{card.name}</h3>
              <p className="text-sm text-gray-400 mb-4">{card.description}</p>

              {connected && connection ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Connected on {connection.connectedAt?.toLocaleDateString()}
                  </p>
                  {connection.metadata?.botUsername && (
                    <p className="text-xs text-gray-400">
                      Bot: @{connection.metadata.botUsername}
                    </p>
                  )}
                  <button
                    onClick={() => handleDisconnect(connection.id)}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg transition text-sm w-full justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Disconnect</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConnect(card.platform)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm w-full justify-center"
                >
                  <Plus className="w-4 h-4" />
                  <span>Connect {card.name}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Active Connections */}
      {connections.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Active Connections</h2>
          <div className="space-y-3">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between p-4 bg-gray-700 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getPlatformIcon(conn.platform)}</span>
                  <div>
                    <p className="font-medium text-white capitalize">{conn.platform}</p>
                    <p className="text-xs text-gray-400">
                      Connected {conn.connectedAt?.toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnect(conn.id)}
                  className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded text-sm transition"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connect Dialog */}
      {showConnect && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4 capitalize">
              Connect {showConnect}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Bot Token
                </label>
                <input
                  type="password"
                  value={formData.token}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                  placeholder={
                    showConnect === "telegram"
                      ? "123456:ABC-DEF1234..."
                      : showConnect === "discord"
                      ? "MTk4NjIyNDgzN..."
                      : "xo" + "xb-..."
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Webhook URL (optional)
                </label>
                <input
                  type="url"
                  value={formData.webhookUrl}
                  onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                  placeholder="https://your-domain.com/api/webhooks/..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowConnect(null);
                    setFormData({ token: "", webhookUrl: "" });
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
                  disabled={connecting}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConnect(showConnect)}
                  disabled={connecting || !formData.token}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition"
                >
                  {connecting ? "Connecting..." : "Connect"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
