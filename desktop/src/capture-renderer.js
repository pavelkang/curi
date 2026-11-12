// Desktop capture window renderer — runs with contextIsolation, no Node.
// Talks to main only via window.curiCreator (see preload.js).
// Flow: pick a screen/window source (desktopCapturer, via main) ->
// start screen (+ camera PiP) -> pause/resume -> stop & save a local
// .webm -> caption (existing curi:transcribe Whisper worker) ->
// generate drafts (existing curi:generate-drafts) -> upload the same
// file through Studio's existing Mux upload (NOT reimplemented here).
//
// Composite mirrors the web Recorder (~/workspace/curi/components/
// Recorder.tsx): 1280x720 canvas, screen fills it, camera PiP is
// 320x180 bottom-right with a 16px inset and white border.
//
// System audio: requested from the desktop source when the platform
// provides it (Chrome desktop-capture audio constraint). On Linux
// headless it is expected to be absent — the code detects that (no
// audio track on the desktop stream) and reports mic-only instead of
// claiming system audio. Mac/Windows status is UNVERIFIED.
(function () {
  const sourceSelect = document.getElementById('source-select');
  const sourcesEl = document.getElementById('sources');
  const refreshBtn = document.getElementById('refresh-sources');
  const modeSelect = document.getElementById('mode-select');
  const cameraStatusEl = document.getElementById('camera-status');
  const startBtn = document.getElementById('start');
  const pauseBtn = document.getElementById('pause');
  const resumeBtn = document.getElementById('resume');
  const stopBtn = document.getElementById('stop');
  const timerEl = document.getElementById('timer');
  const recDot = document.getElementById('rec-dot');
  const statusEl = document.getElementById('status');
  const audioStatusEl = document.getElementById('audio-status');
  const canvas = document.getElementById('canvas');
  const screenVideo = document.getElementById('screen-video');
  const cameraVideo = document.getElementById('camera-video');
  const afterEl = document.getElementById('after');
  const savedEl = document.getElementById('saved');
  const previewEl = document.getElementById('preview');
  const captionBtn = document.getElementById('caption');
  const draftsBtn = document.getElementById('drafts');
  const showFileBtn = document.getElementById('show-file');
  const copyPathBtn = document.getElementById('copy-path');
  const captionStatusEl = document.getElementById('caption-status');
  const vttEl = document.getElementById('vtt');

  let sources = [];
  let selectedSourceId = null;
  let cameraAvailable = false;
  let streams = [];
  let recorder = null;
  let chunks = [];
  let raf = 0;
  let timerId = null;
  let elapsedMs = 0;
  let startedAt = 0;
  let pausedTotalMs = 0;
  let pausedAt = 0;
  let recording = false;
  let paused = false;
  let savedPath = null;
  let savedBlobUrl = null;
  let lastTranscript = null;
  let audioReport = '';

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function tick() {
    const now = paused ? pausedAt : Date.now();
    elapsedMs = now - startedAt - pausedTotalMs;
    timerEl.textContent = fmt(elapsedMs);
  }
  function stopTracks() {
    cancelAnimationFrame(raf);
    streams.forEach((s) => s.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} }));
    streams = [];
  }

  async function loadSources() {
    try {
      const res = await window.curiCreator.getCaptureSources();
      if (!res || !res.ok) { statusEl.textContent = 'Could not list screens/windows: ' + (res ? res.error : 'no result'); return; }
      sources = res.sources || [];
      sourceSelect.innerHTML = '';
      sourcesEl.innerHTML = '';
      if (!sources.length) {
        sourceSelect.innerHTML = '<option value="">No screens/windows found</option>';
        statusEl.textContent = 'No screen/window sources were returned by desktopCapturer.';
        return;
      }
      sources.forEach((src, i) => {
        const opt = document.createElement('option');
        opt.value = src.id; opt.textContent = src.name;
        sourceSelect.appendChild(opt);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = src.name;
        if (src.thumbnail) {
          const img = document.createElement('img');
          img.src = src.thumbnail; img.alt = src.name;
          btn.appendChild(img);
        } else { btn.textContent = src.name; }
        btn.addEventListener('click', () => { sourceSelect.value = src.id; selectSource(src.id); });
        sourcesEl.appendChild(btn);
      });
      // Prefer a full screen over a single window.
      const screen = sources.find((s) => s.id.startsWith('screen:')) || sources[0];
      selectedSourceId = screen.id;
      sourceSelect.value = screen.id;
      selectSource(screen.id);
    } catch (e) {
      statusEl.textContent = 'Could not list screens/windows: ' + e.message;
    }
  }

  function selectSource(id) {
    selectedSourceId = id;
    Array.from(sourcesEl.children).forEach((btn, i) => {
      btn.classList.toggle('selected', sources[i] && sources[i].id === id);
    });
  }
  sourceSelect.addEventListener('change', () => selectSource(sourceSelect.value));
  refreshBtn.addEventListener('click', loadSources);

  async function checkCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      cameraAvailable = cams.length > 0;
      cameraStatusEl.textContent = cameraAvailable
        ? `Camera found: ${cams.length} video input(s) (${cams[0].label || 'unnamed'}).`
        : 'No camera found on this machine — screen + camera mode will fall back to screen-only.';
      if (!cameraAvailable && modeSelect.value === 'screen-camera') modeSelect.value = 'screen-only';
    } catch (e) {
      cameraStatusEl.textContent = 'Camera check failed: ' + e.message;
    }
  }

  function drawLoop() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mode = modeSelect.value;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (mode !== 'camera-only' && screenVideo.readyState >= 2) {
      ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
    }
    if (mode !== 'screen-only' && cameraVideo.readyState >= 2) {
      if (mode === 'camera-only') {
        ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
      } else {
        // PiP bottom-right, mirroring the web Recorder: 320x180, 16px inset.
        const w = 320, h = 180, x = canvas.width - w - 16, y = canvas.height - h - 16;
        ctx.drawImage(cameraVideo, x, y, w, h);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(x, y, w, h);
      }
    }
    raf = requestAnimationFrame(drawLoop);
  }

  async function getDesktopStream(withAudio) {
    // Electron desktop capture: getUserMedia with the chromeMediaSource
    // constraint for the chosen desktopCapturer source id. This avoids
    // the getDisplayMedia picker dialog (which has no headless path).
    const video = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: selectedSourceId, minWidth: 1280, maxWidth: 1280, minHeight: 720, maxHeight: 720 } };
    if (!withAudio) return navigator.mediaDevices.getUserMedia({ video, audio: false });
    const audio = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: selectedSourceId } };
    return navigator.mediaDevices.getUserMedia({ video, audio });
  }

  async function start() {
    const mode = modeSelect.value;
    statusEl.textContent = '';
    audioStatusEl.textContent = '';
    afterEl.style.display = 'none';
    chunks = [];
    audioReport = '';
    let screenStream = null;
    let cameraStream = null;
    let micStream = null;
    let systemAudio = false;
    let micAudio = false;
    try {
      if (mode !== 'camera-only') {
        if (!selectedSourceId) throw new Error('Pick a screen/window source first.');
        // Try screen video + system audio first; fall back to video-only.
        try {
          screenStream = await getDesktopStream(true);
          systemAudio = screenStream.getAudioTracks().length > 0;
        } catch (e) {
          screenStream = await getDesktopStream(false);
          systemAudio = false;
          audioReport += 'System-audio request failed (' + e.message + '); ';
        }
        streams.push(screenStream);
        screenVideo.srcObject = screenStream;
        await screenVideo.play().catch(() => {});
      }
      if (mode !== 'screen-only') {
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          micAudio = cameraStream.getAudioTracks().length > 0;
        } catch (e) {
          if (mode === 'camera-only') throw e;
          // Camera unavailable mid-flow: fall back to screen-only, say so.
          cameraStream = null;
          audioReport += 'Camera unavailable (' + e.message + ') — recording screen-only. ';
        }
        if (cameraStream) {
          streams.push(cameraStream);
          cameraVideo.srcObject = cameraStream;
          await cameraVideo.play().catch(() => {});
        }
      }
      // Mic fallback for screen-only mode (no camera stream to carry it).
      if (mode === 'screen-only' && !systemAudio) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micAudio = micStream.getAudioTracks().length > 0;
          if (micStream) streams.push(micStream);
        } catch (e) {
          audioReport += 'Mic unavailable (' + e.message + '). ';
        }
      }
      if (systemAudio) audioReport += 'System audio: YES (audio track present on the desktop stream). ';
      else audioReport += 'System audio: NO — desktop stream carries no system-audio track on this machine. ';
      audioReport += micAudio ? 'Mic audio: YES.' : 'Mic audio: NO.';
      audioStatusEl.textContent = audioReport;

      raf = requestAnimationFrame(drawLoop);
      const canvasStream = canvas.captureStream(30);
      const audioTracks = [];
      const micTrack = (cameraStream && cameraStream.getAudioTracks()[0]) || (micStream && micStream.getAudioTracks()[0]);
      const sysTrack = screenStream && screenStream.getAudioTracks()[0];
      // Prefer mic (voice) as the single audio track, matching the web
      // Recorder; system audio is included only when there is no mic.
      if (micTrack) audioTracks.push(micTrack);
      else if (sysTrack) audioTracks.push(sysTrack);
      const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm';
      recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 2500000 });
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => { void onStopped(); };
      recorder.onerror = (e) => { statusEl.textContent = 'Recorder error: ' + (e.error ? e.error.message : e.message || 'unknown'); };
      recorder.start(250);
      recording = true; paused = false;
      startedAt = Date.now(); pausedTotalMs = 0; pausedAt = 0;
      timerId = setInterval(tick, 250);
      startBtn.disabled = true; pauseBtn.disabled = false; resumeBtn.disabled = true; stopBtn.disabled = false;
      recDot.style.display = '';
      modeSelect.disabled = true; sourceSelect.disabled = true;
      statusEl.textContent = 'Recording… ' + (cameraStream ? 'Screen + camera.' : 'Screen only.');
    } catch (e) {
      statusEl.textContent = 'Could not start recording: ' + (e && e.message ? e.message : String(e));
      stopTracks();
    }
  }

  function pause() {
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    paused = true; pausedAt = Date.now();
    pauseBtn.disabled = true; resumeBtn.disabled = false;
    statusEl.textContent = 'Paused at ' + fmt(elapsedMs) + '. Resume or Stop & save.';
  }
  function resume() {
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    pausedTotalMs += Date.now() - pausedAt;
    paused = false;
    pauseBtn.disabled = false; resumeBtn.disabled = true;
    statusEl.textContent = 'Recording…';
  }

  async function onStopped() {
    clearInterval(timerId);
    recording = false; paused = false;
    recDot.style.display = 'none';
    startBtn.disabled = false; pauseBtn.disabled = true; resumeBtn.disabled = true; stopBtn.disabled = true;
    modeSelect.disabled = false; sourceSelect.disabled = false;
    stopTracks();
    const blob = new Blob(chunks, { type: 'video/webm' });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `curi-recording-${stamp}.webm`;
    statusEl.textContent = `Stopped after ${fmt(elapsedMs)} — saving ${(blob.size / 1000).toFixed(0)} KB…`;
    try {
      const buf = await blob.arrayBuffer();
      const res = await window.curiCreator.saveRecording(buf, filename);
      if (!res || !res.ok) throw new Error(res ? res.error : 'no result from save');
      savedPath = res.path;
      savedEl.textContent = `Saved: ${savedPath} (${(res.size / 1000).toFixed(0)} KB, ${fmt(elapsedMs)}). Recordings folder: ${res.dir}`;
      if (savedBlobUrl) URL.revokeObjectURL(savedBlobUrl);
      savedBlobUrl = URL.createObjectURL(blob);
      previewEl.src = savedBlobUrl;
      afterEl.style.display = '';
      captionBtn.disabled = false;
      draftsBtn.disabled = true;
      vttEl.value = '';
      captionStatusEl.textContent = '';
      lastTranscript = null;
      statusEl.textContent = `Saved ${fmt(elapsedMs)} recording to ${savedPath}. ${audioReport}`;
    } catch (e) {
      statusEl.textContent = 'Save failed: ' + e.message + ' (the recording is still in memory — use the preview only if it appears below).';
      if (savedBlobUrl) URL.revokeObjectURL(savedBlobUrl);
      savedBlobUrl = URL.createObjectURL(blob);
      previewEl.src = savedBlobUrl;
      afterEl.style.display = '';
    }
  }

  function stop() {
    if (!recorder) return;
    if (recorder.state === 'paused') { pausedTotalMs += Date.now() - pausedAt; paused = false; }
    try { recorder.stop(); } catch (e) { statusEl.textContent = 'Stop failed: ' + e.message; }
  }

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  resumeBtn.addEventListener('click', resume);
  stopBtn.addEventListener('click', stop);

  captionBtn.addEventListener('click', async () => {
    if (!savedPath) return;
    captionBtn.disabled = true;
    captionStatusEl.textContent = 'Transcribing locally with Whisper tiny… (first run downloads the ~42 MB model and is slower).';
    try {
      const result = await window.curiCreator.transcribe(savedPath);
      if (!result || !result.ok) {
        captionStatusEl.textContent = 'Captioning failed: ' + (result ? result.error : 'no result');
        return;
      }
      lastTranscript = result;
      vttEl.value = result.vtt || '';
      draftsBtn.disabled = false;
      captionStatusEl.textContent = `Captioned (${result.model}). Transcript: ${result.text || '(no speech detected — drafts will be empty; try a take with spoken audio.)'}`;
    } catch (e) {
      captionStatusEl.textContent = 'Captioning failed: ' + e.message;
    } finally {
      captionBtn.disabled = false;
    }
  });

  draftsBtn.addEventListener('click', async () => {
    if (!lastTranscript) return;
    draftsBtn.disabled = true;
    captionStatusEl.textContent = 'Generating drafts locally from the transcript…';
    try {
      const res = await window.curiCreator.generateDrafts({ segments: lastTranscript.segments, text: lastTranscript.text });
      if (!res || !res.ok) {
        captionStatusEl.textContent = 'Drafts failed: ' + (res ? res.error : 'no result');
        return;
      }
      captionStatusEl.textContent = `Drafts ready: ${res.drafts.chapters.length} chapter(s), ${res.drafts.questions.length} question(s), ${res.drafts.notes.length} note(s). Method: ${res.drafts.method}. Open Tools → Local Captions… to edit/copy them, or copy the VTT above into Studio — drafts for this recording are not auto-published. (Full editable drafts UI lives in the Local Captions window; this window reports the counts only.)`;
    } catch (e) {
      captionStatusEl.textContent = 'Drafts failed: ' + e.message;
    } finally {
      draftsBtn.disabled = false;
    }
  });

  showFileBtn.addEventListener('click', async () => {
    if (savedPath) await window.curiCreator.openRecording(savedPath);
  });
  copyPathBtn.addEventListener('click', async () => {
    if (!savedPath) return;
    try {
      await navigator.clipboard.writeText(savedPath);
      captionStatusEl.textContent = 'File path copied. Paste it into Studio’s video-block upload chooser if needed.';
    } catch (e) {
      captionStatusEl.textContent = 'Copy failed (select the path and copy manually): ' + e.message;
    }
  });

  // Verification hook only (see src/main.js): drives a real screen-only
  // capture headlessly when CURI_CAPTURE_DEMO_MS is set. Not used in
  // normal operation. Returns a JSON string so main can log it.
  window.curiCapture = {
    demo: async (durationMs) => {
      await loadSources();
      await checkCamera();
      if (!selectedSourceId) return JSON.stringify({ ok: false, error: 'no capture source' });
      modeSelect.value = 'screen-only';
      await start();
      if (!recording) return JSON.stringify({ ok: false, error: statusEl.textContent, audio: audioReport });
      await new Promise((r) => setTimeout(r, durationMs || 5000));
      // Wait for onStopped to finish saving (it is async via onstop).
      const saved = await new Promise((resolve) => {
        const check = setInterval(() => {
          if (savedPath) { clearInterval(check); resolve(true); }
        }, 200);
        setTimeout(() => { clearInterval(check); resolve(false); }, 15000);
        stop();
      });
      return JSON.stringify({ ok: saved, path: savedPath, elapsedMs, audio: audioReport, cameraAvailable, status: statusEl.textContent });
    },
    state: () => ({ recording, paused, elapsedMs, savedPath, cameraAvailable, audio: audioReport }),
  };

  loadSources();
  checkCamera();
})();
