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

export function ContactForm() {
  const [status, setStatus] = React.useState<"idle" | "submitting" | "sent">(
    "idle"
  );

  // Not wired to a backend yet — see README "Next steps". Once Supabase is
  // in place this should insert into a `pilot_requests` table or POST to a
  // route handler that forwards to email/CRM.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    window.setTimeout(() => setStatus("sent"), 600);
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-sm border border-border bg-card px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-5" />
        </span>
        <h3 className="font-serif text-2xl">Request received.</h3>
        <p className="max-w-sm text-muted-foreground">
          Thanks — we&apos;ll be in touch within one business day to set up
          your pilot.
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
