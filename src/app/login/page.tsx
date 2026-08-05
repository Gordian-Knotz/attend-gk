"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const initialMode = searchParams.get("mode") === "sign-up" ? "sign-up" : "sign-in";

  const [mode, setMode] = React.useState<"sign-in" | "sign-up">(initialMode);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [info, setInfo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function routeSignedInUser(supabase: ReturnType<typeof createClient>) {
    if (next) {
      router.push(next);
      router.refresh();
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: employee } = await supabase
      .from("employees")
      .select("role")
      .eq("id", user?.id ?? "")
      .maybeSingle();

    if (!employee) {
      router.push("/onboarding");
    } else if (employee.role === "staff") {
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

    const supabase = createClient();

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      await routeSignedInUser(supabase);
      return;
    }

    // sign-up
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (!data.session) {
      setInfo(
        "Check your inbox to confirm your email, then sign in — we'll walk you through setting up your organization next."
      );
      setMode("sign-in");
      return;
    }

    // email confirmation is off for this project — session exists already
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-xl">Attend</span>
            <span className="font-serif text-xl italic text-primary">Pac</span>
          </div>
          <CardTitle className="mt-4">
            {mode === "sign-in" ? "Sign in" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {mode === "sign-in"
              ? "Staff: use the email your admin set up for you. Admins: your usual login."
              : "You'll be set up as the admin for a new organization in the next step."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            {info && <p className="text-sm text-muted-foreground">{info}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={loading} className="mt-1">
              {loading && <Loader2 className="animate-spin" />}
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setInfo(null);
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              }}
              className="text-center text-xs text-muted-foreground hover:text-foreground"
            >
              {mode === "sign-in"
                ? "New here? Create an organization"
                : "Already have an account? Sign in"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
