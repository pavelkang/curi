"use client";

import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";

// In-browser recording: screen + camera headshot, composited on a canvas.
// - Screen: getDisplayMedia (video; audio if the browser/share allows it)
// - Camera: getUserMedia (video + mic audio)
// - Composite: screen fills a 1280x720 canvas, camera is picture-in-picture
//   bottom-right. Canvas stream + mic audio -> MediaRecorder (webm).
// - Preview, retake, then upload through the same Mux direct-upload
//   path as a file upload. Playback appears only after Mux processes
//   the asset and the webhook stores the playback id (or the creator
//   pastes a playback id manually in the Studio).
//
// Limits, stated plainly: this is a browser composite, not a desktop
// recorder. Quality depends on the browser, the recording is a single
// webm file, and there is no in-browser trimming in MVP. Retake instead.

type Mode = "screen-camera" | "screen-only" | "camera-only";

export default function Recorder({ lessonId, onUploaded, onLocalVideo }: {
  lessonId?: string;
  onUploaded?: (info: { uploadId: string }) => void;
  // Demo mode: called with the recorded blob when the teacher saves
  // the take in this browser. The caller persists it (IndexedDB) and
  // attaches it to the lesson's video block.
  onLocalVideo?: (blob: Blob) => void;
}) {
  const [mode, setMode] = useState<Mode>("screen-camera");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const startTimeRef = useRef<number>(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const rafRef = useRef<number>(0);
  const blobRef = useRef<Blob | null>(null);

  const stopTracks = () => {
    cancelAnimationFrame(rafRef.current);
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
  };

  useEffect(() => () => { stopTracks(); if (previewUrl) URL.revokeObjectURL(previewUrl); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recording timer: ticks once a second while recording.
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const drawLoop = () => {
    const canvas = canvasRef.current;
    const screen = screenVideoRef.current;
    const camera = cameraVideoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (mode !== "camera-only" && screen && screen.readyState >= 2) {
      ctx.drawImage(screen, 0, 0, canvas.width, canvas.height);
    }
    if (mode !== "screen-only" && camera && camera.readyState >= 2) {
      const w = 320;
      const h = 180;
      const x = canvas.width - w - 16;
      const y = canvas.height - h - 16;
      ctx.drawImage(camera, x, y, w, h);
      ctx.strokeStyle = "#fff";
      ctx.strokeRect(x, y, w, h);
    }
    if (mode === "camera-only" && camera && camera.readyState >= 2) {
      ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
    }
    rafRef.current = requestAnimationFrame(drawLoop);
  };

  const start = async () => {
    setError("");
    setStatus("");
    setPreviewUrl(null);
    blobRef.current = null;
    chunksRef.current = [];
    try {
      const streams: MediaStream[] = [];
      let screenStream: MediaStream | null = null;
      let cameraStream: MediaStream | null = null;

      if (mode !== "camera-only") {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        streams.push(screenStream);
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = screenStream;
          await screenVideoRef.current.play().catch(() => {});
        }
      }
      if (mode !== "screen-only") {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streams.push(cameraStream);
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = cameraStream;
          await cameraVideoRef.current.play().catch(() => {});
        }
      }
      streamsRef.current = streams;

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas is not available");
      rafRef.current = requestAnimationFrame(drawLoop);
      const canvasStream = canvas.captureStream(30);
      const audioTracks: MediaStreamTrack[] = [];
      // Prefer mic audio; fall back to screen audio if there is no mic.
      const micAudio = cameraStream?.getAudioTracks()[0];
      const screenAudio = screenStream?.getAudioTracks()[0];
      if (micAudio) audioTracks.push(micAudio);
      else if (screenAudio) audioTracks.push(screenAudio);
      const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setStatus(`Recorded ${(blob.size / 1_000_000).toFixed(1)} MB. Preview it, retake, or upload.`);
        stopTracks();
      };
      recorderRef.current = recorder;
      recorder.start(250);
      startTimeRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start recording. Check screen/camera/mic permissions.");
      stopTracks();
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const saveLocal = () => {
    const blob = blobRef.current;
    if (!blob) return;
    onLocalVideo?.(blob);
    setStatus(`Take saved in this browser (${(blob.size / 1_000_000).toFixed(1)} MB). Save the lesson to keep it.`);
  };

  const upload = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    if (!isSupabaseConfigured) {
      // Unreachable in the UI (the upload button is hidden in demo
      // mode), kept as a guard so a take is never silently dropped.
      setError("Video upload needs a connection. In demo mode, save the take in this browser instead.");
      return;
    }
    setError("");
    setStatus("Creating upload…");
    try {
      const res = await fetch("/api/mux/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      if (!res.ok) throw new Error(`Upload creation failed (${res.status}): ${await res.text()}`);
      const { uploadUrl, uploadId } = (await res.json()) as { uploadUrl: string; uploadId: string };
      setStatus("Uploading…");
      const put = await fetch(uploadUrl, { method: "PUT", body: blob });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setStatus("Uploaded. Processing takes a few minutes.");
      onUploaded?.({ uploadId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStatus("");
    }
  };

  return (
    <Card>
      <VStack gap={4}>
        <Heading level={3}>Record in browser</Heading>
        <HStack gap={3} vAlign="end">
          <Selector
            label="Mode"
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { value: "screen-camera", label: "Screen + camera" },
              { value: "screen-only", label: "Screen only" },
              { value: "camera-only", label: "Camera only" },
            ]}
            isDisabled={recording}
            width={240}
          />
          {!recording ? (
            <Button label="Start recording" onClick={start} />
          ) : (
            <>
              <Button label="Stop recording" onClick={stop} />
              <Text weight="semibold" aria-live="off">Recording {formatElapsed(elapsed)}</Text>
            </>
          )}
          {previewUrl && !isSupabaseConfigured && (
            <Button label="Save take in this browser" onClick={saveLocal} />
          )}
          {previewUrl && isSupabaseConfigured && (
            <Button label="Upload recording" variant="secondary" onClick={upload} />
          )}
          {previewUrl && (
            <Button
              label="Retake"
              variant="ghost"
              onClick={() => { setPreviewUrl(null); blobRef.current = null; setStatus(""); }}
            />
          )}
        </HStack>
        {!isSupabaseConfigured && (
          <Text type="supporting">Takes are saved in this browser only.</Text>
        )}
        {/* Hidden source videos feed the canvas; the canvas is the preview. */}
        <video ref={screenVideoRef} muted playsInline className="hidden" />
        <video ref={cameraVideoRef} muted playsInline className="hidden" />
        <canvas ref={canvasRef} width={1280} height={720} className="w-full max-w-2xl rounded-lg bg-black" />
        {previewUrl && (
          <div className="space-y-2">
            <Text weight="semibold">Preview</Text>
            <video src={previewUrl} controls className="w-full max-w-2xl rounded-lg" />
          </div>
        )}
        {status && <Text type="supporting">{status}</Text>}
        {error && <p className="text-sm text-error">{error}</p>}
        <Text type="supporting">No trimming. If a take is wrong, retake it.</Text>
      </VStack>
    </Card>
  );
}
