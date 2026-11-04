// Guard against forking a second Studio UI in curi-desktop.
// Run: node scripts/check-shared.js
// Checks (no network, no build):
//  1. curi-desktop/src contains NO copies of the shared lesson/quiz
//     components (LessonRenderer, VideoBlock, QuizBlock, LessonDetail,
//     CourseDetail) and NO copy of lib/content.ts or lib/markdown.ts.
//  2. ~/workspace/curi's Studio routes AND learner routes both import
//     the same shared modules: @/lib/content and @/lib/markdown,
//     and learner pages render via @/components/LessonRenderer.
// Exit non-zero with a clear message if either check fails, so a
// future fork is caught before it ships.
const fs = require('fs');
const path = require('path');

const desktopSrc = path.join(__dirname, '..', 'src');
const curiRoot = path.join(__dirname, '..', '..', 'curi');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function fail(msg) { console.error(`check-shared FAILED: ${msg}`); process.exit(1); }
function ok(msg) { console.log(`check-shared OK: ${msg}`); }

// 1. No forked copies in the desktop shell.
const forbidden = ['LessonRenderer', 'VideoBlock', 'QuizBlock', 'LessonDetail', 'CourseDetail'];
for (const file of walk(desktopSrc)) {
  const base = path.basename(file);
  for (const name of forbidden) {
    if (base === `${name}.tsx` || base === `${name}.ts` || base === `${name}.js`) {
      fail(`curi-desktop/src contains a forked copy: ${file}. Delete it and load the shared app from ~/workspace/curi instead.`);
    }
  }
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('export type LessonBlock') || text.includes('export function renderMarkdown')) {
    fail(`curi-desktop/src/${base} re-implements shared code (LessonBlock/renderMarkdown). Use the shared ~/workspace/curi code instead.`);
  }
}
ok('curi-desktop/src contains no forked lesson/quiz/content copies (thin shell only).');

// 2. Both route groups in curi import the same shared modules.
const studioLesson = path.join(curiRoot, 'app/studio/courses/[courseId]/lessons/[lessonId]/page.tsx');
const learnerLesson = path.join(curiRoot, 'components/LessonDetail.tsx');
const renderer = path.join(curiRoot, 'components/LessonRenderer.tsx');
for (const [label, file, needles] of [
  ['Studio lesson editor', studioLesson, ['@/lib/content', '@/lib/markdown']],
  ['Learner LessonDetail', learnerLesson, ['@/lib/content', '@/components/LessonRenderer']],
  ['LessonRenderer', renderer, ['@/lib/content', '@/lib/markdown', './VideoBlock', './QuizBlock']],
]) {
  if (!fs.existsSync(file)) fail(`expected shared-code file missing: ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) {
    if (!text.includes(needle)) fail(`${label} (${file}) does not import ${needle} — shared-code link broken.`);
  }
  ok(`${label} imports ${needles.join(', ')}`);
}

console.log('check-shared PASSED: Studio and learner share one codebase in ~/workspace/curi; curi-desktop is a thin shell.');
