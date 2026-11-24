'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { advancePlayback, findMotion, startPlayback, type Playback } from './motions.ts';
import { sfx } from './sfx';
import type { Game } from './useGame';

export type MotionStatus = { id: string; name: string; step: number; total: number; label: string };

/** Menjalankan program gerak bingkai demi bingkai lewat aksi permainan yang sama dengan kontrol manual. */
export function useMotion(game: Game) {
  const latest = useRef(game);
  latest.current = game;
  const playback = useRef<Playback | null>(null);
  const frame = useRef(0);
  const [status, setStatus] = useState<MotionStatus | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    if (playback.current) sfx.play('motionEnd');
    playback.current = null;
    setStatus(null);
  }, []);

  const play = useCallback((id: string) => {
    const motion = findMotion(id);
    const start = latest.current;
    if (!motion || start.count !== 6 || start.robotMode !== motion.mode) return;
    cancelAnimationFrame(frame.current);
    playback.current = startPlayback(motion);
    let previous = performance.now();
    let label = motion.steps[0]?.label ?? motion.name;
    setStatus({ id: motion.id, name: motion.name, step: 0, total: motion.steps.length, label });
    const tick = (time: number) => {
      const current = playback.current;
      if (!current) return;
      const now = latest.current;
      // Melepas komponen, mengganti model, atau mulai ulang menghentikan program.
      if (now.count !== 6 || now.robotMode !== current.motion.mode) {
        playback.current = null;
        setStatus(null);
        return;
      }
      const dt = Math.min(.05, Math.max(0, (time - previous) / 1000));
      previous = time;
      const result = advancePlayback(current, now, dt);
      for (const action of result.actions) now.dispatch(action);
      for (const sound of result.sounds) sfx.play(sound);
      playback.current = result.playback;
      if (!result.playback) { setStatus(null); return; }
      if (result.playback.index !== current.index) {
        label = motion.steps[result.playback.index].label ?? label;
        setStatus({ id: motion.id, name: motion.name, step: result.playback.index, total: motion.steps.length, label });
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return { status, play, stop };
}

export type MotionPlayer = ReturnType<typeof useMotion>;
