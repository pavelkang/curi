"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

  const linkClass = (href: string, activeWhenStartsWith = false) =>
    cn(
      "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
      (activeWhenStartsWith ? pathname.startsWith(href) : pathname === href)
        ? "bg-primary/10 text-primary"
        : "text-slate-600 hover:bg-secondary hover:text-primary",
    );

  return (
    <header className="sticky top-0 z-50 border-b border-base-300 bg-white">
      <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-1 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="mr-2 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
            <BookOpen className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">Curi</span>
        </Link>
        <Link href="/" className={linkClass("/", true)}>
          Courses
        </Link>
        {(isCreator || demoMode) && (
          <Link href="/studio" className={linkClass("/studio")}>
            Studio
          </Link>
        )}
        {demoMode && <Badge variant="secondary" className="ml-1">Demo</Badge>}
        <span className="ml-auto flex items-center gap-3">
          {email ? (
            <>
              <span className="hidden max-w-56 truncate text-sm text-slate-600 sm:inline">
                {email}
                {isCreator ? " · creator" : ""}
              </span>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link href="/auth">Sign in</Link>
            </Button>
          )}
        </span>
      </nav>
    </header>
  );
}
