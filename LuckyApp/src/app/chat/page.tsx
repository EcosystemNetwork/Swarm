"use client";

import { useState, useCallback, useEffect } from "react";
import { ChannelList } from "@/components/chat/channel-list";
import { MessageList } from "@/components/chat/message-list";
import { MessageInput } from "@/components/chat/message-input";
import { useTeam } from "@/contexts/TeamContext";
import {
  getChannelsByTeam,
  onMessagesByChannel,
  sendMessage as sendFirestoreMessage,
  type FirestoreChannel,
  type FirestoreMessage,
} from "@/lib/firestore";
import {
  CommandMessage,
  mockChannelMessages,
  mockDMMessages,
  mockChannels,
  mockDirectMessages,
} from "@/lib/mock-data";

export default function ChatPage() {
  const { currentTeam } = useTeam();
  const [activeId, setActiveId] = useState("ch-general");
  const [activeType, setActiveType] = useState<"channel" | "dm">("channel");
  const [firestoreChannels, setFirestoreChannels] = useState<FirestoreChannel[]>([]);
  const [firestoreMessages, setFirestoreMessages] = useState<FirestoreMessage[]>([]);
  const [mockMsgs, setMockMsgs] = useState<Record<string, CommandMessage[]>>({
    ...mockChannelMessages,
    ...mockDMMessages,
  });
  const [useFirestore, setUseFirestore] = useState(false);

  // Load channels from Firestore
  useEffect(() => {
    if (!currentTeam) return;
    getChannelsByTeam(currentTeam.id).then((channels) => {
      setFirestoreChannels(channels);
      if (channels.length > 0) {
        setUseFirestore(true);
      }
    });
  }, [currentTeam]);

  // Subscribe to real-time messages for active channel
  useEffect(() => {
    if (!useFirestore) return;
    const unsub = onMessagesByChannel(activeId, (msgs) => {
      setFirestoreMessages(msgs);
    });
    return () => unsub();
  }, [activeId, useFirestore]);

  const handleSelectChannel = (id: string, type: "channel" | "dm") => {
    setActiveId(id);
    setActiveType(type);
  };

  const handleSend = useCallback(
    async (content: string) => {
      if (useFirestore && currentTeam) {
        await sendFirestoreMessage({
          channelId: activeId,
          senderId: "operator-1",
          senderName: "Julio",
          senderType: "operator",
          content,
          timestamp: Date.now(),
          teamId: currentTeam.id,
        });
      } else {
        const newMsg: CommandMessage = {
          id: `msg-${Date.now()}`,
          senderId: "operator-1",
          senderName: "Julio",
          senderType: "operator",
          content,
          timestamp: Date.now(),
        };
        setMockMsgs((prev) => ({
          ...prev,
          [activeId]: [...(prev[activeId] || []), newMsg],
        }));
      }
    },
    [activeId, useFirestore, currentTeam]
  );

  const currentMessages: CommandMessage[] = useFirestore
    ? firestoreMessages.map((m) => ({
        id: m.id!,
        senderId: m.senderId,
        senderName: m.senderName,
        senderType: m.senderType,
        content: m.content,
        timestamp: m.timestamp,
      }))
    : mockMsgs[activeId] || [];

  const activeName =
    activeType === "channel"
      ? (useFirestore
          ? firestoreChannels.find((c) => c.id === activeId)?.name
          : mockChannels.find((c) => c.id === activeId)?.name) || "General"
      : mockDirectMessages.find((d) => d.id === activeId)?.participantName || "Chat";

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white rounded-lg border border-gray-200 overflow-hidden">
      <ChannelList
        activeChannelId={activeId}
        onSelectChannel={handleSelectChannel}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-gray-200 px-6 py-3 bg-white">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">
              {activeType === "channel" ? "#" : ""} {activeName}
            </h2>
            {activeType === "dm" && (
              <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                Direct Message
              </span>
            )}
          </div>
        </div>

        <MessageList messages={currentMessages} />
        <MessageInput onSend={handleSend} channelName={activeName} />
      </div>
    </div>
  );
}
