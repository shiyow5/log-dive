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
    fontSize: "2rem"
    fontWeight: "400"
    lineHeight: "1.3"
  h2:
    fontFamily: "DotGothic16"
    fontSize: "1rem"
    fontWeight: "400"
    lineHeight: "1.3"
  h3:
    fontFamily: "DotGothic16"
    fontSize: "0.875rem"
    fontWeight: "700"
    lineHeight: "1.3"
  body:
    fontFamily: "DotGothic16"
    fontSize: "1rem"
    lineHeight: "1.6"
  caption:
    fontFamily: "DotGothic16"
    fontSize: "0.875rem"
    lineHeight: "1.4"
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
    typography: "{typography.caption}"
  button-primary-hover:
    backgroundColor: "#FF8787"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    border: "1px solid {colors.secondary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.caption}"
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

### Font size tiers (#105)

| Tier    | Role                                   | Size        | Weight       |
| ------- | -------------------------------------- | ----------- | ------------ |
| h1      | Title screen, result                   | 32px (2rem) | normal (400) |
| h2      | Panel subtitle, battle heading         | 16px (1rem) | normal (400) |
| h3      | Section headings (cand/symptom labels) | 14px        | bold (700)   |
| body    | Body text                              | 16px (1rem) | normal (400) |
| caption | Labels, disabled reasons, CPU label    | 14px        | normal (400) |

- All body text ≥ 16px; all captions ≥ 14px. No text below 14px in any screen.

### Contrast table (#105)

| Foreground | Background | Ratio   | WCAG AA | Usage                            |
| ---------- | ---------- | ------- | ------- | -------------------------------- |
| #E4F1EC    | #0F1A1C    | 12.64:1 | AAA     | Primary text on bg               |
| #E4F1EC    | #1B2B2E    | 10.02:1 | AAA     | Primary text on panel            |
| #7EBEAB    | #0F1A1C    | 7.89:1  | AA      | Accent on bg                     |
| #7EBEAB    | #1B2B2E    | 6.27:1  | AA      | Accent on panel                  |
| #8FA9A3    | #0F1A1C    | 7.07:1  | AAA     | Frame outer / text-weak on bg    |
| #8FA9A3    | #1B2B2E    | 5.85:1  | AA      | Frame outer / text-weak on panel |
| #A9C2BC    | #0F1A1C    | 5.12:1  | AA      | Weak text on bg                  |
| #A9C2BC    | #1B2B2E    | 4.07:1  | AA      | Weak text on panel               |
| #A9C2BC    | #26393D    | 6.41:1  | AA      | Disabled button text             |
| #C5DDD5    | #1B2B2E    | 10.25:1 | AAA     | Corner decoration                |
| #E8C468    | #0F1A1C    | 1.78:1  | Fail    | Hint (accent on bg, decorative)  |
| #E8C468    | #1B2B2E    | 1.42:1  | Fail    | Hint (on panel, decorative)      |
| #FF6B5E    | #0F1A1C    | 3.55:1  | Fail    | Danger on bg                     |
| #FF6B5E    | #1B2B2E    | 2.82:1  | Fail    | Danger on panel                  |
| #FF6B5E    | #0F1A1C    | 3.55:1  | Fail    | Danger text on bg                |
| #8FD694    | #1B2B2E    | 3.69:1  | Fail    | OK/green on panel                |

Notes:

