/**
 * シード付き疑似乱数 (sfc32)。
 *
 * ルール(純粋TS)の中では Math.random / Date.now を使わず、必ずこれを使う。
 * 同じシード → 同じ結果になるので、リプレイ・テスト・バグ再現ができる。
 */
export interface RngState {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

/** 文字列や数値のシードから 32bit の初期値を4つ作る (cyrb128)。 */
export function seedFrom(seed: string | number): RngState {
  const str = String(seed);
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return { a: h1 >>> 0, b: h2 >>> 0, c: h3 >>> 0, d: h4 >>> 0 };
}

/**
 * 状態を持つ乱数生成器。state を保存すれば途中から同じ列を再開できる。
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string | number | RngState) {
    const s = typeof seed === "object" ? seed : seedFrom(seed);
    this.a = s.a >>> 0;
    this.b = s.b >>> 0;
    this.c = s.c >>> 0;
    this.d = s.d >>> 0;
  }

  /** 次の 32bit 符号なし整数。 */
  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** [0, 1) の実数。 */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** [min, max] の整数（両端を含む）。 */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`invalid range: ${min}..${max}`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 配列から1つ選ぶ。 */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("pick from empty array");
    return items[this.int(0, items.length - 1)] as T;
  }

  /** 新しい配列としてシャッフル (Fisher–Yates)。元の配列は変更しない。 */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }

  /** 現在の状態（セーブ・リプレイ用）。 */
  get state(): RngState {
    return { a: this.a >>> 0, b: this.b >>> 0, c: this.c >>> 0, d: this.d >>> 0 };
  }
}
