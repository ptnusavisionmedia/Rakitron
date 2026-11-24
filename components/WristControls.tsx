"use client";

import { RotateCcw } from "lucide-react";
import { WRIST_LIMITS, type WristAxis } from "../lib/game";
import type { Game } from "../lib/useGame";

const axes: { key: WristAxis; label: string; low: string; high: string }[] = [
  { key: "pitch", label: "Tekuk pergelangan", low: "Ke punggung", high: "Ke telapak" },
  { key: "deviation", label: "Miringkan pergelangan", low: "Ke kelingking", high: "Ke ibu jari" },
  { key: "roll", label: "Putar telapak", low: "", high: "" },
];

export default function WristControls({ game }: { game: Game }) {
  const neutral = axes.every(({ key }) => game.wrist[key] === 0);
  return <div className="wrist-controls">
    {axes.map(({ key, label, low, high }) => {
      const { min, max } = WRIST_LIMITS[key];
      const value = Math.round(game.wrist[key]);
      return <label key={key} className="joint-row wrist-axis">
        <span><b>{label}</b><output>{value > 0 ? "+" : ""}{value}°</output></span>
        <input type="range" aria-label={label} min={min} max={max} step={1}
          aria-valuetext={value === 0 ? "Netral, 0 derajat" : value + " derajat"}
          value={game.wrist[key]} onChange={event => game.setWrist(key, Number(event.target.value))}/>
        <small aria-hidden="true"><span>{low || min + "°"}</span><span>{high || "+" + max + "°"}</span></small>
      </label>;
    })}
    <button type="button" className="wrist-neutral" disabled={neutral} onClick={() => game.resetWrist()}>
      <RotateCcw size={14}/>Netralkan pergelangan
    </button>
  </div>;
}
