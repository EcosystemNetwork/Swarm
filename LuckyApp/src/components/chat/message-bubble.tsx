"use client";

import { CommandMessage } from "@/lib/mock-data";

interface MessageBubbleProps {
  message: CommandMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAgent = message.senderType === "agent";

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div
      className={`flex items-start gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-gray-50 ${
        isAgent ? "bg-amber-50/50" : ""
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-medium ${
          isAgent
            ? "bg-amber-100 text-amber-700"
            : "bg-amber-100 text-amber-700"
        }`}
      >
        {isAgent ? "🤖" : message.senderName.charAt(0).toUpperCase()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-semibold text-sm ${
              isAgent ? "text-amber-700" : "text-gray-900"
            }`}
          >
            {message.senderName}
          </span>
          {isAgent && (
            <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">
              Agent
            </span>
          )}
          <span className="text-[11px] text-gray-400">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="text-sm text-gray-700 break-words whitespace-pre-wrap mt-0.5">
          {message.content}
        </p>
      </div>
    </div>
  );
}
