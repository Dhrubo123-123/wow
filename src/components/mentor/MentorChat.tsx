"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { MicIcon } from "@/components/icons";
import { speak } from "@/lib/audio/sound";
import { useSoundPreference } from "@/lib/audio/useSoundPreference";
import { useSpeechRecognition } from "@/lib/audio/useSpeechRecognition";
import type { AIMessageRole } from "@/lib/supabase/types";

interface ChatMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  created_at: string;
}

let localIdCounter = 0;

/**
 * The AI Mentor is now a real two-way voice conversation, not just
 * text with spoken narration bolted on: tap the mic, ask your
 * question out loud (Web Speech API transcribes it), and — when sound
 * is enabled — the mentor's reply is spoken back automatically, not
 * just displayed as a bubble. Text input still works exactly as
 * before for anyone without mic support (Firefox, denied permission,
 * etc.) or who'd rather type.
 */
export function MentorChat({ initialMessages }: { initialMessages: ChatMessage[] }) {
  const { enabled: soundEnabled, lang } = useSoundPreference();
  const { isSupported: micSupported, listening, error: micError, start, stop } =
    useSpeechRecognition(lang);

  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function ask(trimmed: string) {
    if (!trimmed || loading) return;

    setError(null);
    setLoading(true);
    setQuestion("");

    const userMessage: ChatMessage = {
      id: `local-${localIdCounter++}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `local-${localIdCounter++}`,
          role: "assistant",
          content: data.message,
          created_at: new Date().toISOString(),
        },
      ]);
      // The other half of "interactive" — say the answer, don't just
      // print it. Gated by the same sound preference as every other
      // spoken moment in the app.
      speak(data.message, soundEnabled, lang);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(question.trim());
  }

  function toggleMic() {
    if (listening) {
      stop();
      return;
    }
    start((transcript) => {
      // Voice questions send immediately — that's what makes this feel
      // like a conversation instead of "voice dictation into a form".
      void ask(transcript.trim());
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-3 p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted">
            Ask your mentor anything about your progress — type, or tap the
            mic and just talk.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-gradient-primary text-primary-foreground"
                : "bg-surface-raised text-foreground"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="w-fit rounded-lg bg-surface-raised px-3 py-2 text-sm text-muted">
            Thinking…
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {(error || micError) && (
        <p className="px-4 text-sm text-danger">{error ?? micError}</p>
      )}

      {listening && (
        <p className="flex items-center justify-center gap-2 px-4 pb-1 text-sm text-accent">
          <span className="animate-flame-flicker" aria-hidden="true">
            🎙️
          </span>
          Listening…
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-4 pb-safe">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={listening ? "Listening…" : "What should I do today?"}
          disabled={listening}
          className="h-11 flex-1 rounded-md border border-border bg-surface-raised px-3 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
        />
        {micSupported && (
          <Button
            type="button"
            variant={listening ? "primary" : "secondary"}
            size="md"
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Ask by voice"}
            className={listening ? "animate-glow-pulse px-3" : "px-3"}
          >
            <MicIcon className="h-5 w-5" />
          </Button>
        )}
        <Button type="submit" loading={loading} disabled={!question.trim() || listening}>
          Ask
        </Button>
      </form>
    </div>
  );
}
