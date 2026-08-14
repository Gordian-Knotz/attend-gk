"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { requestPasswordReset, signIn, signUp } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Reveal } from "@/components/motion/reveal";
import { Wordmark } from "@/components/brand/wordmark";

type Mode = "sign-in" | "sign-up" | "forgot";

const COPY: Record<Mode, { title: string; description: string; submit: string }> = {
  "sign-in": {
    title: "Sign in",
    description:
      "Staff: use the email your admin set up for you. Admins: your usual login.",
    submit: "Sign in",
  },
  "sign-up": {
    title: "Create your account",
    description:
      "You'll be set up as the admin for a new organization in the next step.",
    submit: "Create account",
  },
  forgot: {
    title: "Reset your password",
    description: "We'll email you a link to set a new one.",
    submit: "Send reset link",
  },
};

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}

/**
 * `?next=` is attacker-controlled: anyone can send a victim a
 * `/login?next=https://evil.example` link, and the redirect fires the
 * instant they finish typing their password — which is the worst possible
 * moment to hand someone to a look-alike site.
 *
 * Only same-origin *relative* paths are accepted. Rejects absolute URLs,
 * protocol-relative `//host`, backslash variants that some parsers
 * normalise to slashes, and `javascript:` / `data:` schemes.
 */
function safeNext(value: string | null): string | null {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return null;
  if (candidate.includes("\\")) return null;
  // A control character can smuggle a scheme past the checks above.
  if (/[\u0000-\u001F\u007F]/.test(candidate)) return null;
  return candidate;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const initialMode: Mode =
    searchParams.get("mode") === "sign-up" ? "sign-up" : "sign-in";

  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [info, setInfo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  function switchTo(nextMode: Mode) {
    setError(null);
    setInfo(null);
    setMode(nextMode);
  }

  /** Sign-in and sign-up both land here once a session exists. */
  function routeTo(role: "onboarding" | "staff" | "admin") {
    const destination = safeNext(next);
    if (destination) {
      router.push(destination);
    } else if (role === "onboarding") {
      router.push("/onboarding");
    } else if (role === "staff") {
      router.push("/dashboard");
    } else {
      router.push("/admin");
    }
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      // These go through server actions rather than the browser Supabase
      // client so our own rate limits can see them — see login/actions.ts.
      if (mode === "forgot") {
        // No origin argument: the server resolves it. Passing
        // window.location.origin let an attacker choose where a genuine
        // Supabase recovery email pointed — see login/actions.ts.
        const result = await requestPasswordReset(email);
        if (result.error) {
          setError(result.error);
          return;
        }
        setInfo(
          "If that address has an account, a reset link is on its way. It expires in an hour — request another if it lapses."
        );
        return;
      }

      const result =
        mode === "sign-in"
          ? await signIn(email, password)
          : await signUp(email, password);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.needsConfirmation) {
        setInfo(
          "Check your inbox to confirm your email, then sign in — we'll walk you through setting up your organization next."
        );
        setMode("sign-in");
        return;
      }

      if (result.role) routeTo(result.role);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const copy = COPY[mode];

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <Reveal className="w-full max-w-sm" distance={14} duration={0.45}>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-baseline gap-1.5">
            <Wordmark size="xl" />
          </div>
          <CardTitle className="mt-4">{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {mode !== "forgot" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="password">Password</Label>
                  {mode === "sign-in" && (
                    <button
                      type="button"
                      onClick={() => switchTo("forgot")}
                      className="rounded-sm text-xs text-muted-foreground hover:text-primary"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
            )}

            {info && <p className="text-sm text-muted-foreground">{info}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={loading} className="mt-1">
              {loading && <Loader2 className="animate-spin" />}
              {copy.submit}
            </Button>

            <button
              type="button"
              onClick={() =>
                switchTo(
                  mode === "sign-in"
                    ? "sign-up"
                    : mode === "sign-up"
                      ? "sign-in"
                      : "sign-in"
                )
              }
              className="text-center text-xs text-muted-foreground hover:text-foreground"
            >
              {mode === "sign-in" && "New here? Create an organization"}
              {mode === "sign-up" && "Already have an account? Sign in"}
              {mode === "forgot" && "Back to sign in"}
            </button>
          </form>
        </CardContent>
      </Card>
      </Reveal>
    </div>
  );
}
