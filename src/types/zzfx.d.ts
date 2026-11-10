// zzfx (MIT) は素の JS ライブラリなので、使う部分だけ型を宣言する。
declare module "zzfx" {
  export const ZZFX: {
    /** 全体の音量（0〜1）。 */
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    /** ZzFX パラメータから波形（モノラル）を作る。 */
    buildSamples(...parameters: (number | undefined)[]): Float32Array;
    /** 波形を鳴らす。戻り値の source.stop() で止められる。 */
    playSamples(
      sampleChannels: number[][],
      volumeScale?: number,
      rate?: number,
      pan?: number,
      loop?: boolean,
    ): AudioBufferSourceNode;
  };
  export function zzfx(...parameters: (number | undefined)[]): AudioBufferSourceNode;
}
