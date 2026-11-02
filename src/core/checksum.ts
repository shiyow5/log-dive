/**
 * FNV-1a 32bit。セーブデータの「破損・誤コピーの検出」用。
 * 静的配信なので改ざん防止にはならない（そういう用途には使わない）。
 */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
