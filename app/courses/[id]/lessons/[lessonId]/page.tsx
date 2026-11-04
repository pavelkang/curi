import { Suspense } from "react";
import LessonDetail from "@/components/LessonDetail";

async function LessonLoader({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = await params;
  return <LessonDetail courseId={id} lessonId={lessonId} />;
}

export default function LessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <LessonLoader params={params} />
    </Suspense>
  );
}
