// Captions + AI-drafts window renderer — runs with contextIsolation, no Node.
// It only talks to main via window.curiCreator (see preload.js).
// Flow: pick file -> transcribe locally (Whisper) -> generate drafts
// (deterministic, transcript-derived — see src/ai-drafts.js) -> edit in
// this window -> copy markdown / quiz blocks into Studio. Nothing here
// publishes anything or writes to Supabase; drafts land in Studio only
// when the teacher pastes them there as editable blocks.
(function () {
  const pickBtn = document.getElementById('pick');
  const transcribeBtn = document.getElementById('transcribe');
  const copyBtn = document.getElementById('copy');
  const fileEl = document.getElementById('file');
  const statusEl = document.getElementById('status');
  const vttEl = document.getElementById('vtt');
  const draftsBtn = document.getElementById('drafts');
  const draftsStatusEl = document.getElementById('drafts-status');
  const draftsSection = document.getElementById('drafts-section');
  const draftsNoteEl = document.getElementById('drafts-note');
  const notesEl = document.getElementById('notes-md');
  const quizEl = document.getElementById('quiz-json');
  const copyNotesBtn = document.getElementById('copy-notes');
  const copyQuizBtn = document.getElementById('copy-quiz');
  const copyAllBtn = document.getElementById('copy-all');
  let chosen = null;
  let lastTranscript = null;
  let lastDrafts = null;

  pickBtn.addEventListener('click', async () => {
    const path = await window.curiCreator.pickVideo();
    if (!path) return;
    chosen = path;
    fileEl.textContent = `Chosen: ${path}`;
    transcribeBtn.disabled = false;
    statusEl.textContent = '';
  });

  async function doTranscribe() {
    if (!chosen) return false;
    transcribeBtn.disabled = true;
    statusEl.textContent = 'Transcribing locally… first run downloads the Whisper tiny model (~42 MB (observed on this VM)) and is slower; later runs reuse it.';
    vttEl.value = '';
    copyBtn.disabled = true;
    draftsBtn.disabled = true;
    lastTranscript = null;
    lastDrafts = null;
    try {
      const result = await window.curiCreator.transcribe(chosen);
      if (!result || !result.ok) {
        statusEl.textContent = `Failed: ${result ? result.error : 'No result from the caption worker.'}`;
        return false;
      }
      lastTranscript = result;
      vttEl.value = result.vtt || '';
      copyBtn.disabled = false;
      draftsBtn.disabled = false;
      const secs = result.durationMs ? (result.durationMs / 1000).toFixed(1) : '?';
      statusEl.textContent = `Done in ${secs}s with ${result.model}. Transcript: ${result.text || ''}`;
      return true;
    } catch (e) {
      statusEl.textContent = `Failed: ${e.message}`;
      return false;
    } finally {
      transcribeBtn.disabled = false;
    }
  }

  transcribeBtn.addEventListener('click', doTranscribe);

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(vttEl.value);
      statusEl.textContent = 'VTT copied. Paste it into Studio → video block → Edited captions.';
    } catch (e) {
      statusEl.textContent = `Copy failed (select the text and copy manually): ${e.message}`;
    }
  });

  async function doDrafts() {
    if (!lastTranscript) return false;
    draftsBtn.disabled = true;
    draftsStatusEl.textContent = 'Generating drafts locally from the transcript…';
    try {
      const res = await window.curiCreator.generateDrafts({
        segments: lastTranscript.segments,
        text: lastTranscript.text,
      });
      if (!res || !res.ok) {
        draftsStatusEl.textContent = `Drafts failed: ${res ? res.error : 'No result from the drafts generator.'}`;
        return false;
      }
      lastDrafts = res.drafts;
      notesEl.value = res.drafts.notesMarkdown || '';
      quizEl.value = JSON.stringify(res.drafts.quizBlock, null, 2);
      draftsNoteEl.textContent = `DRAFT — ${res.drafts.method_note || res.drafts.method}`;
      draftsSection.style.display = '';
      copyNotesBtn.disabled = false;
      copyQuizBtn.disabled = false;
      copyAllBtn.disabled = false;
      draftsStatusEl.textContent =
        `Drafts ready: ${res.drafts.chapters.length} chapter(s), ${res.drafts.questions.length} question(s), ` +
        `${res.drafts.notes.length} note(s). Method: ${res.drafts.method}. ` +
        `Edit the text above, then copy the blocks into Studio — nothing is published automatically.`;
      return true;
    } catch (e) {
      draftsStatusEl.textContent = `Drafts failed: ${e.message}`;
      return false;
    } finally {
      draftsBtn.disabled = false;
    }
  }

  draftsBtn.addEventListener('click', doDrafts);

  function buildLessonContent() {
    let quiz;
    try {
      quiz = JSON.parse(quizEl.value);
    } catch (e) {
      throw new Error(`Quiz block JSON is not valid JSON: ${e.message}`);
    }
    if (!quiz || quiz.kind !== 'quiz' || !Array.isArray(quiz.questions)) {
      throw new Error('Quiz block must be an object with kind "quiz" and a questions array.');
    }
    // LessonContent shape from ~/workspace/curi/lib/content.ts:
    // { version: 1, blocks: [markdownBlock, quizBlock] }.
    return {
      version: 1,
      blocks: [
        { kind: 'markdown', id: (lastDrafts && lastDrafts.markdownBlock.id) || 'draft-md-1', markdown: notesEl.value },
        quiz,
      ],
    };
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      draftsStatusEl.textContent = okMsg;
    } catch (e) {
      draftsStatusEl.textContent = `Copy failed (select the text and copy manually): ${e.message}`;
    }
  }

  copyNotesBtn.addEventListener('click', () => {
    const block = { kind: 'markdown', id: (lastDrafts && lastDrafts.markdownBlock.id) || 'draft-md-1', markdown: notesEl.value };
    copyText(JSON.stringify(block, null, 2), 'Markdown block copied. Paste it into Studio as a new markdown block (DRAFT — review first).');
  });

  copyQuizBtn.addEventListener('click', () => {
    copyText(quizEl.value, 'Quiz block copied. Paste it into Studio as a new quiz block (DRAFT — check each answer first).');
  });

  copyAllBtn.addEventListener('click', () => {
    try {
      const content = buildLessonContent();
      copyText(JSON.stringify(content, null, 2), 'All blocks copied as LessonContent JSON. Paste into Studio as the lesson blocks (DRAFT — review first).');
    } catch (e) {
      draftsStatusEl.textContent = `Cannot copy all blocks: ${e.message}`;
    }
  });

  // Verification hook only (see src/main.js): drives the real UI flow
  // (transcribe -> drafts) headlessly when CURI_CAPTIONS_DEMO_FILE is
  // set. Not used in normal operation.
  window.curiCaptions = {
    demo: async (filePath) => {
      chosen = filePath;
      fileEl.textContent = `Chosen: ${filePath}`;
      const ok = await doTranscribe();
      if (!ok) return 'demo: transcribe failed';
      const ok2 = await doDrafts();
      return ok2 ? 'demo: done' : 'demo: drafts failed';
    },
  };
})();
