import { fnv1a } from "./checksum";

/** localStorage 互換の最小インターフェース（テストでは Map で差し替える）。 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Envelope<T> {
  v: number;
  sum: string;
  data: T;
}

export type LoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "missing" | "corrupt" | "version" };

/**
 * バージョンとチェックサム付きでセーブする。
 * 読めないデータは例外にせず reason を返す（UI側で「新規開始」にできる）。
 */
export class SaveStore<T> {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string,
    private readonly version: number,
    private readonly migrate?: (data: unknown, fromVersion: number) => T | null,
  ) {}

  save(data: T): void {
    const json = JSON.stringify(data);
    const env: Envelope<T> = { v: this.version, sum: fnv1a(json), data };
    this.storage.setItem(this.key, JSON.stringify(env));
  }

  load(): LoadResult<T> {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return { ok: false, reason: "missing" };
    let env: Envelope<unknown>;
    try {
      env = JSON.parse(raw) as Envelope<unknown>;
    } catch {
      return { ok: false, reason: "corrupt" };
    }
    if (typeof env !== "object" || env === null || typeof env.v !== "number") {
      return { ok: false, reason: "corrupt" };
    }
    if (fnv1a(JSON.stringify(env.data)) !== env.sum) return { ok: false, reason: "corrupt" };
    if (env.v === this.version) return { ok: true, data: env.data as T };
    if (env.v < this.version && this.migrate) {
      const migrated = this.migrate(env.data, env.v);
      if (migrated !== null) return { ok: true, data: migrated };
    }
    return { ok: false, reason: "version" };
  }

  clear(): void {
    this.storage.removeItem(this.key);
  }
}

/** テスト・SSR 用のメモリストレージ。 */
export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}
