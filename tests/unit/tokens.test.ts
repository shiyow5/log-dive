import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKEN_DEFAULTS, token } from "../../src/ui/tokens";
import { COLORS } from "../../src/scenes/map-symbols";

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

describe("配色トークン (#96)", () => {
  const css = readFileSync("src/ui/hud.css", "utf8");
  it("TOKEN_DEFAULTS が hud.css の :root と同じ値", () => {
    for (const [name, value] of Object.entries(TOKEN_DEFAULTS)) {
      expect(css, `--ld-${name}`).toMatch(new RegExp(`--ld-${name}:\\s*${value}\\b`, "i"));
    }
  });
  it("宝箱とヒントは同じ accent トークン", () => {
    expect(COLORS.hint).toBe(token("accent"));
    expect(token("accent")).toBe("#e8c468");
  });
  it("パネル枠は 2px・bg 比 3:1 以上", () => {
    expect(css).toMatch(/\.hud-panel \{[^}]*border: 2px solid var\(--ld-frame-outer\)/s);
    expect(token("border-weak")).toBe("#4a6a70");
    expect(contrast(token("border-weak"), token("bg"))).toBeGreaterThanOrEqual(3);
  });
});
