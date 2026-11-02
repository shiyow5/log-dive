import Phaser from "phaser";
import { BattleScene } from "./scenes/BattleScene";
import { BootScene } from "./scenes/BootScene";
import { MapScene } from "./scenes/MapScene";
import { ResultScene } from "./scenes/ResultScene";
import { TitleScene } from "./scenes/TitleScene";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  backgroundColor: "#0b0d12",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: [BootScene, TitleScene, MapScene, BattleScene, ResultScene],
});

// E2E テストとデバッグ用。ゲームロジックはここから触らない。
declare global {
  interface Window {
    __game?: Phaser.Game;
  }
}
window.__game = game;
