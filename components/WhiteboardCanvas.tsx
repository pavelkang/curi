"use client";

// The one TLDraw wrapper in Curi. Used by the Studio editor (editable)
// and by the learner view (read-only). The drawing is a TLDraw store
// snapshot — the artifact itself, not a screenshot.
//
// - Editor: TLDraw with full tools. Store changes are debounced into
//   onSnapshot(getSnapshot(store).document) so the lesson page can
//   keep the snapshot in lesson content state until "Save lesson".
// - Reader: hideUi + editor.updateInstanceState({ isReadonly: true })
//   on mount. A student can pan/zoom but cannot change the drawing.
// - Snapshot loading happens once, in the store initializer. The
//   parent must remount this component (key change) to load a
//   different snapshot — re-loading on every parent render would wipe
//   in-progress drawing.
// - Malformed snapshot: falls back to an empty canvas, never throws.

import { useEffect, useRef, useState } from "react";
import { createTLStore, getSnapshot, loadSnapshot, Tldraw } from "tldraw";
import type { Editor } from "tldraw";
import "tldraw/tldraw.css";
import { isValidWhiteboardSnapshot } from "@/lib/content";

export default function WhiteboardCanvas({
  snapshot,
  readOnly = false,
  onSnapshot,
  onEditor,
  className,
  height = 480,
}: {
  snapshot?: unknown;
  readOnly?: boolean;
  onSnapshot?: (doc: unknown) => void;
  onEditor?: (editor: Editor) => void;
  className?: string;
  height?: number;
}) {
  // Load the snapshot once, when the store is created.
  const [store] = useState(() => {
    const s = createTLStore();
    if (isValidWhiteboardSnapshot(snapshot)) {
      try {
        loadSnapshot(s, snapshot as never);
      } catch {
        // Bad snapshot: empty canvas. parseContent already filters,
        // this is the second line of defence.
      }
    }
    return s;
  });
  // Editor instance, set by onMount. The store listener below depends
  // on it — a ref alone would miss the mount ordering (the listener
  // effect can run before onMount fires).
  const [editor, setEditor] = useState<Editor | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const onEditorRef = useRef(onEditor);
  onEditorRef.current = onEditor;

  // Debounced store listener: push the document snapshot up to the
  // lesson page as the teacher draws. Read-only viewers never fire it.
  useEffect(() => {
    if (readOnly || !editor || !onSnapshotRef.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const push = () => {
      if (disposed) return;
      try {
        const doc = getSnapshot(editor.store).document;
        onSnapshotRef.current?.(doc);
      } catch {
        // Snapshot read failing must not break drawing.
      }
    };
    const dispose = editor.store.listen(
      () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(push, 500);
      },
      { scope: "document" },
    );
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      dispose();
    };
  }, [readOnly, editor]);

  return (
    <div className={className} style={{ position: "relative", height, width: "100%" }}>
      <Tldraw
        store={store}
        hideUi={readOnly}
        onMount={(ed) => {
          setEditor(ed);
          if (readOnly) ed.updateInstanceState({ isReadonly: true });
          onEditorRef.current?.(ed);
        }}
      />
    </div>
  );
}
