"use client";

// Student side of a whiteboard block: the teacher's drawing, rendered
// read-only from the stored snapshot. No tools, no editing — the
// drawing is the artifact. Pan/zoom still work; the drawing itself
// cannot be changed.

import WhiteboardCanvas from "./WhiteboardCanvas";
import { Text } from "@astryxdesign/core/Text";

export default function WhiteboardBlock({ snapshot }: { snapshot?: unknown }) {
  if (!snapshot) {
    return <Text type="supporting">Whiteboard is empty.</Text>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <WhiteboardCanvas snapshot={snapshot} readOnly />
    </div>
  );
}
