import { NextResponse } from "next/server";
import { createMuxTextTrack } from "@/lib/mux";

// POST /api/mux/tracks { assetId, url, languageCode?, name? }
// Creates a Mux text track from a *publicly hosted* VTT/SRT URL.
// This is NOT the in-app VTT-text editor: Mux does not accept raw
// VTT text here, so edited text saved in a lesson block is rendered
// by the player from a blob URL instead (see README caption gap).
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      assetId?: string;
      url?: string;
      languageCode?: string;
      name?: string;
    };
    if (!body.assetId || !body.url) {
      return NextResponse.json({ error: "assetId and url are required" }, { status: 400 });
    }
    const result = await createMuxTextTrack({
      assetId: body.assetId,
      url: body.url,
      languageCode: body.languageCode,
      name: body.name,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mux track creation failed";
    const status = message.includes("not configured") ? 501 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
