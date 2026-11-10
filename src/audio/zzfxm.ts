/**
 * ZzFXM v2.0.3 の曲レンダラーを TypeScript に移したもの。
 *
 * 元: https://github.com/keithclark/ZzFXM (zzfxm.js, commit cb07fa9)
 * 以下、元の LICENSE 全文:
 *
 * MIT License
 *
 * Copyright (c) 2020 Keith Clark
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * 変更点は3つ。①グローバルの zzfxR / zzfxG を引数で受け取る（テストで差し替えるため）
 * ②型を付けた ③戻り値の配列の穴を 0 で埋める。音の計算は元のまま。
 */

/** 楽器 = ZzFX のパラメータ配列。 */
export type Instrument = number[];
/** チャンネル = [楽器番号, パン(-1〜1), 音符, 音符, ...]。音符 0 は「前の音を伸ばす」。 */
export type Channel = number[];
/** パターン = 同じ長さのチャンネルの配列。 */
export type Pattern = Channel[];

/** ZzFX の buildSamples 相当（パラメータ → モノラル波形）。 */
export type SampleBuilder = (...parameters: (number | undefined)[]) => ArrayLike<number>;

/**
 * 曲を左右チャンネルの波形にする。
 *
 * @param instruments 楽器の配列。
 * @param patterns パターンの配列。
 * @param sequence 再生するパターン番号の並び。
 * @param bpm テンポ。1拍 = 16分音符4つ。
 * @param sampleRate サンプリング周波数（ZZFX.sampleRate）。
 * @param build 波形を作る関数（ZZFX.buildSamples）。
 * @returns [左, 右] の波形。
 */
export function renderSong(
  instruments: readonly Instrument[],
  patterns: readonly Pattern[],
  sequence: readonly number[],
  bpm: number,
  sampleRate: number,
  build: SampleBuilder,
): [number[], number[]] {
  let i: number;
  let j: number;
  let k: number;
  let note: number;
  let sample: number;
  let patternChannel: Channel;
  let notFirstBeat: number;
  let stop: number | boolean;
  let instrument: number | undefined;
  let attenuation = 0;
  let outSampleOffset: number;
  let isSequenceEnd: number;
  let sampleOffset = 0;
  let nextSampleOffset: number;
  let sampleBuffer: ArrayLike<number> = [];
  const leftChannelBuffer: number[] = [];
  const rightChannelBuffer: number[] = [];
  let channelIndex = 0;
  let panning = 0;
  let hasMore = 1;
  const sampleCache: Record<string, ArrayLike<number>> = {};
  const beatLength = ((sampleRate / bpm) * 60) >> 2;

  for (; hasMore; channelIndex++) {
    sampleBuffer = [(hasMore = notFirstBeat = outSampleOffset = 0)];

    sequence.forEach((patternIndex, sequenceIndex) => {
      const pattern = patterns[patternIndex] ?? [];
      patternChannel = pattern[channelIndex] ?? [0, 0, 0];
      hasMore |= Number(!!pattern[channelIndex]);
      nextSampleOffset =
        outSampleOffset + ((pattern[0]?.length ?? 2) - 2 - Number(!notFirstBeat)) * beatLength;
      isSequenceEnd = Number(sequenceIndex === sequence.length - 1);
      for (
        i = 2, k = outSampleOffset;
        i < patternChannel.length + isSequenceEnd;
        notFirstBeat = ++i
      ) {
        note = patternChannel[i] ?? 0;
        stop =
          (i === patternChannel.length + isSequenceEnd - 1 && !!isSequenceEnd) ||
          Number(instrument !== (patternChannel[0] || 0)) | note | 0;

        for (
          j = 0;
          j < beatLength && notFirstBeat;
          j++ > beatLength - 99 && stop ? (attenuation += Number(attenuation < 1) / 99) : 0
        ) {
          sample = ((1 - attenuation) * (sampleBuffer[sampleOffset++] ?? 0)) / 2 || 0;
          leftChannelBuffer[k] = (leftChannelBuffer[k] || 0) - sample * panning + sample;
          rightChannelBuffer[k] = (rightChannelBuffer[k++] || 0) + sample * panning + sample;
        }

        if (note) {
          attenuation = note % 1;
          panning = patternChannel[1] || 0;
          if ((note |= 0)) {
            instrument = patternChannel[(sampleOffset = 0)] || 0;
            const key = `${instrument},${note}`;
            const cached = sampleCache[key];
            if (cached) {
              sampleBuffer = cached;
            } else {
              const params = [...(instruments[instrument] ?? [])];
              params[2] = (params[2] ?? 220) * 2 ** ((note - 12) / 12);
              sampleBuffer = sampleCache[key] = note > 0 ? build(...params) : [];
            }
          }
        }
      }
      outSampleOffset = nextSampleOffset;
    });
  }

  // 疎な配列のまま AudioBuffer に入れると穴が NaN になるので 0 で埋める
  const len = Math.max(leftChannelBuffer.length, rightChannelBuffer.length);
  return [
    Array.from({ length: len }, (_, n) => leftChannelBuffer[n] || 0),
    Array.from({ length: len }, (_, n) => rightChannelBuffer[n] || 0),
  ];
}
