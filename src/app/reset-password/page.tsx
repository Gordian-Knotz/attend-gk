"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
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

/**
 * Landing page for the reset link emailed by /login → "Forgot password?".
 *
 * The browser client detects the recovery code in the URL and exchanges it
 * for a session on load, so by the time this renders the user is briefly
 * authenticated — just long enough to set a new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();

  const [ready, setReady] = React.useState(false);
  const [linkValid, setLinkValid] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();

    // The code→session exchange happens asynchronously on mount, so watch
    // for it rather than reading the session once and guessing.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setLinkValid(true);
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setLinkValid(true);
      setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
    await supabase.auth.signOut();
    window.setTimeout(() => router.push("/login"), 1800);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <Reveal className="w-full max-w-sm" distance={14} duration={0.45}>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-xl">Attend</span>
            <span className="font-serif text-xl italic text-primary">Pac</span>
          </div>
          <CardTitle className="mt-4">
            {done ? "Password updated" : "Set a new password"}
          </CardTitle>
          <CardDescription>
            {done
              ? "Taking you back to sign in…"
              : "Choose a new password for your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!ready && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking your link…
            </p>
          )}

          {ready && !linkValid && !done && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                This reset link has expired or has already been used. Request a
                fresh one and it&apos;ll arrive in a moment.
              </p>
              <Link href="/login">
                <Button className="w-full">Back to sign in</Button>
              </Link>
            </div>
          )}

          {ready && linkValid && !done && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={loading} className="mt-1">
                {loading && <Loader2 className="animate-spin" />}
                Update password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      </Reveal>
    </div>
  );
}
