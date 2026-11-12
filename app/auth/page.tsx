"use client";

import { useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TabList } from "@astryxdesign/core/TabList";
import { Tab } from "@astryxdesign/core/TabList";
import { VStack } from "@astryxdesign/core/VStack";

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
      else setMessage("Account created. Confirm your email, then sign in.");
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-md space-y-6 pt-6">
        <VStack gap={2}>
          <Heading level={1}>Welcome to Curi</Heading>
          <Text type="supporting">Demo mode — sign-in is not available yet.</Text>
        </VStack>
        <Card>
          <VStack gap={3}>
            <Heading level={3}>Demo mode</Heading>
            <Text type="supporting">No backend is connected, so there is no account to sign in to.</Text>
            <Button label="Try the Studio" href="/studio" />
          </VStack>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pt-6">
      <VStack gap={2}>
        <Heading level={1}>Welcome to Curi</Heading>
        <Text type="supporting">Sign in to learn and track your progress.</Text>
      </VStack>
      <TabList value={mode} onChange={(v) => setMode(v as "signin" | "signup")} layout="fill">
        <Tab value="signin" label="Sign in" />
        <Tab value="signup" label="Create account" />
      </TabList>
      <Card>
        <form onSubmit={submit}>
          <VStack gap={4}>
            <Heading level={3}>{mode === "signin" ? "Sign in" : "Create account"}</Heading>
            <TextInput
              label="Email"
              type="email"
              value={email}
              onChange={(v) => setEmail(v)}
              isRequired
              autoComplete="email"
              width="100%"
            />
            <TextInput
              label="Password"
              type="password"
              value={password}
              onChange={(v) => setPassword(v)}
              isRequired
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              width="100%"
            />
            <Button label={mode === "signin" ? "Sign in" : "Sign up"} type="submit" />
          </VStack>
        </form>
      </Card>
      {message && <Text>{message}</Text>}
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
