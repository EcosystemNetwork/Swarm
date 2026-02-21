"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { mockAgents } from "@/lib/mock-data";

interface MessageInputProps {
  onSend: (content: string) => void;
  channelName: string;
}

export function MessageInput({ onSend, channelName }: MessageInputProps) {
  const [input, setInput] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mentionables = mockAgents.map((a) => ({
    id: a.id,
    name: a.name,
    type: "agent" as const,
  }));

  const filtered = mentionables.filter((m) =>
    m.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
    setShowMentions(false);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const insertMention = useCallback(
    (name: string) => {
      const el = inputRef.current;
      if (!el) return;
      const cursor = el.selectionStart ?? input.length;
      const textBefore = input.slice(0, cursor);
      const atIdx = textBefore.lastIndexOf("@");
      const before = input.slice(0, atIdx);
      const after = input.slice(cursor);
      const newVal = `${before}@${name} ${after}`;
      setInput(newVal);
      setShowMentions(false);
      setMentionFilter("");
      requestAnimationFrame(() => {
        const pos = atIdx + name.length + 2;
        el.setSelectionRange(pos, pos);
        el.focus();
      });
    },
    [input]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Auto-grow
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;

    // Check for @mention trigger
    const cursor = el.selectionStart ?? value.length;
    const textBefore = value.slice(0, cursor);
    const atIdx = textBefore.lastIndexOf("@");

    if (atIdx >= 0) {
      const charBefore = atIdx > 0 ? value[atIdx - 1] : " ";
      if (charBefore === " " || charBefore === "\n" || atIdx === 0) {
        const filter = textBefore.slice(atIdx + 1);
        if (!filter.includes(" ")) {
          setShowMentions(true);
          setMentionFilter(filter);
          setSelectedIndex(0);
          return;
        }
      }
    }
    setShowMentions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filtered[selectedIndex].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 p-4 bg-white">
      <div className="relative">
        {/* Mention dropdown */}
        {showMentions && filtered.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg z-50">
            {filtered.map((m, idx) => (
              <button
                key={m.id}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  idx === selectedIndex ? "bg-amber-50" : "hover:bg-gray-50"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m.name);
                }}
              >
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-[10px]">
                  🤖
                </span>
                <span className="text-gray-900">{m.name}</span>
                <span className="text-[10px] text-gray-400 ml-auto">
                  Agent
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message #${channelName}... (@ to mention)`}
            rows={1}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent placeholder:text-gray-400"
            style={{ overflow: "hidden" }}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim()}
            className="shrink-0 bg-amber-600 hover:bg-blue-700 text-white h-10 px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
