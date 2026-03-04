/** Chat — Real-time messaging channels between operators and agents. */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useActiveAccount } from "thirdweb/react";
import { useOrg } from "@/contexts/OrgContext";
import BlurText from "@/components/reactbits/BlurText";
import {
  getChannelsByOrg,
  onMessagesByChannel,
  sendMessage,
  createChannel,
  updateChannel,
  deleteChannel,
  deleteMessagesByChannel,
  getAgentsByOrg,
  type Channel,
  type Message,
  type Agent,
} from "@/lib/firestore";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Sort channels: most-recently-active first (fallback to createdAt) */
function sortByLatest(channels: Channel[], lastMsgMap: Map<string, number>): Channel[] {
  return [...channels].sort((a, b) => {
    const tA = lastMsgMap.get(a.id) ?? toMs(a.createdAt);
    const tB = lastMsgMap.get(b.id) ?? toMs(b.createdAt);
    return tB - tA;
  });
}

function toMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === "object" && ts !== null && "seconds" in ts) return (ts as any).seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return new Date(ts as any).getTime();
}

function formatTimestamp(ts: unknown): string {
  if (!ts) return "";
  const date = new Date(toMs(ts));
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isYesterday) return "Yesterday " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dateLabel(ts: unknown): string {
  if (!ts) return "";
  const date = new Date(toMs(ts));
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (date.toDateString() === y.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function ChatPage() {
  const account = useActiveAccount();
  const address = account?.address;
  const { currentOrg } = useOrg();

  // Channels / conversations
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projectChannels, setProjectChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [lastMsgTs, setLastMsgTs] = useState<Map<string, number>>(new Map());

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");

  // Agents (for online indicator)
  const [agents, setAgents] = useState<Agent[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Load channels ── */
  const loadChannels = useCallback(async () => {
    if (!currentOrg) return;
    try {
      setLoading(true);
      setError(null);
      const all = await getChannelsByOrg(currentOrg.id);
      const chatChannels = all.filter(c => !c.projectId);
      const projChannels = all.filter(c => !!c.projectId);
      setChannels(chatChannels);
      setProjectChannels(projChannels);

      // Auto-select first if nothing selected
      const allVisible = [...chatChannels, ...projChannels];
      if (!activeChannel && allVisible.length > 0) {
        const sorted = sortByLatest(allVisible, lastMsgTs);
        setActiveChannel(sorted[0]);
      }
    } catch (err) {
      console.error("Failed to load channels:", err);
      setError(err instanceof Error ? err.message : "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }, [currentOrg, activeChannel, lastMsgTs]);

  // Load agents for online indicators
  useEffect(() => {
    if (!currentOrg) return;
    getAgentsByOrg(currentOrg.id).then(setAgents).catch(console.error);
  }, [currentOrg]);

  // Load channels on org change
  useEffect(() => {
    loadChannels();
  }, [currentOrg]);

  /* ── Subscribe to messages ── */
  useEffect(() => {
    if (!activeChannel) {
      setMessages([]);
      return;
    }

    const unsubscribe = onMessagesByChannel(activeChannel.id, (msgs) => {
      setMessages(msgs);
      // Track latest message timestamp for sorting
      if (msgs.length > 0) {
        const latest = msgs[msgs.length - 1];
        setLastMsgTs(prev => {
          const next = new Map(prev);
          next.set(activeChannel.id, toMs(latest.createdAt));
          return next;
        });
      }
    });

    return unsubscribe;
  }, [activeChannel]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [messages]);

  /* ── Focus input on channel switch ── */
  useEffect(() => {
    if (activeChannel) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [activeChannel]);

  /* ── Actions ── */

  const handleNewConversation = async () => {
    if (!currentOrg) return;
    try {
      const now = new Date();
      const name = `Chat — ${now.toLocaleDateString([], { month: "short", day: "numeric" })} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      const id = await createChannel({
        orgId: currentOrg.id,
        name,
        createdAt: now,
      });
      const newCh: Channel = { id, orgId: currentOrg.id, name, createdAt: now };
      setChannels(prev => [newCh, ...prev]);
      setActiveChannel(newCh);
      setMessages([]);
    } catch (err) {
      console.error("Failed to create conversation:", err);
      setError(err instanceof Error ? err.message : "Failed to create conversation");
    }
  };

  const handleDelete = async (channel: Channel) => {
    try {
      await deleteMessagesByChannel(channel.id);
      await deleteChannel(channel.id);
      setChannels(prev => prev.filter(c => c.id !== channel.id));
      if (activeChannel?.id === channel.id) {
        const remaining = channels.filter(c => c.id !== channel.id);
        setActiveChannel(remaining.length > 0 ? remaining[0] : null);
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error("Failed to delete conversation:", err);
      setError(err instanceof Error ? err.message : "Failed to delete conversation");
    }
  };

  const handleRename = async (channelId: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await updateChannel(channelId, { name: renameValue.trim() } as any);
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, name: renameValue.trim() } : c));
      if (activeChannel?.id === channelId) {
        setActiveChannel(prev => prev ? { ...prev, name: renameValue.trim() } : prev);
      }
      setRenamingId(null);
    } catch (err) {
      console.error("Failed to rename:", err);
    }
  };

  const handleSend = useCallback(async () => {
    if (!activeChannel || !address || !messageInput.trim()) return;
    try {
      setSending(true);
      await sendMessage({
        channelId: activeChannel.id,
        senderId: address,
        senderAddress: address,
        senderName: address.slice(0, 6) + "..." + address.slice(-4),
        senderType: "human",
        content: messageInput.trim(),
        createdAt: new Date(),
      });
      setMessageInput("");
    } catch (err) {
      console.error("Failed to send:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [activeChannel, address, messageInput]);

  /* ── Guards ── */

  if (!currentOrg) {
    return (
      <div className="space-y-6">
        <BlurText text="Chat" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
        <p className="text-muted-foreground mt-1">No organization selected</p>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="space-y-6">
        <BlurText text="Chat" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
        <p className="text-muted-foreground mt-1">Connect your wallet to start chatting</p>
      </div>
    );
  }

  const onlineAgents = agents.filter(a => a.status === "online");
  const sortedChannels = sortByLatest(channels, lastMsgTs);
  const sortedProjectChannels = sortByLatest(projectChannels, lastMsgTs);

  /* ── Render ── */

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {error && (
        <div className="p-2 rounded-md bg-red-950/40 border border-red-500/30 text-sm text-red-400 mx-4 mt-2">
          {error}
          <button className="ml-2 underline text-xs" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden rounded-lg border border-border bg-card">
        {/* ═══════════════ Sidebar ═══════════════ */}
        <div
          className={`${sidebarOpen ? "w-72" : "w-0"
            } transition-all duration-200 border-r border-border flex flex-col bg-muted/50 overflow-hidden shrink-0`}
        >
          {/* Sidebar header */}
          <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="font-semibold text-sm text-foreground">Conversations</h2>
            <Button
              onClick={handleNewConversation}
              size="sm"
              className="h-7 px-2.5 bg-amber-600 hover:bg-amber-700 text-black text-xs font-medium"
            >
              + New
            </Button>
          </div>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                {/* ── Chat Channels ── */}
                {sortedChannels.length === 0 && sortedProjectChannels.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    <div className="text-3xl mb-2">💬</div>
                    <p>No conversations yet</p>
                    <Button onClick={handleNewConversation} size="sm" className="mt-2 text-xs">
                      Start your first chat
                    </Button>
                  </div>
                ) : (
                  <>
                    {sortedChannels.length > 0 && (
                      <div className="py-1">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
                          Chats
                        </p>
                        {sortedChannels.map((ch) => (
                          <div
                            key={ch.id}
                            className={`group relative flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors ${activeChannel?.id === ch.id
                                ? "bg-amber-500/10 border-r-2 border-amber-500 text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground hover:bg-card hover:text-foreground"
                              }`}
                            onClick={() => {
                              if (renamingId !== ch.id) setActiveChannel(ch);
                            }}
                          >
                            <span className="text-base shrink-0">💬</span>

                            {renamingId === ch.id ? (
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={() => handleRename(ch.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRename(ch.id);
                                  if (e.key === "Escape") setRenamingId(null);
                                }}
                                className="flex-1 bg-transparent border-b border-amber-500 outline-none text-sm py-0.5 min-w-0"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span
                                className="flex-1 truncate"
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingId(ch.id);
                                  setRenameValue(ch.name);
                                }}
                                title="Double-click to rename"
                              >
                                {ch.name}
                              </span>
                            )}

                            {/* Delete button — visible on hover */}
                            {renamingId !== ch.id && (
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 text-xs shrink-0 p-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(ch);
                                }}
                                title="Delete conversation"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Project Channels ── */}
                    {sortedProjectChannels.length > 0 && (
                      <div className="py-1">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
                          Project Channels
                        </p>
                        {sortedProjectChannels.map((ch) => (
                          <div
                            key={ch.id}
                            className={`group relative flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors ${activeChannel?.id === ch.id
                                ? "bg-amber-500/10 border-r-2 border-amber-500 text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground hover:bg-card hover:text-foreground"
                              }`}
                            onClick={() => setActiveChannel(ch)}
                          >
                            <span className="text-base shrink-0">#</span>
                            <span className="flex-1 truncate">{ch.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ═══════════════ Main Chat Area ═══════════════ */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="border-b border-border px-4 py-2.5 bg-card flex items-center gap-3 shrink-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-muted-foreground hover:text-foreground transition-colors text-lg"
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarOpen ? "◀" : "☰"}
            </button>

            {activeChannel ? (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <h2 className="font-semibold text-foreground truncate">
                  {activeChannel.name}
                </h2>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {messages.length} {messages.length === 1 ? "message" : "messages"}
                </Badge>
                {onlineAgents.length > 0 && (
                  <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
                    <span className="text-xs text-emerald-500">
                      {onlineAgents.length} agent{onlineAgents.length > 1 ? "s" : ""} online
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <h2 className="font-semibold text-muted-foreground">Select a conversation</h2>
            )}
          </div>

          {/* Messages */}
          {activeChannel ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <div className="text-5xl mb-4">✨</div>
                      <p className="text-lg font-medium mb-1">New conversation</p>
                      <p className="text-sm text-muted-foreground">Send a message to get started</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 max-w-3xl mx-auto">
                    {messages.map((msg, idx) => {
                      const prev = idx > 0 ? messages[idx - 1] : null;
                      const showSender = !prev || prev.senderId !== msg.senderId;
                      const isAgent = msg.senderType === "agent";

                      // Date separator
                      const prevDate = prev ? dateLabel(prev.createdAt) : null;
                      const currDate = dateLabel(msg.createdAt);
                      const showDateSep = currDate !== prevDate;

                      return (
                        <div key={msg.id}>
                          {showDateSep && (
                            <div className="flex items-center gap-3 my-4">
                              <div className="flex-1 h-px bg-border" />
                              <span className="text-[11px] text-muted-foreground font-medium">{currDate}</span>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                          )}

                          <div className={`flex gap-3 ${showSender ? "mt-4" : "mt-0.5"}`}>
                            {/* Avatar */}
                            <div className="w-8 shrink-0">
                              {showSender && (
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isAgent
                                      ? "bg-gradient-to-br from-amber-500 to-orange-600 text-black"
                                      : "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
                                    }`}
                                >
                                  {isAgent ? "🤖" : msg.senderName.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              {showSender && (
                                <div className="flex items-baseline gap-2 mb-0.5">
                                  <span className={`text-sm font-semibold ${isAgent ? "text-amber-500" : "text-foreground"}`}>
                                    {msg.senderName}
                                  </span>
                                  {isAgent && (
                                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-500/30 text-amber-500">
                                      AI
                                    </Badge>
                                  )}
                                  <span className="text-[11px] text-muted-foreground">
                                    {formatTimestamp(msg.createdAt)}
                                  </span>
                                </div>
                              )}
                              <p className="text-sm text-foreground/90 break-words whitespace-pre-wrap leading-relaxed">
                                {msg.content}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-border p-4 shrink-0">
                <div className="max-w-3xl mx-auto flex gap-3">
                  <Input
                    ref={inputRef}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={`Message ${activeChannel.name}…`}
                    className="flex-1 bg-muted/50 border-border focus-visible:border-amber-500/50"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && messageInput.trim()) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={sending}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={sending || !messageInput.trim()}
                    className="bg-amber-600 hover:bg-amber-700 text-black px-6"
                  >
                    {sending ? "…" : "Send"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="text-6xl mb-4">💬</div>
                <p className="text-lg font-medium mb-2">Welcome to Chat</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a new conversation to get started
                </p>
                <Button onClick={handleNewConversation} className="bg-amber-600 hover:bg-amber-700 text-black">
                  + New Conversation
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ Delete Confirmation Modal ═══════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Delete Conversation</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete <strong>&ldquo;{deleteTarget.name}&rdquo;</strong>?
              All messages will be permanently removed.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleDelete(deleteTarget)}
              >
                🗑️ Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}