"use client";

import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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

export default function Recorder({ lessonId, onUploaded }: { lessonId?: string; onUploaded?: (info: { uploadId: string }) => void }) {
  const [mode, setMode] = useState<Mode>("screen-camera");
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

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

  const upload = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    if (!isSupabaseConfigured) {
      setError("Demo mode: video upload needs Mux and Supabase. Recording preview and retake still work locally.");
      return;
    }
    setError("");
    setStatus("Creating Mux upload…");
    try {
      const res = await fetch("/api/mux/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      if (!res.ok) throw new Error(`Upload creation failed (${res.status}): ${await res.text()}`);
      const { uploadUrl, uploadId } = (await res.json()) as { uploadUrl: string; uploadId: string };
      setStatus("Uploading to Mux…");
      const put = await fetch(uploadUrl, { method: "PUT", body: blob });
      if (!put.ok) throw new Error(`Mux upload failed (${put.status})`);
      setStatus("Uploaded. Mux is processing. Playback will appear after the webhook stores it, or paste the playback id manually in the Studio.");
      onUploaded?.({ uploadId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStatus("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record in browser</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-1">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)} disabled={recording}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="screen-camera">Screen + camera headshot</SelectItem>
                <SelectItem value="screen-only">Screen only</SelectItem>
                <SelectItem value="camera-only">Camera only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!recording ? (
            <Button onClick={start}>Start recording</Button>
          ) : (
            <Button onClick={stop}>Stop recording</Button>
          )}
          {previewUrl && (
            <Button variant="outline" onClick={upload} disabled={!isSupabaseConfigured}>
              Upload recording to Mux
            </Button>
          )}
          {previewUrl && (
            <Button variant="ghost" onClick={() => { setPreviewUrl(null); blobRef.current = null; setStatus(""); }}>
              Retake
            </Button>
          )}
        </div>
        {!isSupabaseConfigured && (
          <p className="text-sm text-base-content/60">
            Demo mode: upload to Mux is disabled. Recording preview and retake work locally.
          </p>
        )}
        {/* Hidden source videos feed the canvas; the canvas is the preview. */}
        <video ref={screenVideoRef} muted playsInline className="hidden" />
        <video ref={cameraVideoRef} muted playsInline className="hidden" />
        <canvas ref={canvasRef} width={1280} height={720} className="w-full max-w-2xl rounded-lg bg-black" />
        {previewUrl && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Preview</p>
            <video src={previewUrl} controls className="w-full max-w-2xl rounded-lg" />
          </div>
        )}
        {status && <p className="text-sm text-base-content/60">{status}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-sm text-base-content/60">No trimming in MVP. If a take is wrong, retake it.</p>
      </CardContent>
    </Card>
  );
}
