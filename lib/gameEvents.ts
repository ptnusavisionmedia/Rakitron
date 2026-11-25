"use client";

import { useEffect, useRef } from "react";
import { FINGERS, JOINT_LIMITS, OPEN_GAP, WRIST_LIMITS, buildStepsFor, type Joint, type Vec3, type WristAxis } from "./game";
import type { Game } from "./useGame";

/** Detik antara komponen mulai meluncur dan menumbuk soket. Animasi 3D dan bunyi memakai angka yang sama. */
export const PLACE_LAND = .26;

export type GameEvent =
  | { type: "select"; index: number }
  | { type: "rotate" }
  | { type: "built"; index: number; step: number; done: boolean }
  | { type: "placed"; index: number; complete: boolean; bulk: boolean }
  | { type: "complete"; bulk: boolean }
  | { type: "undo" }
  | { type: "magnet"; pos: Vec3 }
  | { type: "servo"; amount: number }
  | { type: "grab"; pos: Vec3 }
  | { type: "release"; pos: Vec3 }
  | { type: "land"; pos: Vec3 }
  | { type: "win" };

export type Bus = { emit(event: GameEvent): void; on(listener: (event: GameEvent) => void): () => void };

export function createBus(): Bus {
  const listeners = new Set<(event: GameEvent) => void>();
  return {
    emit: event => listeners.forEach(listener => listener(event)),
    on: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

const JOINTS = Object.keys(JOINT_LIMITS) as Joint[];
const WRIST = Object.keys(WRIST_LIMITS) as WristAxis[];

// Setiap gerakan diberi nilai 0..1 agar nada servo naik ketika sendi bergerak lebih jauh.
function motion(game: Game): Record<string, number> {
  const values: Record<string, number> = {};
  for (const key of JOINTS) {
    const { min, max } = JOINT_LIMITS[key];
    values[key] = (game.joints[key] - min) / (max - min);
  }
  for (const key of WRIST) {
    const { min, max } = WRIST_LIMITS[key];
    values["w" + key] = (game.wrist[key] - min) / (max - min);
  }
  for (const key of FINGERS) values[key] = game.fingers[key] / 90;
  values.opposition = game.opposition / 90;
  values.gap = game.gap / OPEN_GAP;
  return values;
}

type AssemblyProgress = Pick<Game, "count" | "selected" | "rotation" | "built">;

export function emitAssemblyChange(before: AssemblyProgress, game: AssemblyProgress, bus: Bus, stepCount: number) {
  if (game.count > before.count) {
    const bulk = game.count - before.count > 1;
    const complete = game.count === 6;
    bus.emit({ type: "placed", index: game.count - 1, complete, bulk });
    if (complete) bus.emit({ type: "complete", bulk });
  } else if (game.count < before.count) {
    bus.emit({ type: "undo" });
  } else if (game.selected !== null && game.selected !== before.selected) {
    bus.emit({ type: "select", index: game.selected });
  } else if (game.selected !== null && game.selected === before.selected && game.rotation !== before.rotation) {
    bus.emit({ type: "rotate" });
  } else if (game.selected !== null && game.selected === before.selected && game.built > before.built) {
    bus.emit({ type: "built", index: game.selected, step: game.built - 1, done: game.built === stepCount });
  }
}

/** Mengubah perpindahan status permainan menjadi peristiwa untuk suara, efek 3D, dan sorakan. */
export function useGameEvents(game: Game, bus: Bus, active = true) {
  const previous = useRef<Game | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = game;
    if (!before || !active) return;

    emitAssemblyChange(before, game, bus, game.selected === null ? 0 : buildStepsFor(game.robotMode, game.selected).length);

    const was = before.cube.mode, now = game.cube.mode;
    if (was !== "held" && now === "held") bus.emit({ type: "grab", pos: game.cube.position });
    if (was === "held" && now !== "held") bus.emit({ type: "release", pos: game.cube.position });
    if (was === "falling" && now === "rest") bus.emit({ type: "land", pos: game.cube.position });
    if (!before.won && game.won) bus.emit({ type: "win" });

    if (game.count === before.count) {
      const a = motion(before), b = motion(game);
      const moved = Object.keys(b).find(key => Math.abs(b[key] - a[key]) > 1e-6);
      if (moved !== undefined) bus.emit({ type: "servo", amount: b[moved] });
    }
  }, [game, bus, active]);
}
