"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

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

const CONTACT_ADDRESS = "hello@pac.africa";

export function ContactForm() {
  const [status, setStatus] = React.useState<"idle" | "submitting" | "sent">(
    "idle"
  );

  /**
   * Hands the request to the visitor's mail client.
   *
   * This used to `setTimeout(600)` and then render "Request received —
   * we'll be in touch within one business day". Nothing was sent anywhere.
   * Every pilot enquiry went into the void while the sender believed it had
   * arrived, which is worse than having no form at all.
   *
   * mailto is the honest option that needs no backend: the message really
   * does leave, and the visitor can see that it did. Replace this with a
   * route handler once there is somewhere to put the leads.
   */
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");

    const form = new FormData(e.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();

    const body = [
      `Name: ${value("fullName")}`,
      `Work email: ${value("workEmail")}`,
      `Company: ${value("company")}`,
      `Phone: ${value("phone") || "—"}`,
      `Team size: ${value("teamSize") || "—"}`,
      "",
      "What they're trying to solve:",
      value("message") || "—",
    ].join("\n");

    const href =
      `mailto:${CONTACT_ADDRESS}` +
      `?subject=${encodeURIComponent(`Pilot request — ${value("company")}`)}` +
      `&body=${encodeURIComponent(body)}`;

    window.location.href = href;
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-sm border border-border bg-card px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-5" />
        </span>
        <h3 className="font-serif text-2xl">Your email app should be open.</h3>
        <p className="max-w-sm text-muted-foreground">
          Send the draft and we&apos;ll be in touch within one business day. If
          nothing opened, email us directly at{" "}
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

      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={status === "submitting"}>
          {status === "submitting" && <Loader2 className="animate-spin" />}
          Send request
        </Button>
      </div>
    </form>
  );
}
