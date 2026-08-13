"use client";

import * as React from "react";
import { MessageCircleQuestion, X, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/brand";
import { searchFaq, STAFF_FAQ, ADMIN_FAQ, type FaqEntry } from "@/lib/help-faq";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The sentinel `help-faq.ts` uses in place of the real support address —
 *  that module is import-free by design, so it can't reach `brand.ts`
 *  itself. This is the one place the substitution happens. */
const SUPPORT_SENTINEL = "__SUPPORT_EMAIL__";

type Turn = { question: string; matches: FaqEntry[] };

function AnswerLine({ entry }: { entry: FaqEntry }) {
  if (entry.answer === SUPPORT_SENTINEL) {
    return (
      <p className="text-sm text-foreground">
        Email us at{" "}
        <a href={SUPPORT_MAILTO} className="text-primary underline">
          {SUPPORT_EMAIL}
        </a>{" "}
        and we&apos;ll pick it up from there.
      </p>
    );
  }
  return <p className="text-sm text-foreground">{entry.answer}</p>;
}

/**
 * A scripted help widget, not an LLM call.
 *
 * That choice was made without a chance to ask which one was wanted — see
 * `help-faq.ts` for the reasoning. It's a genuine trade-off, not a shortcut:
 * a real model would handle a phrasing this FAQ list misses; a script never
 * says anything untrue about a leave rule or a billing figure, because
 * every answer is one this app's own code already had to get right
 * elsewhere. Revisit if the FAQ list stops covering what people actually ask.
 *
 * Floating trigger, bottom-right, on every authenticated layout — matches
 * where a help widget conventionally lives rather than competing with the
 * page's own header actions.
 */
export function HelpChatWidget({ role }: { role: string }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [turns, setTurns] = React.useState<Turn[]>([]);

  const faq = role === "staff" || role === "manager" ? STAFF_FAQ : ADMIN_FAQ;

  function ask(question: string) {
    const text = question.trim();
    if (!text) return;
    setTurns((prev) => [...prev, { question: text, matches: searchFaq(faq, text) }]);
    setQuery("");
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[26rem] w-80 flex-col rounded-sm border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-label text-foreground">Help</span>
            <button
              type="button"
              aria-label="Close help"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {turns.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Ask a question, or pick one below.
                </p>
                {faq.slice(0, 4).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => ask(entry.question)}
                    className="rounded-sm border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                  >
                    {entry.question}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {turns.map((turn, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <p className="self-end rounded-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground">
                      {turn.question}
                    </p>
                    {turn.matches.length === 0 ? (
                      <div className="rounded-sm bg-secondary px-3 py-2">
                        <p className="text-sm text-foreground">
                          I don&apos;t have a scripted answer for that yet.
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          Email{" "}
                          <a href={SUPPORT_MAILTO} className="text-primary underline">
                            {SUPPORT_EMAIL}
                          </a>{" "}
                          and a person will help.
                        </p>
                      </div>
                    ) : (
                      turn.matches.slice(0, 2).map((entry) => (
                        <div key={entry.id} className="rounded-sm bg-secondary px-3 py-2">
                          <AnswerLine entry={entry} />
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(query);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question…"
              className="h-9"
              aria-label="Ask a question"
            />
            <Button type="submit" size="icon" className="size-9 shrink-0" aria-label="Ask">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      )}

      <Button
        type="button"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close help" : "Open help"}
        className={cn("size-11 rounded-sm shadow-lg", open && "bg-secondary text-foreground")}
      >
        {open ? <X className="size-5" /> : <MessageCircleQuestion className="size-5" />}
      </Button>
    </div>
  );
}
