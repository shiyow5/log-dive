/** 2Dグリッド。ルール側で使う純粋なデータ構造（Phaser に依存しない）。 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Dir = "N" | "E" | "S" | "W";
export const DIRS: readonly Dir[] = ["N", "E", "S", "W"];
export const DIR_VEC: Readonly<Record<Dir, Point>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export function rotateCW(d: Dir): Dir {
  return DIRS[(DIRS.indexOf(d) + 1) % 4] as Dir;
}

export function opposite(d: Dir): Dir {
  return DIRS[(DIRS.indexOf(d) + 2) % 4] as Dir;
}

export function step(p: Point, d: Dir): Point {
  const v = DIR_VEC[d];
  return { x: p.x + v.x, y: p.y + v.y };
}

export class Grid<T> {
  readonly width: number;
  readonly height: number;
  private readonly cells: T[];

  constructor(width: number, height: number, fill: T | ((p: Point) => T)) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new RangeError(`invalid grid size: ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.cells = new Array<T>(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.cells[y * width + x] =
          typeof fill === "function" ? (fill as (p: Point) => T)({ x, y }) : fill;
      }
    }
  }

  inBounds(p: Point): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height;
  }

  get(p: Point): T {
    if (!this.inBounds(p)) throw new RangeError(`out of bounds: ${p.x},${p.y}`);
    return this.cells[p.y * this.width + p.x] as T;
  }

  set(p: Point, value: T): void {
    if (!this.inBounds(p)) throw new RangeError(`out of bounds: ${p.x},${p.y}`);
    this.cells[p.y * this.width + p.x] = value;
  }

  /** 4近傍のうち盤内のもの（N,E,S,W の固定順。決定性のため順序を変えない）。 */
  neighbors(p: Point): Point[] {
    return DIRS.map((d) => step(p, d)).filter((q) => this.inBounds(q));
  }

  /** 行優先 (y→x) の固定順で走査。 */
  *entries(): Generator<[Point, T]> {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        yield [{ x, y }, this.cells[y * this.width + x] as T];
      }
    }
  }

  map<U>(fn: (value: T, p: Point) => U): Grid<U> {
    return new Grid<U>(this.width, this.height, (p) => fn(this.get(p), p));
  }

  toJSON(): { width: number; height: number; cells: T[] } {
    return { width: this.width, height: this.height, cells: this.cells.slice() };
  }

  static fromJSON<T>(data: { width: number; height: number; cells: T[] }): Grid<T> {
    if (data.cells.length !== data.width * data.height) {
      throw new RangeError("cells length does not match size");
    }
    return new Grid<T>(data.width, data.height, (p) => data.cells[p.y * data.width + p.x] as T);
  }
}
