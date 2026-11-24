"use client";

import { Bot, Play, Square } from "lucide-react";
import { motionsFor, pickAndPlaceFor } from "../lib/motions";
import type { MotionPlayer } from "../lib/useMotion";
import type { Game } from "../lib/useGame";

export default function AutoControls({ game, player }: { game: Game; player: MotionPlayer }) {
  const { status } = player;
  const task = pickAndPlaceFor(game.robotMode);
  const motions = motionsFor(game.robotMode);
  const busy = status !== null;
  const taskRunning = status?.id === task.id;
  return <div className="auto-controls">
    <button type="button" className="primary-button auto-task" aria-pressed={taskRunning}
      disabled={busy && !taskRunning} onClick={() => taskRunning ? player.stop() : player.play(task.id)}>
      {taskRunning ? <Square size={15}/> : <Bot size={17}/>}
      <span><b>{taskRunning ? "Hentikan" : task.name}</b><small>{task.detail}</small></span>
    </button>
    <div className="auto-heading">Animasi gerak</div>
    <div className="auto-list" role="group" aria-label="Animasi gerak robot">
      {motions.map(motion => {
        const playing = status?.id === motion.id;
        return <button key={motion.id} type="button" aria-pressed={playing} disabled={busy && !playing}
          onClick={() => playing ? player.stop() : player.play(motion.id)}>
          <i>{playing ? <Square size={12}/> : <Play size={13}/>}</i>
          <span><b>{motion.name}</b><small>{motion.detail}</small></span>
        </button>;
      })}
    </div>
    {status && <div className="auto-status" role="status">
      <div><b>{status.label}</b><span>{status.step + 1} / {status.total}</span></div>
      <progress max={status.total} value={status.step + 1} aria-label={"Kemajuan " + status.name}/>
    </div>}
  </div>;
}
