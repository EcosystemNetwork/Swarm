/** Message List — Scrollable chat message feed with auto-scroll and infinite scroll support. */
"use client";

import { useEffect, useRef } from "react";
import { CommandMessage } from "@/lib/mock-data";
import { MessageBubble } from "./message-bubble";

interface MessageListProps {
  messages: CommandMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatDate = (ts: number) => {
    const date = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Group by date
  const groups: { date: string; messages: CommandMessage[] }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const d = formatDate(msg.timestamp);
    if (d !== currentDate) {
      currentDate = d;
      groups.push({ date: d, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-4xl mb-3">💬</p>
          <p className="text-sm">No messages yet. Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-1">
      {groups.map((group) => (
        <div key={group.date}>
          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-[11px] text-muted-foreground font-medium px-2">
              {group.date}
            </span>
            <div className="flex-1 border-t border-border" />
          </div>
          {group.messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
