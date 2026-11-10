/**
 * 画面右上の「音を切る / 音を出す」ボタン。#hud の外に置く（画面が変わっても残す）。
 * ?fx=0 では音を鳴らさないので出さない。
 */
import { audioAvailable, isMuted, playSfx, toggleMute } from "../audio/player";

function label(muted: boolean): string {
  return muted ? "音を出す" : "音を切る";
}

export function installAudioToggle(): void {
  if (!audioAvailable() || document.getElementById("audio-toggle")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.id = "audio-toggle";
  b.className = "audio-toggle";
  const render = (muted: boolean) => {
    b.textContent = muted ? "♪✕" : "♪";
    b.setAttribute("aria-label", label(muted));
    b.setAttribute("aria-pressed", muted ? "true" : "false");
    b.title = label(muted);
  };
  render(isMuted());
  b.addEventListener("click", () => {
    const muted = toggleMute();
    render(muted);
    if (!muted) playSfx("click");
  });
  document.getElementById("game")?.append(b);
}
