"use client";

import { FINGERS, HAND_PRESETS, type Finger, type HandPreset } from "../lib/game";
import type { Game } from "../lib/useGame";

const labels: Record<Finger, string> = {
  thumb: "Ibu jari", index: "Telunjuk", middle: "Jari tengah", ring: "Jari manis", little: "Kelingking",
};
const poses: { id: HandPreset; label: string }[] = [
  { id: "open", label: "Buka" }, { id: "grasp", label: "Genggam" },
  { id: "pinch", label: "Cubit" }, { id: "point", label: "Tunjuk" },
];

export default function HandControls({ game }: { game: Game }) {
  return <div className="hand-controls">
    <div className="hand-poses" role="group" aria-label="Gestur tangan">
      {poses.map(({ id, label }) => {
        const target = HAND_PRESETS[id];
        const matches = game.opposition === target.opposition &&
          FINGERS.every(finger => game.fingers[finger] === target.fingers[finger]);
        return <button key={id} type="button" aria-pressed={matches} onClick={() => game.setHandPreset(id)}>{label}</button>;
      })}
    </div>
    <div className="finger-ranges">
      {FINGERS.map(finger => <label className="finger-range" key={finger}>
        <span>{labels[finger]}</span>
        <input aria-label={labels[finger]} type="range" min="0" max="90" step="1"
          value={game.fingers[finger]} onChange={e => game.setFinger(finger, Number(e.target.value))}/>
        <output>{game.fingers[finger]}°</output>
      </label>)}
    </div>
    <label className="opposition-range joint-row">
      <span><b>Oposisi ibu jari</b><output>{game.opposition}°</output></span>
      <input aria-label="Oposisi ibu jari" aria-describedby="opposition-help" type="range" min="0" max="90" step="1"
        value={game.opposition} onChange={e => game.setOpposition(Number(e.target.value))}/>
      <small id="opposition-help">Putar ibu jari ke arah telunjuk.</small>
    </label>
  </div>;
}
