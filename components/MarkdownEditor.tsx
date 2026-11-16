"use client";

// Markdown authoring for lesson text blocks: toolbar + live preview in
// one place, replacing the old textarea with the render shown separately
// below it. @uiw/react-md-editor stores the raw markdown string
// verbatim, so the lesson block shape ({kind: "markdown", markdown})
// is unchanged and learner rendering (lib/markdown.ts) is untouched.
//
// Toolbar is deliberately limited to what the learner renderer
// supports (bold, italic, headings, links, code, code blocks, lists):
// the editor preview is full CommonMark/GFM, so offering table /
// image / strikethrough buttons would let a teacher author something
// that looks right here and renders as raw text to learners.
//
// Styling: the editor ships its own CSS (imported here, plus the
// preview CSS); app/globals.css overrides the font, radius and
// borders to the Astryx theme under .curi-md-editor. Loaded
// client-only (dynamic ssr:false in the lesson page) — the editor
// touches window at import time.

import MDEditor, { commands } from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

// Standard markdown controls only — no fullscreen, no edit/preview
// mode switcher (the editor is always live: edit + preview together),
// nothing the learner renderer cannot show.
const TOOLBAR = [
  commands.bold,
  commands.italic,
  commands.title,
  commands.divider,
  commands.link,
  commands.code,
  commands.codeBlock,
  commands.divider,
  commands.unorderedListCommand,
  commands.orderedListCommand,
];

export default function MarkdownEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="curi-md-editor" data-color-mode="light">
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? "")}
        preview="live"
        height={320}
        visibleDragbar={false}
        commands={TOOLBAR}
        extraCommands={[]}
        textareaProps={{ placeholder: "Write lesson notes…" }}
      />
    </div>
  );
}
