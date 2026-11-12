// Select-all on focus for title fields that still hold their default
// ("Untitled course" / "Untitled lesson" / "Untitled section").
//
// Why a wrapper, not an Input prop: Astryx TextInput exposes no
// onFocus, so the shared Input cannot pass one through. These handlers
// go on a wrapper element around the Input; focus and click bubble up
// from the inner <input>, whose value is checked at the moment of the
// event.
//
// Why only when the value is still the default: select-all on every
// focus would also wipe a real title the teacher clicked into to fix
// one word. A default title is never meant to be appended to —
// click-and-type used to produce "Untitled coursePasta Making
// Basics", which then propagated to the sidebar, checklist, learner
// pages and drafts queue — so only a still-default value is selected.
// Once the teacher types a real title, focus/click behave normally.
//
// Why both onFocus and onClick: keyboard focus (Tab) fires focus with
// no mouse event, so the selection survives; a mouse click fires focus
// first and then mouseup, whose default caret placement collapses the
// selection made on focus — the click handler re-selects after that.
// Both handlers are no-ops once the value is no longer the default.

import type { FocusEvent, MouseEvent } from "react";

function selectIfDefault(e: FocusEvent | MouseEvent, defaultTitle: string) {
  const target = e.target as HTMLInputElement | null;
  if (target instanceof HTMLInputElement && target.value === defaultTitle) {
    target.select();
  }
}

export function titleFocusHandlers(defaultTitle: string) {
  return {
    onFocus: (e: FocusEvent) => selectIfDefault(e, defaultTitle),
    onClick: (e: MouseEvent) => selectIfDefault(e, defaultTitle),
  };
}
