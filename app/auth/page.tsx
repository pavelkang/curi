"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Email/password only for MVP. Google OAuth is intentionally NOT
// wired here; add it later with Supabase's OAuth flow.
// In demo mode (no Supabase configured) this page does NOT fake a
// login: it explains no-backend mode and links to the Studio, which
// starts empty (demo seeding was removed 2026-11-03).
export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    const supabase = createClient();
    if (mode === "signin") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
      else window.location.href = "/";
    } else {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) setError(err.message);
      else setMessage("Account created. If email confirmation is on in Supabase, confirm your email, then sign in.");
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-md space-y-6 pt-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">C</span>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-slate-900">Welcome to Curi</h1>
          <p className="text-sm leading-relaxed text-slate-500">Demo mode — sign-in is not available yet.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Demo mode — sign-in is not available</CardTitle>
            <CardDescription>
              No backend is connected, so there is no account to sign in to. This page does not fake a login.
              You can still open the Studio, which starts empty — create a course there and it is
              stored in this browser only, not in Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/studio">Try the Studio</Link>
            </Button>
            <p className="text-sm text-base-content/60">
              To use real accounts, connect Supabase: see the README for .env.local setup. Then this page becomes the
              normal sign-in / sign-up form.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pt-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">C</span>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-slate-900">Welcome to Curi</h1>
        <p className="text-sm leading-relaxed text-slate-500">Sign in to learn and track your progress.</p>
      </div>
      <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>
        <TabsContent value="signin">
          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Sign in to browse published courses and save your progress.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full">
                  Sign in
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="signup">
          <Card>
            <CardHeader>
              <CardTitle>Create account</CardTitle>
              <CardDescription>Create an account to learn and track your progress.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signup">Email</Label>
                  <Input id="email-signup" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signup">Password</Label>
                  <Input id="password-signup" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full">
                  Sign up
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {message && <p className="rounded-2xl border border-base-300 bg-secondary px-4 py-3 text-sm text-primary">{message}</p>}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    </div>
  );
}
