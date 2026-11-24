"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, Square } from "lucide-react";
import { WRIST_LIMITS, type WristAxis } from "../lib/game";
import type { Game } from "../lib/useGame";

const tiltAxes = [
  { key: "pitch", label: "Tekuk pergelangan", low: "Ke punggung", high: "Ke telapak" },
  { key: "deviation", label: "Miringkan pergelangan", low: "Ke kelingking", high: "Ke ibu jari" },
] as const;

export default function WristControls({ game, active }: { game: Game; active: boolean }) {
  const [spinning, setSpinning] = useState(false);
  const roll = game.wrist.roll;
  const latestRoll = useRef(roll);
  const expectedRoll = useRef<number | null>(null);
  const { turnWrist } = game;

  // Wait for the simulation to accept each step. A blocked turn stops at contact.
  useLayoutEffect(() => {
    latestRoll.current = roll;
    if (expectedRoll.current !== null) {
      const difference = ((roll - expectedRoll.current + 540) % 360) - 180;
      expectedRoll.current = null;
      if (Math.abs(difference) > 0.001) setSpinning(false);
    }
  }, [game, roll]);

  useEffect(() => {
    if (!spinning) return;
    if (!active) { setSpinning(false); return; }
    let frame = 0;
    let previous = performance.now();
    let remainder = 0;
    let remaining = 360;
    function advance(time: number) {
      remainder += Math.min(time - previous, 300) * 0.1;
      previous = time;
      if (expectedRoll.current === null) {
        if (remaining === 0) { setSpinning(false); return; }
        const step = Math.min(Math.floor(remainder), remaining, 30);
        if (step > 0) {
          remainder -= step;
          remaining -= step;
          expectedRoll.current = (latestRoll.current + step) % 360;
          turnWrist(step);
        }
      }
      frame = requestAnimationFrame(advance);
    }
    const pauseWhenHidden = () => { if (document.hidden) setSpinning(false); };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    frame = requestAnimationFrame(advance);
    return () => {
      cancelAnimationFrame(frame);
      expectedRoll.current = null;
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [active, spinning, turnWrist]);

  function setAxis(key: WristAxis, value: number) {
    setSpinning(false);
    game.setWrist(key, value);
  }
  function stepRoll(value: number) {
    setSpinning(false);
    turnWrist(value);
  }

  const { min, max } = WRIST_LIMITS.roll;
  const neutral = game.wrist.pitch === 0 && game.wrist.deviation === 0 && roll === 0;
  return <div className="wrist-controls">
    <div className="rotary-control">
      <label className="joint-row wrist-axis rotary-axis">
        <span><b>Putar telapak</b><output>{Math.round(roll)}°</output></span>
        <input type="range" aria-label="Putar telapak" min={min} max={max} step={1} value={roll}
          aria-valuetext={Math.round(roll) + " derajat"} onChange={e => setAxis("roll", Number(e.target.value))}/>
        <small aria-hidden="true"><span>0°</span><span>180°</span><span>360°</span></small>
      </label>
      <div className="rotary-steps">
        <button type="button" aria-label="Putar kiri 30°" onClick={() => stepRoll(-30)}><RotateCcw size={14}/>Kiri 30°</button>
        <button type="button" aria-label="Putar kanan 30°" onClick={() => stepRoll(30)}><RotateCw size={14}/>Kanan 30°</button>
      </div>
      <button type="button" className="rotary-spin" onClick={() => setSpinning(value => !value)}>
        {spinning ? <Square size={13}/> : <RotateCw size={15}/>}
        {spinning ? "Hentikan putaran" : "Putar 360°"}
      </button>
    </div>
    {tiltAxes.map(({ key, label, low, high }) => {
      const { min, max } = WRIST_LIMITS[key];
      const value = Math.round(game.wrist[key]);
      return <label key={key} className="joint-row wrist-axis">
        <span><b>{label}</b><output>{value > 0 ? "+" : ""}{value}°</output></span>
        <input type="range" aria-label={label} min={min} max={max} step={1}
          aria-valuetext={value === 0 ? "Netral, 0 derajat" : value + " derajat"}
          value={game.wrist[key]} onChange={e => setAxis(key, Number(e.target.value))}/>
        <small aria-hidden="true"><span>{low}</span><span>{high}</span></small>
      </label>;
    })}
    <button type="button" className="wrist-neutral" disabled={neutral && !spinning}
      onClick={() => { setSpinning(false); game.resetWrist(); }}>
      <RotateCcw size={14}/>Netralkan pergelangan
    </button>
  </div>;
}
