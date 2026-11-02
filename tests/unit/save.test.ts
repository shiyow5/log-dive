import { describe, expect, it } from "vitest";
import { MemoryStorage, SaveStore } from "../../src/core/save";

describe("SaveStore", () => {
  it("保存して読み戻せる", () => {
    const s = new SaveStore<{ n: number }>(new MemoryStorage(), "k", 1);
    s.save({ n: 3 });
    expect(s.load()).toEqual({ ok: true, data: { n: 3 } });
  });

  it("無いときは missing", () => {
    expect(new SaveStore(new MemoryStorage(), "k", 1).load()).toEqual({ ok: false, reason: "missing" });
  });

  it("壊れた JSON・チェックサム不一致は corrupt", () => {
    const st = new MemoryStorage();
    const s = new SaveStore<{ n: number }>(st, "k", 1);
    st.setItem("k", "{not json");
    expect(s.load()).toEqual({ ok: false, reason: "corrupt" });
    s.save({ n: 1 });
    st.setItem("k", (st.getItem("k") ?? "").replace('"n":1', '"n":2'));
    expect(s.load()).toEqual({ ok: false, reason: "corrupt" });
  });

  it("古いバージョンは migrate で読める・無ければ version", () => {
    const st = new MemoryStorage();
    new SaveStore<{ old: number }>(st, "k", 1).save({ old: 5 });
    const noMig = new SaveStore<{ n: number }>(st, "k", 2);
    expect(noMig.load()).toEqual({ ok: false, reason: "version" });
    const mig = new SaveStore<{ n: number }>(st, "k", 2, (d) => ({ n: (d as { old: number }).old }));
    expect(mig.load()).toEqual({ ok: true, data: { n: 5 } });
  });
});
