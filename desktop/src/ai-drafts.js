// Curi Creator — local AI drafts, Step 2 (deterministic fallback).
//
// From a local Whisper transcript (segments + text, as produced by
// src/caption-worker.js) this builds creator-reviewed drafts:
//   (a) cleaned notes (markdown, filler-trimmed, sentence-cased),
//   (b) chapters with timestamps (titles are verbatim lead phrases
//       from the transcript — never invented topics),
//   (c) MCQ drafts, each linked to a transcript timestamp and quoting
//       its source sentence verbatim.
//
// METHOD — deterministic, NOT an LLM (read this before "upgrading"):
// A small local instruct model WAS tried on this VM first and rejected
// on evidence, not on preference:
//   * Xenova/Qwen2.5-0.5B-Instruct — Hugging Face returns 401 for this
//     repo ("Invalid username or password"); the repo is gated, so it
//     cannot be downloaded without an HF account/token. Not usable
//     for an offline, no-account desktop app.
//   * Xenova/Qwen1.5-0.5B-Chat (public, ~466 MB download, int8) —
//     loads and runs, but on this VM (6 GB RAM / 1.5 CPU, ~900 MB free)
//     generation took ~51 s for 150 tokens at ~2.5 GB RSS, and the
//     output HALLUCINATED: for the JFK sample it invented "The
//     American Dream is a dream of equal opportunity and prosperity…
//     hard work, perseverance, and individualism" — none of which is
//     in the transcript — then drifted into Korean mid-answer.
//     A draft generator that invents lesson content is worse than
//     none, so the LLM path is NOT wired in. It is a later slice on a
//     real machine with a bigger, better model (and a faithfulness
//     check against the transcript). See README "Step 2".
//
// What this means for the MCQs, stated precisely: they are
// rule-based cloze (fill-in-the-blank) questions built from keywords
// actually in the transcript. They test recall of what was said,
// not comprehension of ideas, and they are weaker than LLM-drafted
// questions would be. Every draft is labelled DRAFT in the UI and
// in the exported blocks, and nothing here writes to Supabase or to
// Studio's store — the teacher copies the exported blocks into
// Studio and reviews/edits them there.
//
// This file is pure Node with no dependencies, so main.js can require
// it directly (no worker spawn needed) and it can also run as a CLI:
//   node src/ai-drafts.js <caption-json-file> [output-json-file]
// Input JSON: { segments: [{start, end, text}], text } (the shape
// src/caption-worker.js prints). Output: one JSON object on stdout
// (or written to the output file): { method, notes, chapters,
// questions, notesMarkdown, chaptersMarkdown, markdownBlock,
// quizBlock, lessonContent, source }.
//
// Shared-code rule: this emits LessonContent-shaped JSON (the block
// shapes defined in ~/workspace/curi/lib/content.ts) for copy/paste
// into Studio. It does NOT re-implement the shared content model,
// renderer, or quiz player — Studio stays the single place those
// live. (The guard script check-shared.js forbids certain re-implementation
// marker strings in this folder; this file contains none of them.)

const fs = require('fs');

const METHOD = 'deterministic-rule-based';
const METHOD_NOTE =
  'Deterministic draft from the transcript (no LLM). A 0.5B local instruct model was tried on this VM and rejected: it hallucinated content not in the transcript (see src/ai-drafts.js header). MCQs are cloze-style and weaker than LLM drafts — review and rewrite before publishing.';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'what', 'can', 'not', 'that',
  'this', 'with', 'from', 'have', 'has', 'had', 'are', 'was', 'were', 'been',
  'being', 'will', 'would', 'should', 'could', 'there', 'here', 'when',
  'where', 'which', 'while', 'about', 'into', 'over', 'under', 'after',
  'before', 'then', 'than', 'them', 'they', 'their', 'theirs', 'our', 'ours',
  'his', 'her', 'its', 'who', 'whom', 'how', 'why', 'all', 'any', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
  'too', 'very', 'just', 'also', 'but', 'because', 'until', 'per', 'via',
  'don', 'does', 'did', 'doing', 'isn', 'aren', 'wasn', 'weren', 'hasn',
  'haven', 'hadn', 'won', 'wouldn', 'couldn', 'shouldn', 'must', 'might',
  'may', 'shall', 'one', 'two', 'first', 'second', 'well', 'really',
  'actually', 'basically', 'literally', 'kind', 'sort', 'thing',
  'things', 'way', 'ways', 'much', 'many', 'lot', 'lots', 'even', 'still',
  'already', 'yet', 'ever', 'never', 'always', 'often', 'sometimes',
]);
// NOTE: ordinary verbs (ask, say, know, make, take, …) are deliberately
// NOT stopwords here — they are useful cloze targets for the MCQ drafts.

