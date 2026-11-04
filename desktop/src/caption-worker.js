// Curi Creator — local caption worker (first slice).
// Usage: node src/caption-worker.js <audio-or-video-file>
// Output: one JSON object on stdout, nothing else.
//   { model, file, durationMs, segments: [{start, end, text}], vtt, text }
// On failure: exit non-zero, error on stderr. Never emit sample/fake
// transcript text — if the model cannot run, the caller must see the
// failure, not a plausible-looking caption.
//
// Model: Xenova/whisper-tiny.en (open weights, local only, no cloud).
// First run downloads the model (~42 MB (observed on this VM) quantized, plus ONNX runtime
// files) to CURI_CAPTION_CACHE or ~/.cache/huggingface. Subsequent
// runs reuse it and are much faster. Audio is resampled to 16 kHz
// mono with ffmpeg first, so video files (OBS exports) work too.
//
// This file is deliberately plain Node, not Electron: it is spawned
// by main.js with the system node so @xenova/transformers loads
// normally. It does not import Electron at all.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function formatVttTime(seconds) {
  const s = Math.max(0, seconds);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  const ms = String(Math.round((s - Math.floor(s)) * 1000)).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function decodeWav16kMono(wavPath) {
  // Minimal WAV decoder for the ffmpeg output above (16 kHz, mono,
  // 16-bit PCM). transformers.js in Node has no AudioContext, so it
  // cannot load audio from a file path — raw Float32 samples must be
  // passed to the pipeline instead (see the error that prompted this).
  const buf = fs.readFileSync(wavPath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('ffmpeg output is not a WAV file.');
  }
  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(offset + 8),
        numChannels: buf.readUInt16LE(offset + 10),
        sampleRate: buf.readUInt32LE(offset + 12),
        bitsPerSample: buf.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!fmt || dataOffset < 0) throw new Error('Could not find fmt/data chunks in WAV file.');
  if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV format (format=${fmt.audioFormat}, bits=${fmt.bitsPerSample}); expected 16-bit PCM.`);
  }
  const frames = Math.floor(dataLength / (2 * fmt.numChannels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let ch = 0; ch < fmt.numChannels; ch++) {
      sum += buf.readInt16LE(dataOffset + (i * fmt.numChannels + ch) * 2);
    }
    samples[i] = (sum / fmt.numChannels) / 32768;
  }
  return { samples, sampleRate: fmt.sampleRate };
}

function toVtt(segments) {
  const lines = ['WEBVTT', ''];
  for (const seg of segments) {
    lines.push(`${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}`);
    lines.push(seg.text.trim());
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const input = process.argv[2];
  if (!input) fail('Usage: node caption-worker.js <audio-or-video-file>');
  if (!fs.existsSync(input)) fail(`File not found: ${input}`);

  // 1. Extract 16 kHz mono WAV with ffmpeg (handles video + audio).
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curi-caption-'));
  const wavPath = path.join(tmpDir, 'audio-16k.wav');
  try {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath], { stdio: 'pipe' });
  } catch (e) {
    fail(`ffmpeg failed to extract audio from ${input}. Is ffmpeg installed and is the file a readable audio/video file? ${e.message}`);
  }
  if (!fs.existsSync(wavPath)) fail('ffmpeg produced no audio output.');

  // 2. Local transcription, no cloud, no API key.
  let pipelineFn;
  try {
    ({ pipeline: pipelineFn } = require('@xenova/transformers'));
  } catch (e) {
    fail(`Could not load @xenova/transformers. Run npm install in curi-desktop first. ${e.message}`);
  }
  // Keep the cache inside the app's own folder when CURI_CAPTION_CACHE
  // is set (main.js sets it to the app userData models dir); otherwise
  // transformers.js uses its default Hugging Face cache.
  const started = Date.now();
  let transcriber;
  try {
    transcriber = await pipelineFn('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  } catch (e) {
    fail(`Could not load the local Whisper tiny model (first run downloads ~42 MB (observed on this VM); check network access to huggingface.co). ${e.message}`);
  }
  let audio;
  try {
    audio = decodeWav16kMono(wavPath);
  } catch (e) {
    fail(`Could not decode audio for transcription: ${e.message}`);
  }
  let result;
  try {
    result = await transcriber(audio.samples, { sampling_rate: audio.sampleRate, return_timestamps: true, chunk_length_s: 30 });
  } catch (e) {
    fail(`Local transcription failed: ${e.message}`);
  }

  const chunks = (result && result.chunks) || [];
  const segments = chunks
    .map((c) => {
      const ts = c.timestamp || [0, 0];
      return { start: Number(ts[0]) || 0, end: Number(ts[1]) || 0, text: String(c.text || '').trim() };
    })
    .filter((s) => s.text.length > 0);
  // Fallback: some outputs return a single text without chunks.
  if (!segments.length && result && result.text) {
    segments.push({ start: 0, end: 0, text: String(result.text).trim() });
  }
  if (!segments.length) fail('Transcription produced no text segments.');

  const text = segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
  const out = {
    model: 'Xenova/whisper-tiny.en (local, ONNX)',
    file: input,
    durationMs: Date.now() - started,
    segments,
    vtt: toVtt(segments),
    text,
  };
  console.log(JSON.stringify(out));
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* temp cleanup best-effort */ }
}

main().catch((e) => fail(`Caption worker crashed: ${e && e.message ? e.message : String(e)}`));
