import type { GameData } from "../core/data";

/** 遊び方の「症状の読み方」用の1行（バグ1種類ぶん）。 */
export interface SymptomRow {
  readonly name: string;
  readonly symptoms: readonly string[];
}

/** 症状から複数の種類に当てはまる語（例:「応答が遅い」）と、当てはまる種類名。 */
export interface SharedSymptom {
  readonly symptom: string;
  readonly bugNames: readonly string[];
}

/**
 * 症状の読み方（#118）。bugs.json から作るので、データを変えても嘘にならない。
 * 共有症状は「2種類以上の symptoms に出てくる語」を data から数えて出す（直書きしない）。
 */
export function symptomGuide(data: GameData): {
  rows: SymptomRow[];
  shared: SharedSymptom[];
} {
  const rows = data.bugs.bugs.map((b) => ({ name: b.name, symptoms: [...b.symptoms] }));
  const byText = new Map<string, string[]>();
  for (const r of rows) {
    for (const s of r.symptoms) byText.set(s, [...(byText.get(s) ?? []), r.name]);
  }
  const shared = [...byText]
    .filter(([, names]) => names.length > 1)
    .map(([symptom, bugNames]) => ({ symptom, bugNames }));
  return { rows, shared };
}