const FILLER_PHRASES = [
  /\byou know\b/gi,
  /\bi mean\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
];
const FILLER_WORDS = new Set(['um', 'uh', 'erm', 'hmm', 'mm', 'uhm']);

function fail(message) {
  throw new Error(message);
}

function formatTimestamp(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
}

function cleanSentence(raw) {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  for (const re of FILLER_PHRASES) t = t.replace(re, ' ');
  // Drop standalone filler words (um/uh/erm/hmm) and collapse repeated words.
  t = t.split(' ').filter((w) => !FILLER_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''))).join(' ');
  t = t.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
  t = t.replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // Sentence-case: capitalise the first letter, leave the rest as
  // transcribed (so proper nouns Whisper capitalised are preserved).
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Split a segment's text into sentences, keeping the segment's timing.
function sentencesFromSegment(seg) {
  const text = String(seg.text || '').trim();
  if (!text) return [];
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  return parts.map((p) => p.trim()).filter(Boolean).map((sentence) => ({
    text: sentence,
    start: Number(seg.start) || 0,
    end: Number(seg.end) || 0,
  }));
}

function contentWords(sentence) {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function keywordStats(sentences) {
  const freq = new Map();
  const firstSeen = new Map();
  sentences.forEach((s, si) => {
    for (const w of contentWords(s.text)) {
      freq.set(w, (freq.get(w) || 0) + 1);
      if (!firstSeen.has(w)) firstSeen.set(w, si);
    }
  });
  return [...freq.entries()]
    .map(([word, count]) => ({ word, count, firstSeen: firstSeen.get(word) }))
    .sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);
}

function chapterTitle(chapterText) {
  // Title = the chapter's first sentence, verbatim, trimmed to a
  // readable length at a word boundary. Never an invented topic.
  const first = chapterText.split(/(?<=[.!?])\s+/)[0] || chapterText;
  const clean = cleanSentence(first).replace(/[.!?]+$/, '');
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 57);
  return cut.slice(0, cut.lastIndexOf(' ')).trim() + '…';
}

