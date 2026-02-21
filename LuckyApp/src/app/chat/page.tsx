"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useActiveAccount } from 'thirdweb/react';
import { useOrg } from "@/contexts/OrgContext";
import BlurText from "@/components/reactbits/BlurText";
import {
  getChannelsByOrg,
  onMessagesByChannel,
  sendMessage,
  ensureGeneralChannel,
  createChannel,
  getProjectsByOrg,
  type Channel,
  type Message,
} from "@/lib/firestore";

interface ChannelWithUnread extends Channel {
  unreadCount?: number;
  lastMessage?: Message;
}

export default function ChatPage() {
  const account = useActiveAccount();
  const address = account?.address;
  const { currentOrg } = useOrg();
  
  const [channels, setChannels] = useState<ChannelWithUnread[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load channels
  const loadChannels = async () => {
    if (!currentOrg) return;

    try {
      setLoading(true);
      setError(null);

      // Ensure a General channel exists
      await ensureGeneralChannel(currentOrg.id);
      
      const channelsData = await getChannelsByOrg(currentOrg.id);
      setChannels(channelsData);

      // Auto-select General channel if no active channel
      if (!activeChannel && channelsData.length > 0) {
        const generalChannel = channelsData.find(c => c.name.toLowerCase() === 'general') || channelsData[0];
        setActiveChannel(generalChannel);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to messages for active channel
  useEffect(() => {
    if (!activeChannel) return;

    const unsubscribe = onMessagesByChannel(activeChannel.id, (msgs) => {
      setMessages(msgs);
    });

    return unsubscribe;
  }, [activeChannel]);

  // Load channels on org change
  useEffect(() => {
    loadChannels();
  }, [currentOrg]);

  const handleSelectChannel = (channel: Channel) => {
    setActiveChannel(channel);
  };

  const handleSend = useCallback(
    async (content: string) => {
      if (!activeChannel || !address || !messageInput.trim()) return;

      try {
        setSending(true);
        await sendMessage({
          channelId: activeChannel.id,
          senderId: address,
          senderAddress: address,
          senderName: address.slice(0, 6) + '...' + address.slice(-4),
          senderType: 'human',
          content: content.trim(),
          createdAt: new Date(),
        });
        setMessageInput('');
      } catch (err) {
        console.error('Failed to send message:', err);
        setError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [activeChannel, address, messageInput]
  );

  const formatTime = (timestamp: unknown) => {
    if (!timestamp) return '';
    
    let date: Date;
    if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
      date = new Date((timestamp as any).seconds * 1000);
    } else {
      date = new Date(timestamp as any);
    }
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  if (!currentOrg) {
    return (
      <div className="space-y-6">
        <div>
          <BlurText text="Chat" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
          <p className="text-muted-foreground mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="space-y-6">
        <div>
          <BlurText text="Chat" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
          <p className="text-muted-foreground mt-1">Connect your wallet to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <BlurText text="Chat" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
        <p className="text-muted-foreground mt-1">Real-time communication channels</p>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex h-[calc(100vh-12rem)] bg-card rounded-lg border border-border overflow-hidden">
        {/* Channel Sidebar */}
        <div className="hidden sm:flex w-64 border-r border-border flex-col bg-muted">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Channels</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading channels...</div>
            ) : channels.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No channels yet</div>
            ) : (
              <div className="py-2">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => handleSelectChannel(channel)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-card transition-colors ${
                      activeChannel?.id === channel.id ? 'bg-card border-r-2 border-amber-500 text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>#</span>
                      <span className="truncate">{channel.name}</span>
                      {channel.unreadCount && channel.unreadCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {channel.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeChannel ? (
            <>
              {/* Chat Header */}
              <div className="border-b border-border px-6 py-3 bg-card">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-foreground">
                    # {activeChannel.name}
                  </h2>
                  <Badge variant="secondary" className="text-xs">
                    {messages.length} messages
                  </Badge>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <div className="text-4xl mb-3">💬</div>
                      <p className="text-sm">No messages yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Start the conversation!</p>
                    </div>
                  </div>
                ) : (
                  messages.map((message, index) => {
                    const prevMessage = index > 0 ? messages[index - 1] : null;
                    const showSender = !prevMessage || prevMessage.senderAddress !== message.senderAddress;
                    
                    return (
                      <div key={message.id} className={`flex items-start gap-3 ${showSender ? '' : 'mt-1'}`}>
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-sm font-medium text-amber-700 shrink-0">
                          {message.senderName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          {showSender && (
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-sm font-semibold text-foreground">
                                {message.senderName}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatTime(message.createdAt)}
                              </span>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground break-words">
                            {message.content}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Input */}
              <div className="border-t border-border p-4">
                <div className="flex gap-3">
                  <Input
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={`Message #${activeChannel.name}`}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && messageInput.trim()) {
                        e.preventDefault();
                        handleSend(messageInput);
                      }
                    }}
                    disabled={sending}
                  />
                  <Button
                    onClick={() => handleSend(messageInput)}
                    disabled={sending || !messageInput.trim()}
                    className="bg-amber-600 hover:bg-amber-700 text-black"
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="text-4xl mb-3">💬</div>
                <p>Select a channel to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}