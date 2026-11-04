// Captions window renderer — runs with contextIsolation, no Node.
// It only talks to main via window.curiCreator (see preload.js).
(function () {
  const pickBtn = document.getElementById('pick');
  const transcribeBtn = document.getElementById('transcribe');
  const copyBtn = document.getElementById('copy');
  const fileEl = document.getElementById('file');
  const statusEl = document.getElementById('status');
  const vttEl = document.getElementById('vtt');
  let chosen = null;

  pickBtn.addEventListener('click', async () => {
    const path = await window.curiCreator.pickVideo();
    if (!path) return;
    chosen = path;
    fileEl.textContent = `Chosen: ${path}`;
    transcribeBtn.disabled = false;
    statusEl.textContent = '';
  });

  transcribeBtn.addEventListener('click', async () => {
    if (!chosen) return;
    transcribeBtn.disabled = true;
    statusEl.textContent = 'Transcribing locally… first run downloads the Whisper tiny model (~42 MB (observed on this VM)) and is slower; later runs reuse it.';
    vttEl.value = '';
    copyBtn.disabled = true;
    try {
      const result = await window.curiCreator.transcribe(chosen);
      if (!result || !result.ok) {
        statusEl.textContent = `Failed: ${result ? result.error : 'No result from the caption worker.'}`;
        return;
      }
      vttEl.value = result.vtt || '';
      copyBtn.disabled = false;
      const secs = result.durationMs ? (result.durationMs / 1000).toFixed(1) : '?';
      statusEl.textContent = `Done in ${secs}s with ${result.model}. Transcript: ${result.text || ''}`;
    } catch (e) {
      statusEl.textContent = `Failed: ${e.message}`;
    } finally {
      transcribeBtn.disabled = false;
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(vttEl.value);
      statusEl.textContent = 'VTT copied. Paste it into Studio → video block → Edited captions.';
    } catch (e) {
      statusEl.textContent = `Copy failed (select the text and copy manually): ${e.message}`;
    }
  });
})();
