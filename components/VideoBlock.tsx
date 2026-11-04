"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import type { VideoBlock as VideoBlockType } from "@/lib/content";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Mux playback via the public HLS URL.
 * Auto captions: when the asset was created with generated_subtitles
 * (see lib/mux.ts), Mux attaches the generated track to the HLS
 * manifest and the browser's native <track>/caption controls expose it.
 * If the creator supplied an explicit caption_track_url, it is used as
 * a <track>. If they edited caption text in the Studio, that VTT text
 * is rendered from a blob URL so it actually displays in this player.
 * No caption behaviour is faked: without a playback id there is no
 * video, and the UI says so. In demo mode (no Supabase configured),
 * a missing playback id is a labeled placeholder panel, not fake playback.
 */
export default function VideoBlock({ block }: { block: VideoBlockType }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!block.caption_text) {
      setBlobUrl(null);
      return;
    }
    const blob = new Blob([block.caption_text], { type: "text/vtt" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [block.caption_text]);

  if (!block.mux_playback_id) {
    if (!isSupabaseConfigured) {
      return (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{block.title ?? "Video"}</CardTitle>
            <Badge variant="secondary">Demo placeholder</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex aspect-video items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white">
                  <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />
                </span>
                <p className="text-sm font-medium text-primary">Demo video placeholder — no real video in demo mode</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              In live mode this block plays a real Mux video. Demo mode has no video and does not fake playback.
            </p>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>{block.title ?? "Video"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-base-content/60">
            Video is not ready yet. The creator uploaded it and Mux is still processing it, or no playback id has been saved for this block.
          </p>
          {block.mux_asset_id && <p className="text-sm text-base-content/60">Asset id: {block.mux_asset_id}</p>}
        </CardContent>
      </Card>
    );
  }

  const src = `https://stream.mux.com/${block.mux_playback_id}.m3u8`;
  const trackSrc = block.caption_track_url ?? blobUrl ?? undefined;

  return (
    <div className="space-y-3">
      {block.title && <h3 className="text-lg font-semibold text-slate-900">{block.title}</h3>}
      <video controls className="w-full overflow-hidden rounded-xl border border-base-300 bg-black" preload="metadata">
        <source src={src} type="application/x-mpegURL" />
        {trackSrc && <track kind="subtitles" src={trackSrc} srcLang="en" label="English" default />}
        Your browser does not support video playback.
      </video>
      <p className="text-sm text-base-content/60">
        Captions: Mux auto captions when available on this asset
        {block.caption_track_url ? " · creator caption file" : ""}
        {block.caption_text ? " · creator-edited captions (stored in this lesson)" : ""}. Use the player&apos;s CC control
        to turn captions on or off.
      </p>
    </div>
  );
}
