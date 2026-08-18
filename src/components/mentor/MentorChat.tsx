"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import type { AIMessageRole } from "@/lib/supabase/types";

interface ChatMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  created_at: string;
}

let localIdCounter = 0;

export function MentorChat({ initialMessages }: { initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
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
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-3 p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted">
            Ask your mentor anything about your progress.
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
      </div>

      {error && <p className="px-4 text-sm text-danger">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-4 pb-safe">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What should I do today?"
          className="h-11 flex-1 rounded-md border border-border bg-surface-raised px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <Button type="submit" loading={loading} disabled={!question.trim()}>
          Ask
        </Button>
      </form>
    </div>
  );
}
