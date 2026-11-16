// pixelfx は素の JS ライブラリなので、使う部分だけ型を宣言する。
declare module "pixelfx" {
  export interface PixelFrame {
    w: number;
    h: number;
    ox: number;
    oy: number;
    color: Uint32Array;
    light: Uint32Array;
  }
  export interface FxInstance {
    update(dt: number): void;
    draw(frame: PixelFrame, layer?: "back" | "front"): void;
    stop(): void;
    done(): boolean;
  }
  export interface FxOptions {
    x?: number;
    y?: number;
    flip?: boolean;
    angle?: number;
    seed?: number;
    palette?: string[];
    light?: number;
    [key: string]: unknown;
  }
  export type FxModule = Record<string, unknown>;
  /** 色の数値（pixelfx 内部の packed 色）。 */
  export function hex(h: string | number): number;
  export function mix(a: number, b: number, t: number): number;
  export function rand(...ns: number[]): number;
  /** painter（エフェクトの描画関数が受け取る）。使う分だけ宣言。 */
  export interface Painter {
    rect(x: number, y: number, w: number, h: number, c: number, a?: number): void;
    dot(x: number, y: number, c: number, a?: number): void;
    px(x: number, y: number, c: number): void;
    glow(x: number, y: number, r: number, c: number, k?: number): void;
    text(
      str: string,
      x: number,
      y: number,
      c: number,
      opts?: {
        font?: "mini" | "big";
        scale?: number;
        align?: "left" | "center" | "right";
        a?: number;
      },
    ): void;
  }
  export function createFrame(w: number, h: number, ox?: number, oy?: number): PixelFrame;
  export function clearFrame(f: PixelFrame): void;
  export function createFx(mod: FxModule, o?: FxOptions): FxInstance;
  export function composite(
    f: PixelFrame,
    out: Uint8ClampedArray,
    bg?: number | Uint32Array | null,
    lightK?: number,
  ): void;
}

declare module "pixelfx/fx/*" {
  const mod: Record<string, unknown>;
  export = mod;
}
