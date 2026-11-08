---
name: PR X-ray
description: Understand a pull request before you review it, inside bb.
colors:
  foreground: "var(--foreground)"
  background: "var(--background)"
  card: "var(--card)"
  muted: "var(--muted)"
  muted-foreground: "var(--muted-foreground)"
  border: "var(--border)"
  input: "var(--input)"
  ring: "var(--ring)"
  primary: "var(--primary)"
  secondary: "var(--secondary)"
  state-hover: "var(--state-hover)"
  state-active: "var(--state-active)"
  warning: "var(--warning)"
  warning-text: "var(--warning-text)"
  success: "var(--success)"
  destructive: "var(--destructive)"
typography:
  title:
    fontFamily: "var(--font-sans)"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: "1.375rem"
  body:
    fontFamily: "var(--font-sans)"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.43
  body-small:
    fontFamily: "var(--font-sans)"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
  label:
    fontFamily: "var(--font-sans)"
    fontSize: "11px"
    fontWeight: 500
  overline:
    fontFamily: "var(--font-sans)"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.025em"
  code:
    fontFamily: "var(--font-mono)"
    fontSize: "0.75rem"
rounded:
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.state-hover}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  tag-chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  attention-pill:
    textColor: "{colors.warning-text}"
    rounded: "{rounded.full}"
    padding: "0 6px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.lg}"
---

# Design System: PR X-ray

## Overview

**Creative North Star: "The Light Table"**

PR X-ray is a quiet, evenly lit surface where a change is laid out to be read. The chrome stays neutral and small so the code, the walkthrough and the diagrams are the subject. It is an Operate surface inside bb: dense, scannable, and native. Every color, font and radius comes from bb's active theme through CSS variables, so the plugin looks right in any bb theme, light or dark, without owning a palette of its own.

Brand lives in precise details, not decoration: a single amber "attention" voice for anything that changed or is unsent (files changed since viewed, pending comments, new commits, untrusted content), monospace for anything that is a path or a commit, and instant hover feedback. Depth is flat. Borders separate things; shadows are reserved for what floats above the page.

**Key Characteristics:**
- Theme-inherited: no hard-coded colors, fonts or radii.
- Dense, small type (13px body, 11px labels) tuned for long reading sessions.
- One attention color (warning) carries every "look here" signal.
- Flat, border-first surfaces; shadows only for floating layers.
- Quiet and exact controls: small, low-contrast, instant hover.

## Colors

The palette is bb's neutral theme plus three semantic signals; the plugin never defines its own hues.

### Primary
- **Ink** (`foreground`): body text and the one solid button per area (inverted: ink background, paper text).
- **Signal Line** (`primary`): progress bars and links only.

### Neutral
- **Paper** (`background`): page and floating-panel background.
- **Sheet** (`card`): comment threads, severity items, settled cards.
- **Pencil** (`muted-foreground`): secondary text, meta lines, hints, counts. The most used color in the plugin.
- **Wash** (`muted`): progress tracks and quiet fills.
- **Rule** (`border`, `input`): every divider, card edge and control outline.
- **Touch** (`state-hover`, `state-active`): hover and pressed/open fills for ghost controls and rows.

### Semantic
- **Amber Attention** (`warning`, `warning-text`): "changed since viewed", pending (unsent) comments, new-commit and trust banners, medium-severity items. Open threads and comment counts are not warnings and stay neutral. Used as a 5–10% tint fill, a 50–70% border and `warning-text` for the words.
- **Added** (`success`): additions counts.
- **Removed / Error** (`destructive`): deletions, errors, high severity.

### Named Rules
**The Borrowed Light Rule.** Every color is a bb theme variable. Never write a hex value in plugin UI; if a role is missing, use the nearest bb token.

**The One Attention Rule.** Anything that asks the reviewer to act uses the warning family. Don't add a second accent for attention.

## Typography

**Body Font:** bb's sans (`--font-sans`)
**Label/Mono Font:** bb's mono (`--font-mono`)

**Character:** The host's system pairing, set small and tight. Mono marks things that are literally from the repo: file paths, commit SHAs, keyboard hints' targets, timers.

### Hierarchy
- **Title** (600, 15px, 22px line-height): section and group headings, card titles.
- **Body** (400, 13px, ~1.43): comments, walkthrough text, dialogs. Comment cards cap at 48rem wide.
- **Body small** (400, 12px): meta lines, file rows, buttons in the `sm` size.
- **Label** (500, 11px): chips, legends, counts, keyboard hints.
- **Overline** (400, 10px, uppercase, 0.025em tracking): node kind and change in the diagram node panel, severity words.
- **Code** (mono, 12px): paths, SHAs, file lists.

