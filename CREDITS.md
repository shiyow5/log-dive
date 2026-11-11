# CREDITS

このゲームで使っている外部のコード・素材を **1件ずつ** 記録する。
素材を追加する PR では、必ずこのファイルにも1行足す（無いものはマージしない）。

## ルール

- 使ってよい: 自作 / CC0 / ライセンスを確認した無料素材（MIT・CC BY 等。CC BY は表記を守る）
- 使わない: PixelSRPG-Forge の素材（著作権不明）、実在の曲・歌詞、他作品の名称・画像・ルール、実在人物の声に似せた音声
- 生成ツールは無料枠のみ。生成物も「ツール名・モデル・ライセンス・生成者」を記録する

## コード・ライブラリ

| 名前                                                     | 作者                        | URL                                          | ライセンス                                           | 用途               |
| -------------------------------------------------------- | --------------------------- | -------------------------------------------- | ---------------------------------------------------- | ------------------ |
| Phaser 3                                                 | Phaser Studio Inc.          | https://github.com/phaserjs/phaser           | MIT                                                  | ゲームエンジン     |
| pixelfx (commit a841596)                                 | patch-gg                    | https://github.com/patch-gg/pixelfx          | MIT（同梱の Patch Pixel フォントは対象外・使わない） | ドット絵エフェクト |
| └ pixelfx が取り込んでいるコード（src/core/sim.js 等）   | Hugo Duprez (Sprite Fusion) | https://www.spritefusion.com/pixel-art-vfx   | MIT                                                  | pixelfx 内部       |
| └ pixelfx が取り込んでいるコード（src/core/act.js）      | rehan-remade (Hollow Crown) | https://github.com/rehan-remade/hollow-crown | MIT                                                  | pixelfx 内部       |
| ZzFX 1.4.0（npm `zzfx`）                                 | Frank Force                 | https://github.com/KilledByAPixel/ZzFX       | MIT                                                  | 効果音・BGM の音源 |
| ZzFXM 2.0.3（src/audio/zzfxm.ts に移植、commit cb07fa9） | Keith Clark, Frank Force    | https://github.com/keithclark/ZzFXM          | MIT                                                  | BGM の再生         |

## 画像

| 名前                                                                        | 作者                    | URL | ライセンス                     | 使用箇所                  |
| --------------------------------------------------------------------------- | ----------------------- | --- | ------------------------------ | ------------------------- |
| 敵（バグ）スプライト 16x16（src/art/bug-sprite.ts、コード内の文字列で定義） | rio（開発チーム・自作） | -   | 自作（外部素材なし・費用ゼロ） | 戦闘画面の敵（Issue #92） |

## 音声・BGM・効果音

音声ファイルは置かない。ZzFX / ZzFXM のパラメータ（src/audio/sounds.ts）からその場で鳴らす。

| 名前                        | 作者               | URL | ライセンス | 使用箇所                                       |
| --------------------------- | ------------------ | --- | ---------- | ---------------------------------------------- |
| 効果音 19種（ZzFX 用）      | 開発チーム（自作） | -   | 自作       | ボタン・移動・戦闘・宝箱・階段・結果など全操作 |
| BGM「Log Dive」（ZzFXM 用） | 開発チーム（自作） | -   | 自作       | 全画面（最初の操作から再生、ループ）           |

## フォント

| 名前                    | 作者           | URL                                            | ライセンス  | 使用箇所                                             |
| ----------------------- | -------------- | ---------------------------------------------- | ----------- | ---------------------------------------------------- |
| DotGothic16-Regular.ttf | Fontworks Inc. | https://github.com/fontworks-fonts/DotGothic16 | SIL OFL 1.1 | 全画面のテキスト表示（CSS @font-face / Phaser Text） |
