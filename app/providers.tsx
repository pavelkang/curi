'use client';

// Astryx providers: the built Curi theme (themes/curi/curiTheme.ts,
// compiled by `npx @astryxdesign/cli theme build`) and the Next.js Link
// component, so Astryx Button/Link/TopNavItem render real Next links.
// Mode is pinned to light — Curi has no dark theme.
//
// The StudioProvider also lives here (not in app/studio/layout.tsx):
// the learner home, course, and lesson pages read the SAME demo store
// the Studio uses, so a demo course a teacher creates is previewable
// as a learner. One provider, one source of truth — a second provider
// in the Studio layout would be a separate store and the two would
// diverge. In live mode the provider only loads the signed-in
// creator's own courses; learner pages still fetch published courses
// from Supabase directly.

import Link from 'next/link';
import {Theme} from '@astryxdesign/core/theme';
import {LinkProvider} from '@astryxdesign/core/Link';
import {curiTheme} from '@/themes/curi/curi';
import {StudioProvider} from '@/lib/studio-store';

export function Providers({children}: {children: React.ReactNode}) {
  return (
    <Theme theme={curiTheme} mode="light">
      <LinkProvider component={Link}>
        <StudioProvider>{children}</StudioProvider>
      </LinkProvider>
    </Theme>
  );
}
