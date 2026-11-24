# BizSaathi Design System

A warm, ledger-inspired design system for BizSaathi — the bookkeeping companion
built for Indian small businesses.

The name sets the tone: *saathi* (साथी) means a trusted companion. The system
should feel like a ledger kept by someone competent sitting next to you — warm
paper, honest numbers, nothing showy.

## Files

| File | Purpose |
| --- | --- |
| `design-tokens.css` | Single source of truth: color, type, spacing, radius, shadow, motion, layout. |
| `components.css` | Component classes. Every color is read from a token. |
| `styleguide.html` | Living reference page that exercises every component. |

## Using it

```html
<link rel="stylesheet" href="/design-tokens.css">
<link rel="stylesheet" href="/components.css">
```

Link both with a leading slash — a relative `href` breaks when the page is
served from a nested route.

Component classes are prefixed `bs-` (BizSaathi) so the system can live inside
a host application without colliding with that application's own styles.

```html
<button class="bs-btn bs-btn--primary">Record invoice</button>
<div class="bs-card">
  <p class="bs-stat__label">Receivables</p>
  <p class="bs-figure bs-figure--positive bs-numeric">₹4,82,150</p>
</div>
```

## Foundations

### Color

Light is the default palette; `prefers-color-scheme: dark` redefines only the
color tokens, so type, spacing, radius, shadow and motion are shared.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `--surface` | `#fbf8f3` | `#14120f` | Page background |
| `--surface-raised` | `#ffffff` | `#1f1c18` | Cards, inputs, popovers |
| `--surface-sunken` | `#f3efe7` | `#100e0c` | Table headers, inset panels |
| `--text` | `#1f1a15` | `#f5f1ea` | Body and headings |
| `--text-muted` | `#6b6157` | `#a89e92` | Supporting copy |
| `--text-subtle` | `#7a7064` | `#8f8579` | Captions, metadata |
| `--border` | `#e2dcd1` | `#33302a` | Hairline separators |
| `--border-strong` | `#7a7064` | `#7a7167` | Control outlines (3:1 UI minimum) |
| `--accent` | `#0f5f4a` | `#57c79a` | Primary action, links, focus |
| `--secondary` | `#8f4405` | `#f0a563` | Highlights, on-track money states |
| `--success` | `#14713f` | `#4fc98a` | Paid, balanced, positive |
| `--warning` | `#8a5200` | `#e0a138` | Due soon, needs attention |
| `--danger` | `#a8321f` | `#f0685f` | Overdue, failed, destructive |
| `--info` | `#1f5673` | `#7fb8d8` | Informational only |

The accent is a deep ledger green — the trust-and-money color. Marigold is a
restrained secondary, not a second brand color. Status colors are never used as
accents or decoration.

### Typography

| Token | Family | Role |
| --- | --- | --- |
| `--font-display` | Source Serif 4 | Headlines, ledger figures, page titles |
| `--font-body` | Public Sans | Body copy, UI, tables |
| `--font-mono` | IBM Plex Mono | Invoice IDs, amounts, code |
| Devanagari fallback | Noto Sans/Serif Devanagari | First-class, not an afterthought |

The type scale is 1.25 (major third), rem-based so it respects the reader's own
browser font-size setting. Large display sizes get negative tracking; small
uppercase labels get positive tracking.

### Spacing, radius, motion

- **Spacing** — 4px base unit, `--space-1` through `--space-24`.
- **Radius** — 2 / 4 / 6 / 10 / 14px. Small by design: controls should read as
  tools. `--radius-pill` is reserved for status chips.
- **Motion** — 120ms / 180ms / 280ms with `--ease-standard` and `--ease-out`.
  Nothing bounces. `prefers-reduced-motion` collapses every duration.

## Accessibility

Every text/background pair in the system was verified with real WCAG 2.1
contrast math rather than estimated. Measured ratios:

**Light mode**

| Pair | Ratio | AA |
| --- | --- | --- |
| Text on surface | 16.29:1 | Pass |
| Text on raised | 17.26:1 | Pass |
| Muted text on surface | 5.71:1 | Pass |
| Muted text on raised | 6.05:1 | Pass |
| Subtle text on surface | 4.58:1 | Pass |
| Subtle text on raised | 4.85:1 | Pass |
| Accent link on surface | 7.19:1 | Pass |
| Accent link on raised | 7.62:1 | Pass |
| Button label on accent | 7.62:1 | Pass |
| Button label on accent hover | 9.81:1 | Pass |
| Secondary button label | 7.01:1 | Pass |
| Success on success-subtle | 5.27:1 | Pass |
| Warning on warning-subtle | 5.60:1 | Pass |
| Danger on danger-subtle | 5.74:1 | Pass |
| Info on info-subtle | 6.88:1 | Pass |
| Border-strong vs raised (UI 3:1) | 3.83:1 | Pass |

**Dark mode**

| Pair | Ratio | AA |
| --- | --- | --- |
| Text on surface | 16.61:1 | Pass |
| Text on raised | 15.07:1 | Pass |
| Muted text on surface | 7.10:1 | Pass |
| Muted text on raised | 6.44:1 | Pass |
| Subtle text on raised | 4.69:1 | Pass |
| Accent link on raised | 8.11:1 | Pass |
| Button label on accent | 8.08:1 | Pass |
| Secondary button label | 8.44:1 | Pass |
| Success on success-subtle | 6.83:1 | Pass |
| Warning on warning-subtle | 6.62:1 | Pass |
| Danger on danger-subtle | 5.34:1 | Pass |
| Info on info-subtle | 7.14:1 | Pass |
| Border-strong vs raised (UI 3:1) | 3.54:1 | Pass |

Other accessibility provisions built in:

- One focus treatment system-wide — a 2px accent ring at 2px offset.
- `prefers-contrast: more` hardens borders and strengthens muted text.
- `prefers-reduced-motion` is respected globally and on the skeleton loader.
- Status is never communicated by color alone — badges always carry a label.
- Semantic HTML throughout: `<caption>` on tables, `scope` on headers,
  `aria-invalid` / `aria-describedby` on invalid fields, `role="progressbar"`
  with value attributes.
- A skip link and labeled navigation landmarks on the styleguide.

## Principles

1. One primary action per screen, and it gets the accent.
2. Marigold is a highlight, not a second brand.
3. Status colors mean status — nothing else.
4. Money is set in the display serif with tabular figures so columns align
   like a printed statement.
5. Borders do the separating; shadows only lift genuinely floating surfaces.
6. Never rely on color alone.

## Adding to the system

New tokens go in `design-tokens.css` with a comment explaining what the role
is. New components go in `components.css` prefixed `bs-`, reading only from
tokens — never a hardcoded hex. Then add a live example to `styleguide.html`,
and if a new color pair is introduced, verify it with the `check_contrast`
tool before shipping.
