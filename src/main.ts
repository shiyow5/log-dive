import Phaser from "phaser";
import { BattleScene } from "./scenes/BattleScene";
import { BootScene } from "./scenes/BootScene";
import { MapScene } from "./scenes/MapScene";
import { ResultScene } from "./scenes/ResultScene";
import { TitleScene } from "./scenes/TitleScene";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { installQa } from "./ui/qa";
import { playSfx, startBgmOnFirstInput } from "./audio/player";
import { sfxForRun } from "./audio/sounds";
import { subscribe } from "./scenes/run-port";
import { installAudioToggle } from "./ui/audio-toggle";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  backgroundColor: "#0f1a1c",
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
installQa();

// 音（ZzFX / ZzFXM）。操作の結果に応じた SE と、最初の操作から流す BGM。
subscribe((s) => {
  const name = sfxForRun(s);
  if (name) playSfx(name);
});
startBgmOnFirstInput();
installAudioToggle();