- Hint (#E8C468) and danger (#FF6B5E) are supplementary symbols. They pass contrast when used on the darkest available surface or paired with non-text emphasis (shape, position).
- `--ld-text-weak: #8FA9A3` on `--ld-surface: #1B2B2E` is 5.85:1 — exceeds 4.5:1 AA.

## Layout

The game uses a fixed grid with 8px spacing scale. All UI panels use 4px rounded corners for a crisp, retro feel. The HUD at the top of the screen has fixed dimensions — HP bar (left), item count (center), floor indicator (right) — and does not resize during gameplay.

Room interiors use a centered play area with UI panels overlaying at edges. No margins or padding is used for the tile grid itself; spacing comes from the tile size and gap.

## Components

### Buttons

Primary buttons use the tertiary red with on-tertiary dark text. Secondary (cancel/back) buttons use outlined style with secondary gray.

### Panels

Main UI panels use `--ld-surface` #1B2B2E. Interior padding is 16px. (The implementation is the source of truth: `--ld-*` variables in `src/ui/hud.css` `:root`. Change DESIGN.md and hud.css in the same PR.)

**Frame token (#102, shared with auto-encore #111)** — applied to `.hud-panel`. The outer line is the element's 1px border; the inner band and corner dots are an inset shadow and background gradients.

| Part                         | Variable            | Value                                                                  |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------- |
| Outer line                   | `--ld-frame-outer`  | 1px #8FA9A3 (7.07:1 on bg, 5.85:1 on panel)                            |
| Inner band                   | `--ld-frame-inner`  | 2px #070D0E (inset)                                                    |
| Corner dots                  | `--ld-frame-corner` | 3×3px #C5DDD5 at the 4 inner corners (2px inset), 10.25:1              |
| Selected (recommended skill) | `--ld-bracket`      | solid 2px #E8C468 + corner brackets (6px long, 2px thick, 4px outside) |
| Disabled (#94)               | `--ld-text-weak`    | 2px dashed #8FA9A3, text #A9C2BC (no opacity)                          |

**Buttons** — primary = filled `--ld-accent` + bright frame `--ld-frame-bright` #E4F1EC (2px); secondary = transparent fill + 2px `--ld-text-weak` frame. States: hover = accent frame, pressed = 1px down (primary darkens to 85%), focus = 2px `--ld-hint` outline (offset 2px), disabled = #94 spec: text #A9C2BC on a 2px dashed #8FA9A3 frame, reason on a 2nd line (primary also drops its fill).

### Tiles

Individual room/area tiles use a slightly lighter background (#13132B) with the same border color.

### Enemy sprites (Issue #103)

- 16×16 px dot art, 2 frames each: idle and hit (hit shows for 250ms when HP drops). Defined in `src/art/enemy-sprites.ts`.
- 3 normal kinds (bug / blob / ghost) + 1 boss. Normal kind is chosen from the room ID, never from the BugId (the identity must not leak).
- Normal = 3× (48px), boss = 4× (64px), integer scale only, nearest-neighbor. Idle bob is 1px steps.
- Boss sits 8px higher than normal enemies so its face is not hidden by the HUD panel at 1280×720.
- HP bar is 48px wide, 4px high, with a numeric `hp/max` on its left.

### Impact FX (Issue #104)

Phaser tweens only (no new canvas). Values live in `IMPACT` in `src/fx/impact-fx.ts`; keep both in sync. Nothing covers text: HUD, log, enemy name and HP bar are never overlapped.

| Event            | Effect                                                                  | Time          | Color                    |
| ---------------- | ----------------------------------------------------------------------- | ------------- | ------------------------ |
| playerDamaged    | camera shake 4px, horizontal only, decaying (overwrites, never adds)    | 120ms         | -                        |
| playerDamaged    | 3px edge-only flash                                                     | 120ms         | #FF6B6B @ 40%            |
| playerDamaged    | "-N" pop at left of canvas, rises 8px, fades in the last 200ms          | 600ms         | #FF6B6B, outline #0D0D1A |
| bugDamaged       | "N" pop at the enemy's upper right, same motion                         | 600ms         | #FFE66D, outline #0D0D1A |
| looted           | 16x16 chest, closed 100ms then open + glow 300ms, stays open until 1.2s | 1.2s          | #FFE66D                  |
| descended        | fade out then in                                                        | 200ms + 200ms | #0D0D1A                  |
| candidateRemoved | log line background highlight (text color unchanged)                    | 800ms         | #4ECDC4 @ 20%            |

- Max 3 pops at once. Pop coordinates are rounded to integer px (no blur).
- `prefers-reduced-motion` / `?fx=0`: no shake, flash, rise, fade or glow. Numbers appear fixed and vanish after 600ms; the chest shows open for 1.2s; the log highlight stays (background only).

### HUD Elements

- Health bar: 8px high, mint fill (#95E1D3) on dark gray track
- Damage numbers: oversized tertiary red text at 1.75rem
- Floor indicator: secondary gray label-caps

## Do's and Don'ts

- **Do** use high-contrast accent colors for game-critical information
- **Do** keep all text ≥ 14px (caption minimum) or ≥ 16px (body)
- **Do** maintain consistent 8px/16px spacing throughout
- **Do** bundle DotGothic16 with OFL license file
- **Don't** use PixelSRPG-Forge assets (unresolved rights)
- **Don't** introduce additional font families
- **Don't** use pure white (#FFFFFF) — always use #E0E0E0 for a softer reading experience
- **Don't** use rounded corners larger than 8px — the retro aesthetic calls for sharper edges
