"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import { submitContactRequest } from "@/app/contact-actions";
import { SUPPORT_EMAIL as CONTACT_ADDRESS } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TEAM_SIZES = ["1–10", "11–50", "51–200", "200+"];

export function ContactForm() {
  const [status, setStatus] = React.useState<"idle" | "submitting" | "sent">(
    "idle"
  );

  const [error, setError] = React.useState<string | null>(null);

  /**
   * Writes to `contact_requests` (migration 0009).
   *
   * This used to `setTimeout(600)` and then render "Request received —
   * we'll be in touch within one business day" while sending nothing
   * anywhere. Briefly it was a `mailto:` stopgap. It now actually records
   * the enquiry, rate-limited per IP because it is the one write path with
   * no session behind it.
   */
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = new FormData(e.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");

    try {
      const result = await submitContactRequest({
        fullName: value("fullName"),
        workEmail: value("workEmail"),
        company: value("company"),
        phone: value("phone"),
        teamSize: value("teamSize"),
        message: value("message"),
      });

      if (result.error) {
        setError(result.error);
        setStatus("idle");
        return;
      }

      setStatus("sent");
    } catch {
      setError(
        `Something went wrong. Email ${CONTACT_ADDRESS} directly and we'll pick it up.`
      );
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-sm border border-border bg-card px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-5" />
        </span>
        <h3 className="font-display text-2xl">Request received.</h3>
        <p className="max-w-sm text-muted-foreground">
          Thanks — we&apos;ll be in touch within one business day. If it&apos;s
          urgent, email us at{" "}
          <a className="text-primary underline" href={`mailto:${CONTACT_ADDRESS}`}>
            {CONTACT_ADDRESS}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 rounded-sm border border-border bg-card p-6 sm:grid-cols-2 sm:p-8"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" placeholder="Wanjiku Mwangi" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="workEmail">Work email</Label>
        <Input
          id="workEmail"
          name="workEmail"
          type="email"
          placeholder="you@company.co.ke"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="company">Company</Label>
        <Input id="company" name="company" placeholder="Alpha Pride Security" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" placeholder="+254 7XX XXX XXX" />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="teamSize">Team size</Label>
        <Select name="teamSize">
          <SelectTrigger id="teamSize" className="sm:max-w-xs">
            <SelectValue placeholder="Number of employees" />
          </SelectTrigger>
          <SelectContent>
            {TEAM_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {size} employees
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="message">What are you trying to solve?</Label>
        <Textarea
          id="message"
          name="message"
          placeholder="e.g. three sites, guards on rotating shifts, currently on paper timesheets"
        />
      </div>

      <div className="flex flex-col gap-3 sm:col-span-2">
        {/* Rendered unconditionally so a screen reader has a live region to
            announce into. A node that only appears once `error` is truthy
            is inserted after the failure already happened, and some screen
            readers miss content that wasn't already in the accessibility
            tree. The visible copy below stays conditional — this one is
            sr-only, so there's no double message for sighted users. */}
        <p role="alert" aria-atomic="true" className="sr-only">
          {error}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          size="lg"
          className="self-start"
          disabled={status === "submitting"}
        >
          {status === "submitting" && <Loader2 className="animate-spin" />}
          Send request
        </Button>
      </div>
    </form>
  );
}
