// Curi theme for Astryx — extends the neutral theme, re-pointed at Curi's
// violet accent (#5B4BDB) and page background (#F6F7FB).
//
// Built with the Astryx CLI (`npx @astryxdesign/cli theme build
// themes/curi/curiTheme.ts`); the generated curiTheme.css / curiTheme.js /
// curiTheme.d.ts next to this file are the production outputs — do not edit
// them by hand. Providers import the built JS; app/globals.css imports the
// built CSS.
//
// Typography follows Astryx: Figtree for body and headings (loaded
// self-hosted via next/font/google in app/layout.tsx, which emits
// @font-face rules under the family name "Figtree" — no Google Fonts
// @import at runtime). Plus Jakarta Sans is gone: Astryx prescribes
// Figtree, and its tokens win where they conflict.

import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

export const curiTheme = defineTheme({
  name: 'curi',
  extends: neutralTheme,
  // [light, dark] tuple — an accent override in `tokens` alone would leave
  // --color-on-accent baked from the base seed.
  color: {accent: ['#5B4BDB', '#8B7CFF'], neutralStyle: 'cool'},
  typography: {
    body: {
      family: 'Figtree',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: 'Figtree',
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
  },
  tokens: {
    // Curi page background, light-only app (Theme mode is pinned to light
    // in app/providers.tsx, so the dark value is never rendered).
    '--color-background-body': ['#F6F7FB', '#F6F7FB'],
  },
  components: {
    // Curi's flat pill buttons and 20px cards, kept from the old theme.
    button: {base: {borderRadius: '9999px'}},
    card: {base: {borderRadius: '20px'}},
  },
});
