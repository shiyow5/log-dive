/**
 * 値が直前の描画から変わったか（#195）。被弾（減少）も回復（増加）も拾う。
 * 同じ events で描き直されたとき（リサイズ等）は前回の判定を返し、太字がちらつかないようにする。
 */
export function createChangeTracker(): (value: number, key: unknown) => boolean {
  let prev: number | null = null;
  let lastKey: unknown;
  let lastResult = false;
  return (value, key) => {
    if (prev !== null && key === lastKey) return lastResult;
    lastResult = prev !== null && value !== prev;
    prev = value;
    lastKey = key;
    return lastResult;
  };
}
