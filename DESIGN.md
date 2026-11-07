---
name: Log Dive
description: Visual identity for shiyow5/log-dive — a dungeon-exploration game built as a browser tab. Dark debugging theme with high-contrast warnings.
omitted:
  - elevation
  - shapes
colors:
  primary: "#E0E0E0"
  secondary: "#6C7293"
  tertiary: "#FF6B6B"
  on-tertiary: "#1A1A2E"
  neutral: "#0D0D1A"
  on-neutral: "#E0E0E0"
  highlight: "#4ECDC4"
  warning: "#FFE66D"
  success: "#95E1D3"
typography:
  h1:
    fontFamily: "DotGothic16"
    fontSize: "1.75rem"
    fontWeight: "400"
    lineHeight: "1.3"
  h2:
    fontFamily: "DotGothic16"
    fontSize: "1.25rem"
    fontWeight: "400"
    lineHeight: "1.3"
  body-lg:
    fontFamily: "DotGothic16"
    fontSize: "1rem"
    lineHeight: "1.6"
  body-md:
    fontFamily: "DotGothic16"
    fontSize: "0.875rem"
    lineHeight: "1.5"
  label-sm:
    fontFamily: "DotGothic16"
    fontSize: "0.75rem"
    lineHeight: "1.4"
  label-caps:
    fontFamily: "DotGothic16"
    fontSize: "0.625rem"
    lineHeight: "1.4"
    letterSpacing: "0.05em"
rounded:
  sm: 2px
  md: 4px
  lg: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.label-sm}"
  button-primary-hover:
    backgroundColor: "#FF8787"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    border: "1px solid {colors.secondary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.label-sm}"
  panel:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    border: "1px solid #2A2A4A"
    padding: "16px"
  tile:
    backgroundColor: "#13132B"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    border: "1px solid #2A2A4A"
    padding: "8px"
  damage-number:
    textColor: "{colors.tertiary}"
    typography: "{typography.h1}"
    fontWeight: "700"
  health-bar-bg:
    backgroundColor: "#2A2A4A"
    rounded: "{rounded.sm}"
    height: "8px"
  health-bar-fill:
    backgroundColor: "{colors.success}"
    rounded: "{rounded.sm}"
---

## Overview

Log Dive is a dungeon-exploration game built entirely inside a browser tab. The visual identity is a **dark debugging theme** that evokes a hacker's terminal mixed with retro dungeon crawler aesthetics. The palette centers on deep navy-black with high-contrast accent colors for warnings (red), discoveries (teal), and completions (mint).

The design philosophy is "readable at a glance under pressure." Every critical element — enemy HP, item count, warning messages — uses the highest contrast colors so the player can react instantly.

## Colors

The palette is built on a near-black base (#0D0D1A) with three accent roles:

- **Tertiary (#FF6B6B):** "Critical Red" — damage, enemy alerts, dangerous states. The most saturated color in the palette.
- **Highlight (#4ECDC4):** "Discovery Cyan" — item pickups, map reveals, successful actions.
- **Success (#95E1D3):** "Clear Mint" — stage clear, quest complete, healing.
- **Warning (#FFE66D):** "Caution Yellow" — traps, low HP threshold, important notices.

Secondary and primary are desaturated grays that keep the UI from overwhelming the player. All text uses #E0E0E0 on #0D0D1A for a contrast ratio above 14:1 — well above WCAG AA requirements.

## Typography

The entire UI uses **DotGothic16** (SIL OFL 1.1). This pixel-optimized dot-matrix font matches the game's retro aesthetic while maintaining legibility at small sizes. The font is bundled in `assets/font/` with the OFL license file.

- Headings: 1.75rem / 1.25rem with normal weight
- Body: 1rem / 0.875rem with comfortable line height
- Labels: 0.75rem down to 0.625rem for HUD elements

## Layout

The game uses a fixed grid with 8px spacing scale. All UI panels use 4px rounded corners for a crisp, retro feel. The HUD at the top of the screen has fixed dimensions — HP bar (left), item count (center), floor indicator (right) — and does not resize during gameplay.

Room interiors use a centered play area with UI panels overlaying at edges. No margins or padding is used for the tile grid itself; spacing comes from the tile size and gap.

## Components

### Buttons
Primary buttons use the tertiary red with on-tertiary dark text. Secondary (cancel/back) buttons use outlined style with secondary gray.

### Panels
Main UI panels have a dark navy background (#0D0D1A) with a subtle 1px border (#2A2A4A). Interior padding is 16px.

### Tiles
Individual room/area tiles use a slightly lighter background (#13132B) with the same border color.

### HUD Elements
- Health bar: 8px high, mint fill (#95E1D3) on dark gray track
- Damage numbers: oversized tertiary red text at 1.75rem
- Floor indicator: secondary gray label-caps

## Do's and Don'ts

- **Do** use high-contrast accent colors for game-critical information
- **Do** keep all text at 16px equivalent or larger (DotGothic16 0.75rem = ~12px, used only for non-critical HUD labels)
- **Do** maintain consistent 8px/16px spacing throughout
- **Do** bundle DotGothic16 with OFL license file
- **Don't** use PixelSRPG-Forge assets (unresolved rights)
- **Don't** introduce additional font families
- **Don't** use pure white (#FFFFFF) — always use #E0E0E0 for a softer reading experience
- **Don't** use rounded corners larger than 8px — the retro aesthetic calls for sharper edges
