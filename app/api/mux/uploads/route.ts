import { NextResponse } from "next/server";
import { createMuxDirectUpload } from "@/lib/mux";

// POST /api/mux/uploads { lessonId?: string }
// Returns a Mux direct-upload URL the browser PUTs the file to.
// The browser never sees Mux credentials. Auto captions (English)
// are requested at upload creation; see lib/mux.ts.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { lessonId?: string };
    const result = await createMuxDirectUpload({ lessonId: body.lessonId });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mux upload creation failed";
    const status = message.includes("not configured") ? 501 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
