import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyMuxWebhookSignature } from "@/lib/mux";

// POST /api/mux/webhook — Mux webhook endpoint.
// Handles video.asset.ready: stores the playback id on the lesson
// identified by the asset's passthrough (the lesson id set at upload
// creation). This is the "asset ready -> store playback id" step.
//
// Skeleton honesty: if SUPABASE_SERVICE_ROLE_KEY is not configured,
// the event is acknowledged but NOT stored, and the response says so.
// The Studio also lets a creator paste a playback id manually, so a
// missing webhook config does not silently look like success.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("mux-signature");
  const secretConfigured = Boolean(process.env.MUX_WEBHOOK_SECRET);
  if (!verifyMuxWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Mux webhook signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { id?: string; playback_ids?: Array<{ id?: string }>; passthrough?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.type !== "video.asset.ready") {
    // Acknowledge other events (e.g. video.asset.track.ready for
    // captions) without acting on them in MVP.
    return NextResponse.json({ received: true, handled: false, type: event.type ?? null });
  }

  const assetId = event.data?.id;
  const playbackId = event.data?.playback_ids?.[0]?.id;
  const lessonId = event.data?.passthrough;
  if (!assetId || !playbackId || !lessonId) {
    return NextResponse.json({
      received: true,
      stored: false,
      reason: "video.asset.ready was missing asset id, playback id, or lesson passthrough",
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({
      received: true,
      stored: false,
      reason: "SUPABASE_SERVICE_ROLE_KEY is not configured; playback id was not stored. Paste it manually in the Studio.",
      assetId,
      playbackId,
      lessonId,
    });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: lesson, error: fetchError } = await supabase
    .from("lessons")
    .select("id, content")
    .eq("id", lessonId)
    .single();
  if (fetchError || !lesson) {
    return NextResponse.json({ received: true, stored: false, reason: "Lesson not found for passthrough" }, { status: 404 });
  }

  const content = (lesson.content ?? { version: 1, blocks: [] }) as {
    version: number;
    blocks: Array<Record<string, unknown>>;
  };
  const blocks = Array.isArray(content.blocks) ? content.blocks : [];
  // Fill the first video block that has no playback id yet.
  const target = blocks.find((b) => b.kind === "video" && !b.mux_playback_id);
  if (!target) {
    return NextResponse.json({ received: true, stored: false, reason: "No video block without a playback id in this lesson" });
  }
  target.mux_asset_id = assetId;
  target.mux_playback_id = playbackId;

  const { error: updateError } = await supabase
    .from("lessons")
    .update({ content })
    .eq("id", lessonId);
  if (updateError) {
    return NextResponse.json({ received: true, stored: false, reason: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    received: true,
    stored: true,
    assetId,
    playbackId,
    lessonId,
    signatureVerified: secretConfigured,
  });
}
