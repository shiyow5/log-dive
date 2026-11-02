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
