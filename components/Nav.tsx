"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TopNav } from "@astryxdesign/core/TopNav";
import { TopNavItem } from "@astryxdesign/core/TopNav";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

const demoMode = !isSupabaseConfigured;

export default function Nav() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      setEmail(user?.email ?? null);
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_creator")
          .eq("id", user.id)
          .single();
        setIsCreator(Boolean(profile?.is_creator));
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <TopNav
      heading={
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-bg text-on-accent">
            <span className="text-lg font-bold">C</span>
          </span>
          <span className="text-lg font-bold tracking-tight text-primary">Curi</span>
        </Link>
      }
      endContent={
        <span className="flex items-center gap-3">
          {email && (
            <Text type="supporting" maxLines={1}>
              {email}
              {isCreator ? " · creator" : ""}
            </Text>
          )}
          {email ? (
            <Button label="Sign out" variant="secondary" size="sm" onClick={signOut} />
          ) : (
            <Button label="Sign in" variant="primary" size="sm" href="/auth" as={Link} />
          )}
        </span>
      }
    >
      <TopNavItem label="Courses" href="/" isSelected={pathname === "/"} />
      {(isCreator || demoMode) && (
        <TopNavItem label="Studio" href="/studio" isSelected={pathname.startsWith("/studio")} />
      )}
      {demoMode && <Badge label="Demo" variant="neutral" />}
    </TopNav>
  );
}