### Named Rules
**The Repo-Is-Mono Rule.** If the text is copied from the repository (path, SHA, branch), set it in mono. Nothing else is mono.

## Layout

Content sits in a centered column up to 1400px wide, padded 16px on small screens and 24px from `md` up. Groups stack with 32px between them (Diff) or 24px (Explain). Inside components the rhythm is 4px-based: 8px gaps are the default, 12px padding for cards, 6px gaps for icon-plus-text. Floating panels size with `min()` against the viewport (chat: 420px × 600px max). Coarse pointers get taller inputs and 16px text via the kit's coarse-pointer classes.

## Elevation & Depth

Flat by default. Surfaces are separated by 1px theme borders and tonal fills, not shadows. A hairline shadow (`shadow-xs`) sits under comment cards and the diagram zoom toolbar so they read as objects on the table. Large shadows exist only for true floating layers: the chat launcher (`shadow-lg`) and the chat panel (`shadow-2xl`). Shadow values come from bb's theme.

### Named Rules
**The Light Table Rule.** Nothing on the page casts a real shadow. Only layers that float above it (chat, popovers, dialogs) do.

## Shapes

Corners follow bb's `--radius`: controls and small panels use `md`, cards, the diagram area and the walkthrough panel `lg`, the chat panel `xl`. Chips, counters, pills and avatars are fully round. Diagram node shapes are drawn by the PR Lens renderer, not by us.

## Components

### Buttons
Quiet and exact, from the bb kit (`components/ui/button.tsx`).
- **Shape:** gently rounded (`rounded.md`), 36px tall, 32px for `sm`.
- **Primary:** ink background, paper text, 90% on hover. At most one per area.
- **Outline:** 1px input border, transparent, Touch fill on hover.
- **Ghost:** no chrome; Touch fill on hover; Active fill when pressed or open. The default for toolbars and row actions.
- **Hover / Focus:** colors change instantly on hover in, ease 150ms out; 1px ring on `focus-visible`; 50% opacity when disabled.

### Chips
- **Tag chip:** full-round, 1px border, 11px medium Pencil text; Touch fill when clickable.
- **Attention pill:** full-round, amber tint fill and border, `warning-text` words. Marks "updated" files and changed-since-viewed.

### Cards / Containers
- **Corner Style:** `rounded.lg`.
- **Background:** Sheet (`card`) for open threads; muted 30% tint when resolved or outdated. Pending comments use the amber tint.
- **Shadow Strategy:** hairline only (see Elevation).
- **Border:** 1px Rule all round. No thick colored side stripes; status is carried by fill, icon and words.
- **Internal Padding:** 12px; 24px for kit Card sections.

### Inputs / Fields
- **Style:** 1px input border, transparent fill, `rounded.md`, 12px horizontal padding, Pencil placeholder.
- **Focus:** 1px ring in the theme `ring` color.
- **Error / Disabled:** errors appear as `destructive` text below with `role="alert"`; disabled at 50% opacity.

### Navigation
Diff and Explain tabs and the file list use ghost rows: Pencil text at rest, Touch fill on hover, Active fill and ink text when selected. Viewed files dim to Pencil.

### PR Lens Diagram (signature)
The diagrams are PR Lens renders (ADR 0001): an SVG the server draws in light and dark, inlined in a pan/zoom canvas that fills the Explain tab's diagram area and takes the render's own background, so the drawing has no edge. Over it sits an atlas overlay in the SVG's own units: a click target per node or table (no ring on hover or selection, as in PR Lens; the node panel shows the selection, and only keyboard focus draws an outline, 12px out to clear the delta badge) and a full-round comment pin on its top-right corner, ink when any comment is open, muted otherwise, counter-scaled to keep its screen size. The walkthrough panel floats over the canvas's right edge; picking a step zooms to its focus and dims the rest with a veil in the render's background colour, one hole exactly at each focused element's atlas box (a card's badges are shrunk to 14px and moved 4px inside its top-right corner, so the hole never cuts them), with no rim: as in PR Lens, the veil alone marks the focus.

## Do's and Don'ts

### Do:
- **Do** use bb theme variables for every color, font, radius and shadow.
- **Do** build from `components/ui` before writing a new control.
- **Do** route every "needs your attention" signal through the warning family (tint fill, 50–70% border, `warning-text`).
- **Do** set repository text (paths, SHAs) in mono.
- **Do** keep hover instant (`duration-0` in, 150ms out) on controls.

### Don't:
- **Don't** hard-code hex colors or font families in plugin UI. The one exception is the PR Lens renderer's own palette and background inside the diagram canvas (ADR 0001).
- **Don't** add shadows to on-page cards beyond the hairline; save real elevation for floating layers.
- **Don't** put more than one solid (primary) button in the same area.
- **Don't** load remote images or media in comment or analysis content; show links or plain text.
