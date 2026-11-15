import type { RunErrorCode } from "../core/run";

/**
 * 押せないボタンの2行目に出す短い理由（#94 minori 指定: 1ボタン最大8字）。
 * 全文（core の message）はツールチップと読み上げに出すので、ここは見てすぐ分かる短さを優先する。
 */
const SHORT: Partial<Record<RunErrorCode, string>> = {
  not_reproduced: "再現が必要",
  not_enough_cpu: "CPU が足りない",
  nothing_to_reveal: "症状はもうない",
  too_few_candidates: "候補が残り1つ",
  already_halted: "もう止めている",
  not_a_candidate: "候補から消えた",
  missing_arg: "種類を選ぶ",
  skill_not_owned: "持っていない",
};

/** 短い理由。対応表にないコードは「使えない」。 */
export function shortReason(code: RunErrorCode): string {
  return SHORT[code] ?? "使えない";
}
