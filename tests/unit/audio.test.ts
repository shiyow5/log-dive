import { describe, expect, it } from "vitest";
import {
  BGM_BPM,
  BGM_INSTRUMENTS,
  BGM_PATTERNS,
  BGM_SEQUENCE,
  SFX,
  sfxForRun,
} from "../../src/audio/sounds";
import { renderSong } from "../../src/audio/zzfxm";
import type { RunEvent } from "../../src/core/run";

const ALL_EVENTS: RunEvent[] = [
  { t: "moved", room: "r1" },
  { t: "battleStart", room: "r1" },
  { t: "symptom", text: "x" },
  { t: "candidateRemoved", bug: "off-by-one" },
  { t: "bugDamaged", amount: 1, by: "hotfix" },
  { t: "degrade" },
  { t: "halted" },
  { t: "bugHaltedTurn" },
  { t: "bugClosed", bug: "off-by-one" },
  { t: "stairsOpened" },
  { t: "descended", floor: 2 },
  { t: "looted", skill: "breakpoint" },
  { t: "playerDamaged", amount: 1 },
  { t: "runEnd", phase: "won" },
  { t: "runEnd", phase: "lost" },
  { t: "runEnd", phase: "abandoned" },
];

describe("sfxForRun", () => {
  it("どの出来事にも SE がある", () => {
    for (const e of ALL_EVENTS) {
      const name = sfxForRun({ lastError: null, events: [e] });
      expect(name, e.t).not.toBeNull();
      expect(SFX[name!], e.t).toBeDefined();
    }
  });

  it("エラーならエラー音だけ", () => {
    const s = { lastError: { code: "x", message: "y" }, events: ALL_EVENTS } as never;
    expect(sfxForRun(s)).toBe("error");
  });

  it("同時に起きたら優先度の高い1つ（バグを閉じた > ダメージ）", () => {
    const events: RunEvent[] = [
      { t: "bugDamaged", amount: 3, by: "hotfix" },
      { t: "bugClosed", bug: "off-by-one" },
    ];
    expect(sfxForRun({ lastError: null, events })).toBe("bugClosed");
  });

  it("何も起きなければ鳴らさない", () => {
    expect(sfxForRun({ lastError: null, events: [] })).toBeNull();
  });
});

describe("BGM", () => {
  it("パターンの中のチャンネルは同じ長さ", () => {
    for (const p of BGM_PATTERNS) {
      for (const ch of p) expect(ch.length).toBe(p[0]!.length);
    }
  });

  it("楽器番号と並びが範囲内", () => {
    for (const p of BGM_PATTERNS) for (const ch of p) expect(BGM_INSTRUMENTS[ch[0]!]).toBeDefined();
    for (const i of BGM_SEQUENCE) expect(BGM_PATTERNS[i]).toBeDefined();
  });

  it("renderSong: 長さが曲の長さに合い、NaN が無い", () => {
    const rate = 8000;
    const build = () => new Array(100).fill(0.5);
    const [l, r] = renderSong(BGM_INSTRUMENTS, BGM_PATTERNS, BGM_SEQUENCE, BGM_BPM, rate, build);
    const beat = ((rate / BGM_BPM) * 60) >> 2;
    const steps = BGM_SEQUENCE.reduce((n, i) => n + BGM_PATTERNS[i]![0]!.length - 2, 0);
    expect(l.length).toBe(r.length);
    expect(l.length).toBeGreaterThanOrEqual((steps - 1) * beat);
    expect(l.length).toBeLessThanOrEqual((steps + 1) * beat);
    expect(l.some((v) => v !== 0)).toBe(true);
    expect([...l, ...r].every((v) => Number.isFinite(v))).toBe(true);
  });

  it("renderSong: 音符の高さは基準 12 から半音ずつ", () => {
    const freqs: number[] = [];
    const build = (...p: (number | undefined)[]) => {
      freqs.push(p[2]!);
      return [0];
    };
    renderSong([[1, 0, 440]], [[[0, 0, 12, 24, 0]]], [0], 120, 8000, build);
    expect(freqs[0]).toBeCloseTo(440);
    expect(freqs[1]).toBeCloseTo(880);
  });
});
