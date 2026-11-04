"use client";

import type { LessonContent } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import VideoBlock from "./VideoBlock";
import QuizBlock from "./QuizBlock";
import { Card, CardContent } from "@/components/ui/card";

// Custom lesson-page renderer. Blocks render in stored order.
// No generic LMS chrome, no locking, no auto-advance.
export default function LessonRenderer({ content }: { content: LessonContent }) {
  if (content.blocks.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-base-content/60">This lesson has no blocks yet. The creator has not added content.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {content.blocks.map((block) => {
        if (block.kind === "video") return <VideoBlock key={block.id} block={block} />;
        if (block.kind === "quiz") return <QuizBlock key={block.id} block={block} />;
        return (
          <article
            key={block.id}
            className="markdown-body rounded-[20px] border border-base-300 bg-white px-6 py-6 shadow-none sm:px-8"
            // Content is escaped in renderMarkdown; this is the one place
            // we intentionally inject the rendered HTML it produces.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(block.markdown) }}
          />
        );
      })}
    </div>
  );
}
