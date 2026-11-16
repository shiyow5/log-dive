/**
 * 被弾ハイライト（敵 HP バーの accent）の保持状態（#201）。
 * 被弾後 200ms 以内に被弾以外の理由で描き直されても accent を保ち、
 * 連続被弾では最新の被弾のタイマーだけが解除できる。
 */
export interface HitHighlight {
  /** 被弾を記録して通し番号を返す（active=true） */
  hit(): number;
  /** seq が最新の被弾と一致するときだけ解除して true */
  release(seq: number): boolean;
  isActive(): boolean;
  reset(): void;
}

export function createHitHighlight(): HitHighlight {
  let seq = 0;
  let active = false;
  return {
    hit() {
      active = true;
      return ++seq;
    },
    release(s) {
      if (s !== seq) return false;
      active = false;
      return true;
    },
    isActive: () => active,
    reset() {
      active = false;
      seq++; // 前ランのタイマーが解除できないようにする
    },
  };
}

/** バーを accent で描くか（今回被弾した、または被弾ハイライト中） */
export function shouldHighlightBar(hit: boolean, hl: HitHighlight): boolean {
  return hit || hl.isActive();
}
