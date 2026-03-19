"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, User, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string; // base64
  timestamp: Date;
}

const MOCK_RESPONSES: Record<string, string> = {
  hello: "Hey! I'm your Gemini Live Agent — I can analyze screenshots, plan UI actions, and help automate browser tasks. Drop a screenshot or describe what you need!",
  help: "Here's what I can do:\n\n• **Analyze UI** — Upload a screenshot and I'll identify all interactive elements\n• **Plan Actions** — Describe a task and I'll create a step-by-step action plan\n• **Execute** — Run planned actions on a cloud desktop\n• **Navigate** — Open URLs, click buttons, fill forms\n\nTry uploading a screenshot and asking me to do something with it!",
  screenshot: "I can see the screenshot! Here's what I notice:\n\n• **Navigation bar** at the top with several menu items\n• **Main content area** with interactive elements\n• **Action buttons** — looks like there are a few clickable targets\n\nWhat would you like me to do with this interface?",
};

function getMockResponse(input: string, hasImage: boolean): string {
  const lower = input.toLowerCase().trim();

  if (hasImage) return MOCK_RESPONSES.screenshot;
  if (lower === "hello" || lower === "hi" || lower === "hey") return MOCK_RESPONSES.hello;
  if (lower.includes("help") || lower === "?") return MOCK_RESPONSES.help;

  if (lower.includes("click") || lower.includes("tap") || lower.includes("press"))
    return `Sure, I can handle that. To click on the target element I'd need a screenshot of the current UI state. You can:\n\n1. **Upload a screenshot** using the image button\n2. **Use the UI Agent tab** for the full analyze → plan → execute workflow\n\nWant me to walk you through it?`;

  if (lower.includes("navigate") || lower.includes("open") || lower.includes("go to"))
    return `I can navigate to URLs by opening them in the browser on a cloud desktop. Here's what I'd do:\n\n1. Launch \`xdg-open\` with the target URL\n2. Wait for the page to load\n3. Take a screenshot to confirm\n\nDo you have a computer selected for live execution, or should I demo it?`;

  if (lower.includes("plan") || lower.includes("automate") || lower.includes("workflow"))
    return `I'd love to help plan that out! To create an action plan, I need:\n\n• A **screenshot** of the starting UI state\n• A **description** of the goal you want to achieve\n\nI'll then generate a step-by-step plan with click, type, scroll, and navigate actions. You can review and execute them on a cloud desktop.`;

  if (lower.includes("who") || lower.includes("what are you"))
    return "I'm **Gemini Live Agent** — a multimodal AI assistant powered by Google's Gemini 2.5 Flash model. I specialize in understanding user interfaces from screenshots and automating browser interactions.\n\nI'm part of the Swarm Protocol mod system, which means I can be installed, configured, and connected to cloud desktops for real execution.";

  // Default
  const defaults = [
    `Interesting! I can help with that. For best results, upload a screenshot of the UI you're working with — I'll analyze it and suggest actions.\n\nYou can also switch to the **UI Agent** tab for the full analysis workflow.`,
    `Got it! I work best with visual context. Try sharing a screenshot and I'll identify all the interactive elements and plan the next steps for you.`,
    `I understand what you're looking for. Let me know if you'd like me to:\n\n• **Analyze** a screenshot for UI elements\n• **Plan** a sequence of actions to achieve a goal\n• **Execute** actions on a cloud desktop\n\nJust upload a screenshot to get started!`,
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

export function GeminiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! I'm your **Gemini Live Agent**. I can analyze UIs, plan actions, and automate browser tasks.\n\nSend me a message or upload a screenshot to get started.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isTyping, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      image: pendingImage || undefined,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    const hadImage = !!pendingImage;
    setPendingImage(null);
    setIsTyping(true);

    // Simulate typing delay
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

    const reply: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: getMockResponse(text, hadImage),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, reply]);
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] rounded-xl border border-border bg-card/50 overflow-hidden">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs",
                msg.role === "assistant"
                  ? "bg-amber-500/10 border border-amber-500/20"
                  : "bg-muted border border-border"
              )}
            >
              {msg.role === "assistant" ? (
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <div
              className={cn(
                "max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "assistant"
                  ? "bg-muted/50 border border-border"
                  : "bg-amber-500/10 border border-amber-500/20 text-foreground"
              )}
            >
              {msg.image && (
                <img
                  src={msg.image}
                  alt="Uploaded"
                  className="rounded-lg mb-2 max-h-48 w-auto border border-border"
                />
              )}
              <div className="whitespace-pre-wrap [&_strong]:font-semibold [&_strong]:text-foreground">
                {msg.content.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                  part.startsWith("**") && part.endsWith("**") ? (
                    <strong key={i}>{part.slice(2, -2)}</strong>
                  ) : part.startsWith("`") && part.endsWith("`") ? (
                    <code key={i} className="px-1 py-0.5 rounded bg-muted text-xs font-mono">{part.slice(1, -1)}</code>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </div>
              <span className="block mt-1 text-[10px] text-muted-foreground/60">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div className="rounded-xl bg-muted/50 border border-border px-4 py-3">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pending image preview */}
      {pendingImage && (
        <div className="px-4 py-2 border-t border-border bg-muted/30">
          <div className="relative inline-block">
            <img src={pendingImage} alt="Pending" className="h-16 rounded-lg border border-border" />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-3 bg-card/80">
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9 text-muted-foreground hover:text-amber-400"
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Gemini..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/30 max-h-32"
            style={{ minHeight: "36px" }}
          />
          <Button
            size="icon"
            className="shrink-0 h-9 w-9 bg-amber-500/80 hover:bg-amber-500 text-black"
            onClick={handleSend}
            disabled={(!input.trim() && !pendingImage) || isTyping}
          >
            {isTyping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
