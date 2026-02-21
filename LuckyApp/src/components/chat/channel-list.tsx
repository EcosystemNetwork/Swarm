"use client";

import {
  CommandChannel,
  DirectMessage,
  mockChannels,
  mockDirectMessages,
} from "@/lib/mock-data";
import { Hash, MessageSquare, Users } from "lucide-react";

interface ChannelListProps {
  activeChannelId: string;
  onSelectChannel: (id: string, type: "channel" | "dm") => void;
}

export function ChannelList({
  activeChannelId,
  onSelectChannel,
}: ChannelListProps) {
  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-amber-600" />
          Channels
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Channels Section */}
        <div className="p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
            Channels
          </p>
          {mockChannels.map((channel) => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              isActive={activeChannelId === channel.id}
              onClick={() => onSelectChannel(channel.id, "channel")}
            />
          ))}
        </div>

        {/* Direct Messages Section */}
        <div className="p-3 pt-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
            Direct Messages
          </p>
          {mockDirectMessages.map((dm) => (
            <DMItem
              key={dm.id}
              dm={dm}
              isActive={activeChannelId === dm.id}
              onClick={() => onSelectChannel(dm.id, "dm")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChannelItem({
  channel,
  isActive,
  onClick,
}: {
  channel: CommandChannel;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-amber-50 text-amber-700 font-medium"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <Hash className="w-4 h-4 shrink-0 text-gray-400" />
      <span className="truncate flex-1 text-left">{channel.name}</span>
      {channel.unreadCount > 0 && (
        <span className="bg-amber-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}

function DMItem({
  dm,
  isActive,
  onClick,
}: {
  dm: DirectMessage;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-amber-50 text-amber-700 font-medium"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
          dm.participantType === "agent"
            ? "bg-amber-100 text-amber-600"
            : "bg-amber-100 text-amber-600"
        }`}
      >
        {dm.participantType === "agent" ? "🤖" : dm.participantName[0]}
      </div>
      <span className="truncate flex-1 text-left">{dm.participantName}</span>
      {dm.unreadCount > 0 && (
        <span className="bg-amber-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
          {dm.unreadCount}
        </span>
      )}
    </button>
  );
}
