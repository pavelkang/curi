"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import type { VideoBlock as VideoBlockType } from "@/lib/content";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getLocalVideoUrl } from "@/lib/local-video";
import { Card } from "@/components/ui/card";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * Video playback.
 * - Mux: the public HLS URL. Auto captions: when the asset was created
 *   with generated_subtitles (see lib/mux.ts), Mux attaches the generated
 *   track to the HLS manifest and the browser's native <track>/caption
 *   controls expose it. If the creator supplied an explicit
 *   caption_track_url, it is used as a <track>. If they edited caption
 *   text in the Studio, that VTT text is rendered from a blob URL so it
 *   actually displays in this player.
 * - Demo local take: a blob saved in this browser (IndexedDB,
 *   lib/local-video.ts), referenced by block.local_video_id. It plays
 *   here in this browser only.
 * No playback is faked: without a playback id or a local take there is
 * no video, and the UI says so.
 */
export default function VideoBlock({ block }: { block: VideoBlockType }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [localMissing, setLocalMissing] = useState(false);

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

  useEffect(() => {
    if (!block.local_video_id) {
      setLocalUrl(null);
      setLocalMissing(false);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    setLocalMissing(false);
    getLocalVideoUrl(block.local_video_id)
      .then((u) => {
        if (cancelled) return;
        if (!u) setLocalMissing(true);
        else {
          url = u;
          setLocalUrl(u);
        }
      })
      .catch(() => {
        if (!cancelled) setLocalMissing(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [block.local_video_id]);

  // A locally saved take plays in this browser. Mux wins only when
  // there is no local take.
  if (localUrl) {
    return (
      <div className="space-y-3">
        {block.title && <Heading level={3}>{block.title}</Heading>}
        <video controls src={localUrl} className="w-full overflow-hidden rounded-lg border border-border bg-black" preload="metadata">
          Your browser does not support video playback.
        </video>
        <Text type="supporting">Saved in this browser only.</Text>
      </div>
    );
  }

  if (!block.mux_playback_id) {
    if (localMissing) {
      return (
        <Card>
          <VStack gap={2}>
            <Heading level={3}>{block.title ?? "Video"}</Heading>
            <Text type="supporting">This take was saved in another browser, or was deleted. Record or pick a video again.</Text>
          </VStack>
        </Card>
      );
    }
    return (
      <Card>
        <VStack gap={3}>
          <div className="flex items-center justify-between gap-2">
            <Heading level={3}>{block.title ?? "Video"}</Heading>
            {!isSupabaseConfigured && <Badge label="Demo" variant="neutral" />}
          </div>
          <div className="flex aspect-video items-center justify-center rounded-lg border border-border bg-accent-muted">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-bg text-on-accent">
              <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />
            </span>
          </div>
          <Text type="supporting">No video yet.</Text>
        </VStack>
      </Card>
    );
  }

  const src = `https://stream.mux.com/${block.mux_playback_id}.m3u8`;
  const trackSrc = block.caption_track_url ?? blobUrl ?? undefined;

  return (
    <div className="space-y-3">
      {block.title && <Heading level={3}>{block.title}</Heading>}
      <video controls className="w-full overflow-hidden rounded-lg border border-border bg-black" preload="metadata">
        <source src={src} type="application/x-mpegURL" />
        {trackSrc && <track kind="subtitles" src={trackSrc} srcLang="en" label="English" default />}
        Your browser does not support video playback.
      </video>
      <Text type="supporting">Captions: use the player&apos;s CC control.</Text>
    </div>
  );
}
