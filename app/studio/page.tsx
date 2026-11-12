"use client";

// Studio landing: deliberately plain. The folder tree on the left is
// the structure; this area is just orientation, not another layer of
// cards. Courses, sections, and lessons are created from the sidebar
// and edited on their own pages.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Link } from "@astryxdesign/core/Link";
import { useStudio } from "@/lib/studio-store";
import OfflineDraftsQueue from "@/components/OfflineDraftsQueue";

// Checklist reads localStorage in its initializer, so it loads
// client-only (ssr:false) rather than risking a hydration mismatch.
const TeacherChecklist = dynamic(() => import("@/components/TeacherChecklist"), { ssr: false });

export default function StudioHomePage() {
  const studio = useStudio();
  // Local mounted flag, not the store's `hydrated` — see StudioShell:
  // the provider's mount effect flips the store flag before this
  // streamed boundary hydrates, which mismatches hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <Text type="supporting">Loading Studio…</Text>;
  if (!studio.demoMode && !studio.userId) {
    return (
      <VStack gap={2}>
        <Heading level={2}>Studio</Heading>
        <Text>
          <Link href="/auth">Sign in</Link> to use the Studio.
        </Text>
      </VStack>
    );
  }
  if (!studio.demoMode && !studio.isCreator) {
    return (
      <VStack gap={2}>
        <Heading level={2}>Studio</Heading>
        <Text>Your account is not flagged as a creator yet.</Text>
      </VStack>
    );
  }

  return (
    <VStack gap={4}>
      <Heading level={2}>Studio</Heading>
      <Text type="supporting">Pick a course in the sidebar, or press + Course to start one.</Text>
      {studio.error && <Text>{studio.error}</Text>}
      <TeacherChecklist />
      <OfflineDraftsQueue />
    </VStack>
  );
}
