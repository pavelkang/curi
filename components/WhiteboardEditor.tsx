"use client";

// Creator side of a whiteboard block: full TLDraw canvas with tools.
// Drawing auto-flows into the lesson page (onSnapshot, debounced) so
// "Save lesson" persists it. Clear wipes the page's shapes only — the
// snapshot is still only saved when the lesson is saved.

import { useRef } from "react";
import type { Editor } from "tldraw";
import WhiteboardCanvas from "./WhiteboardCanvas";
import { Button } from "@/components/ui/button";

export default function WhiteboardEditor({
  snapshot,
  onSnapshot,
}: {
  snapshot?: unknown;
  onSnapshot: (doc: unknown) => void;
}) {
  const editorRef = useRef<Editor | null>(null);

  const clear = () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const ids = editor.getCurrentPageShapeIds();
      if (ids.size > 0) editor.deleteShapes([...ids]);
    } catch {
      // Clearing is a convenience; a failure must not lose the drawing.
    }
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border">
        <WhiteboardCanvas
          snapshot={snapshot}
          onSnapshot={onSnapshot}
          onEditor={(editor) => {
            editorRef.current = editor;
          }}
        />
      </div>
      <div>
        <Button label="Clear whiteboard" variant="ghost" size="sm" onClick={clear} />
      </div>
    </div>
  );
}
