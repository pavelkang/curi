"use client";

// Record-whiteboard mode: the whiteboard is the lesson, full-screen,
// and the creator's camera is a small picture-in-picture at the
// corner while they talk and draw.
//
// How it records (same composite as components/Recorder.tsx — the
// browser has no DOM-capture API for the TLDraw canvas, so the take
// is a screen capture of this tab, composited with the camera):
// - Screen: getDisplayMedia — the teacher picks THIS tab when the
//   browser asks. The whiteboard fills the frame.
// - Camera: getUserMedia (video + mic). Shown as a monitor in the
//   corner while recording, and drawn into the recorded frame as a
//   320x180 PiP, bottom-right.
// - Composite: screen + camera on a 1280x720 canvas, mic audio,
//   MediaRecorder webm. Preview, retake, then "Save take" hands the
//   blob to the lesson page, which attaches it to a video block
//   (local take in demo mode, Mux upload path in live mode — the
//   upload itself is NOT reimplemented here).
//
// Honest limits: no camera on this machine → the corner shows a
// "No camera" note and the take is screen-only. Headless browsers
// cannot grant screen share, so recording itself cannot be verified
// there; the mode opening, the PiP monitor, and the error path can.

import { useEffect, useRef, useState } from "react";
import WhiteboardCanvas from "./WhiteboardCanvas";
import { Button } from "@/components/ui/button";
import { Text } from "@astryxdesign/core/Text";

export default function WhiteboardRecorder({
  snapshot,
  onSnapshot,
  onTake,
  onClose,
}: {
  snapshot?: unknown;
  onSnapshot: (doc: unknown) => void;
  onTake: (blob: Blob) => void;
  onClose: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const startTimeRef = useRef<number>(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const blobRef = useRef<Blob | null>(null);

  const stopTracks = () => {
    cancelAnimationFrame(rafRef.current);
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    cameraStreamRef.current = null;
  };

  // Camera monitor: start on mount so the teacher sees themselves
  // while drawing, before recording. No camera → corner note, the
  // whiteboard still works and recording is screen-only.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          await cameraVideoRef.current.play().catch(() => {});
        }
        setCameraOn(true);
      })
      .catch(() => {
        if (!cancelled) setCameraOn(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { stopTracks(); if (previewUrl) URL.revokeObjectURL(previewUrl); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (screen && screen.readyState >= 2) {
      ctx.drawImage(screen, 0, 0, canvas.width, canvas.height);
    }
    if (cameraOn && camera && camera.readyState >= 2) {
      const w = 320;
      const h = 180;
      const x = canvas.width - w - 16;
      const y = canvas.height - h - 16;
      ctx.drawImage(camera, x, y, w, h);
      ctx.strokeStyle = "#fff";
      ctx.strokeRect(x, y, w, h);
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
      // Screen share of this tab: the whiteboard is the lesson.
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const streams: MediaStream[] = [screenStream];
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = screenStream;
        await screenVideoRef.current.play().catch(() => {});
      }
      // Reuse the monitor camera stream if it is still live.
      let cameraStream = cameraStreamRef.current;
      if (!cameraStream || cameraStream.getVideoTracks().every((t) => t.readyState === "ended")) {
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          cameraStreamRef.current = cameraStream;
          if (cameraVideoRef.current) {
            cameraVideoRef.current.srcObject = cameraStream;
            await cameraVideoRef.current.play().catch(() => {});
          }
          setCameraOn(true);
        } catch {
          cameraStream = null;
          setCameraOn(false);
        }
      }
      if (cameraStream) streams.push(cameraStream);
      streamsRef.current = streams;

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas is not available");
      rafRef.current = requestAnimationFrame(drawLoop);
      const canvasStream = canvas.captureStream(30);
      const audioTracks: MediaStreamTrack[] = [];
      const micAudio = cameraStream?.getAudioTracks()[0];
      const screenAudio = screenStream.getAudioTracks()[0];
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
        setPreviewUrl(URL.createObjectURL(blob));
        setStatus(`Recorded ${(blob.size / 1_000_000).toFixed(1)} MB. Preview it, retake, or save the take.`);
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

  const saveTake = () => {
    const blob = blobRef.current;
    if (!blob) return;
    onTake(blob);
    setStatus("Take saved. It was added as a video block after this whiteboard.");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-label="Record whiteboard">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Text weight="semibold">Record whiteboard</Text>
        {!recording ? (
          <Button label="Start recording" onClick={() => void start()} />
        ) : (
          <>
            <Button label="Stop recording" onClick={stop} />
            <Text weight="semibold">Recording {formatElapsed(elapsed)}</Text>
          </>
        )}
        {previewUrl && (
          <>
            <Button label="Save take as video block" onClick={saveTake} />
            <Button
              label="Retake"
              variant="ghost"
              onClick={() => { setPreviewUrl(null); blobRef.current = null; setStatus(""); }}
            />
          </>
        )}
        <Button label="Close" variant="secondary" onClick={() => { stopTracks(); onClose(); }} />
      </div>
      {error && <p className="px-4 pt-2 text-sm text-error">{error}</p>}
      {status && <p className="px-4 pt-2 text-sm text-secondary">{status}</p>}
      <Text type="supporting" className="px-4 pt-2">
        Draw on the whiteboard. When you start recording, pick this tab in the browser&apos;s share dialog.
      </Text>
      <div className="min-h-0 flex-1">
        <WhiteboardCanvas snapshot={snapshot} onSnapshot={onSnapshot} height={600} />
      </div>
      {previewUrl && (
        <div className="border-t border-border px-4 py-3">
          <video src={previewUrl} controls className="w-full max-w-2xl rounded-lg" />
        </div>
      )}
      {/* Camera monitor, bottom-right corner while drawing/recording. */}
      <div className="pointer-events-none absolute bottom-4 right-4 w-64 overflow-hidden rounded-lg border-2 border-white bg-black shadow-lg">
        {cameraOn ? (
          <video ref={cameraVideoRef} muted playsInline className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center">
            <Text type="supporting">No camera</Text>
          </div>
        )}
      </div>
      {/* Hidden sources feed the recording composite. */}
      <video ref={screenVideoRef} muted playsInline className="hidden" />
      <canvas ref={canvasRef} width={1280} height={720} className="hidden" />
    </div>
  );
}
