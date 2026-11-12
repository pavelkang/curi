"use client";

import dynamic from "next/dynamic";
import type { LessonContent } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import VideoBlock from "./VideoBlock";
import QuizBlock from "./QuizBlock";
import { Card } from "@/components/ui/card";
import { Text } from "@astryxdesign/core/Text";

// TLDraw needs the browser (canvas, window). Load the whiteboard
// block client-only; a student still sees the drawing, rendered
// read-only from the stored snapshot.
const WhiteboardBlock = dynamic(() => import("./WhiteboardBlock"), { ssr: false });

// Custom lesson-page renderer. Blocks render in stored order.
// No generic LMS chrome, no locking, no auto-advance.
export default function LessonRenderer({ content }: { content: LessonContent }) {
  if (content.blocks.length === 0) {
    return (
      <Card>
        <Text type="supporting">This lesson has no blocks yet.</Text>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {content.blocks.map((block) => {
        if (block.kind === "video") return <VideoBlock key={block.id} block={block} />;
        if (block.kind === "quiz") return <QuizBlock key={block.id} block={block} />;
        if (block.kind === "whiteboard") return <WhiteboardBlock key={block.id} snapshot={block.snapshot} />;
        return (
          <article
            key={block.id}
            className="markdown-body rounded-lg border border-border bg-surface px-6 py-6 shadow-none sm:px-8"
            // Content is escaped in renderMarkdown; this is the one place
            // we intentionally inject the rendered HTML it produces.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(block.markdown) }}
          />
        );
      })}
    </div>
  );
}
