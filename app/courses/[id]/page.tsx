import { Suspense } from "react";
import CourseDetail from "@/components/CourseDetail";

// Server route page (Next 16 + Cache Components): params are a Promise.
// Awaiting them inside a Suspense-boundary child lets the route still
// produce a static shell (the fallback) at prerender time, with the
// per-course content streaming in after.
async function CourseLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseDetail courseId={id} />;
}

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CourseLoader params={params} />
    </Suspense>
  );
}
