import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** src/core はルール（純粋 TS）。決定性を壊すもの・画面に依存するものを書かない。 */
const FORBIDDEN: readonly [string, RegExp][] = [
  ["Math.random", /Math\.random/],
  ["Date", /\bDate\b/],
  ["performance", /\bperformance\b/],
  ["phaser", /phaser/i],
  ["window", /\bwindow\b/],
  ["document", /\bdocument\b/],
];

/** コメントは説明に禁止語を書くことがあるので除いてから調べる。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("src/core の禁止語", () => {
  const coreDir = join(__dirname, "../../src/core");
  for (const file of files(coreDir)) {
    it(file.slice(coreDir.length + 1), () => {
      const text = stripComments(readFileSync(file, "utf8"));
      for (const [word, re] of FORBIDDEN) {
        expect(re.test(text), `${word} を使っている`).toBe(false);
      }
    });
  }
});

describe("禁止語チェック自体", () => {
  it("コメントは無視し、コードの中は見つける", () => {
    const src =
      '// Math.random は使わない\n/* window */\nconst x = Math.random();\nconst u = "https://x";';
    const text = stripComments(src);
    expect(/Math\.random/.test(text)).toBe(true);
    expect(/\bwindow\b/.test(text)).toBe(false);
    expect(text).toContain("https://x");
  });
});