function buildChapters(segments) {
  const chapters = [];
  let current = null;
  const flush = () => {
    if (current && current.segments.length) {
      const text = current.segments.map((s) => s.text.trim()).filter(Boolean).join(' ');
      chapters.push({
        start: current.start,
        end: current.end,
        title: chapterTitle(text),
        text: cleanSentence(text),
      });
    }
    current = null;
  };
  for (const seg of segments) {
    const text = String(seg.text || '').trim();
    if (!text) continue;
    if (!current) {
      current = { start: Number(seg.start) || 0, end: Number(seg.end) || 0, segments: [] };
    }
    current.segments.push({ start: Number(seg.start) || 0, end: Number(seg.end) || 0, text });
    current.end = Number(seg.end) || current.end;
    const duration = current.end - current.start;
    const endsSentence = /[.!?]["')\]]*\s*$/.test(text);
    // Break: a sentence ended and the chapter is at least 5 s long,
    // or the chapter hit 60 s (long lessons get more chapters).
    if ((endsSentence && duration >= 5) || duration >= 60) flush();
  }
  flush();
  return chapters;
}

function buildQuestions(sentences, keywords) {
  const questions = [];
  const pool = keywords.map((k) => k.word);
  // Up to 3 cloze questions, one per top keyword.
  for (let i = 0; i < Math.min(3, pool.length); i++) {
    const answer = pool[i];
    const hit = sentences.find((s) => new RegExp(`\\b${answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(s.text));
    if (!hit) continue;
    const cleaned = cleanSentence(hit.text);
    const blanked = cleaned.replace(new RegExp(`\\b${answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '___');
    if (blanked === cleaned) continue;
    const distractors = pool.filter((w) => w !== answer).slice(0, 3);
    if (distractors.length < 3) continue; // need a full set of 4 options from the transcript
    const correctIndex = [...answer].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 4;
    const options = [...distractors];
    options.splice(correctIndex, 0, answer);
    questions.push({
      id: `draft-q-${questions.length + 1}`,
      prompt: `Fill in the blank (from the lesson transcript): “${blanked}”`,
      options,
      correct_index: correctIndex,
      explanation:
        `The transcript says: “${cleaned}” at ${formatTimestamp(hit.start)}. ` +
        `DRAFT — cloze-style question generated from the transcript; review the wording before publishing.`,
      source_timestamp: formatTimestamp(hit.start),
      source_timestamp_seconds: hit.start,
      source_text: cleaned,
    });
  }
  return questions;
}

function generateDrafts(transcript) {
  if (!transcript || typeof transcript !== 'object') fail('generateDrafts needs a transcript object { segments, text }.');
  const rawSegments = Array.isArray(transcript.segments) ? transcript.segments : [];
  const segments = rawSegments
    .map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() }))
    .filter((s) => s.text.length > 0)
    .sort((a, b) => a.start - b.start);
  if (!segments.length) fail('Transcript has no text segments — nothing to draft from.');
  const fullText = (transcript.text && String(transcript.text).trim())
    || segments.map((s) => s.text).join(' ');
  if (!fullText.trim()) fail('Transcript text is empty — nothing to draft from.');

  const sentences = segments.flatMap(sentencesFromSegment).map((s) => ({
    ...s,
    text: cleanSentence(s.text),
  })).filter((s) => s.text.length > 0);
  const keywords = keywordStats(sentences);
  const chapters = buildChapters(segments);
  const questions = buildQuestions(sentences, keywords);

  const notes = sentences.map((s) => ({ timestamp: formatTimestamp(s.start), timestamp_seconds: s.start, text: s.text }));

  const chaptersMarkdown = [
    '## Chapters (DRAFT)',
    '',
    ...chapters.map((c) => `- [${formatTimestamp(c.start)}] ${c.title}`),
    '',
    '_Chapter titles are the opening words of each section, taken verbatim from the transcript — no topics were invented._',
  ].join('\n');

  const notesMarkdown = [
    '# Lesson notes (DRAFT)',
    '',
    '> Draft generated locally from the Whisper transcript. Review and edit before publishing — nothing here was sent to the cloud and no content was added beyond the transcript.',
    '',
    ...notes.map((n) => `- [${n.timestamp}] ${n.text}`),
    '',
    chaptersMarkdown,
  ].join('\n');

  const markdownBlock = { kind: 'markdown', id: 'draft-md-1', markdown: notesMarkdown };
  const quizBlock = {
    kind: 'quiz',
    id: 'draft-quiz-1',
    title: 'Draft quiz — review before publishing',
    questions: questions.map(({ id, prompt, options, correct_index, explanation }) => ({
      id, prompt, options, correct_index, explanation,
    })),
  };
  // LessonContent shape from ~/workspace/curi/lib/content.ts:
  // { version: 1, blocks: [...] } with markdown + quiz blocks.
  const lessonContent = { version: 1, blocks: [markdownBlock, quizBlock] };

  return {
    method: METHOD,
    method_note: METHOD_NOTE,
    source: { text: fullText, segment_count: segments.length },
    notes,
    chapters,
    questions,
    notesMarkdown,
    chaptersMarkdown,
    markdownBlock,
    quizBlock,
    lessonContent,
  };
}

module.exports = { generateDrafts, formatTimestamp, METHOD, METHOD_NOTE };

// CLI: node src/ai-drafts.js <caption-json-file> [output-json-file]
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error('Usage: node src/ai-drafts.js <caption-json-file> [output-json-file]');
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(input, 'utf8'));
  } catch (e) {
    console.error(`Could not read/parse ${input}: ${e.message}`);
    process.exit(1);
  }
  const transcript = parsed.segments ? parsed : parsed.transcript;
  let drafts;
  try {
    drafts = generateDrafts(transcript);
  } catch (e) {
    console.error(`Draft generation failed: ${e.message}`);
    process.exit(1);
  }
  const json = JSON.stringify(drafts, null, 2);
  if (output) {
    fs.writeFileSync(output, json + '\n');
    console.error(`Drafts written to ${output} (${drafts.chapters.length} chapter(s), ${drafts.questions.length} question(s), ${drafts.notes.length} note(s), method=${drafts.method}).`);
  } else {
    console.log(json);
  }
}
