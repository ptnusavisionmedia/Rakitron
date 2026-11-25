"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { RefObject } from "react";
import type { Group } from "three";
import { FINGERS, NEUTRAL_WRIST, type WristAngles } from "../lib/game";
import { noteMotion } from "./idle";
import { createRoboticHand, type HandAngles, type HandModelProps } from "../lib/handModel";

export { createRoboticHand } from "../lib/handModel";

const ease = (t: number) => t * t * (3 - 2 * t);
const resting: HandAngles = { thumb: 0, index: 0, middle: 0, ring: 0, little: 0 };

type Transition = {
  start: HandAngles;
  goal: HandAngles;
  fromOpposition: number;
  toOpposition: number;
  elapsed: number;
  duration: number;
};

type HandViewProps = HandModelProps & {
  /** Jumlah bagian tangan yang sudah dirakit; kosong berarti tangan utuh. */
  stage?: number;
  wrist?: WristAngles;
  wristRef?: RefObject<Group | null>;
};

export default function RoboticHand({ angles, opposition = 0, preview = false, highlighted = false, holding = false, wrist = NEUTRAL_WRIST, wristRef, stage }: HandViewProps) {
  const rig = useMemo(() => createRoboticHand({ angles: resting, preview }), [preview]);
  const invalidate = useThree(state => state.invalidate);
  const active = useRef<typeof rig | null>(null);
  const current = useRef({ angles: { ...angles }, opposition, holding });
  const transition = useRef<Transition | null>(null);
  // 0 = pose bebas, 1 = jari menahan kubus. Nilainya bergerak bertahap agar genggaman tidak melompat.
  const grip = useRef(holding ? 1 : 0);
  const { thumb, index, middle, ring, little } = angles;

  useLayoutEffect(() => {
    if (!wristRef) return;
    wristRef.current = rig.wristPivot;
    return () => { if (wristRef.current === rig.wristPivot) wristRef.current = null; };
  }, [rig, wristRef]);

  useLayoutEffect(() => {
    rig.setWrist(wrist);
    invalidate();
  }, [rig, wrist, invalidate]);

  useLayoutEffect(() => {
    rig.setHighlighted(highlighted);
    invalidate();
  }, [rig, highlighted, invalidate]);

  useLayoutEffect(() => {
    rig.setStage(stage ?? null);
    invalidate();
  }, [rig, stage, invalidate]);

  useLayoutEffect(() => {
    const pose = current.current;
    const next = { thumb, index, middle, ring, little };
    const delta = Math.max(Math.abs(opposition-pose.opposition), ...FINGERS.map(key => Math.abs(next[key]-pose.angles[key])));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const instant = active.current !== rig || preview || reducedMotion;
    // Di sekeliling kubus jari menutup lebih pelan, mengikuti permukaannya.
    const around = holding || pose.holding;
    pose.holding = holding;
    if (instant || delta <= 6) {
      transition.current = null;
      pose.angles = next;
      pose.opposition = opposition;
      if (instant) grip.current = holding ? 1 : 0;
      rig.update(next, opposition, ease(grip.current));
    } else {
      transition.current = {
        start: { ...pose.angles }, goal: next, fromOpposition: pose.opposition,
        toOpposition: opposition, elapsed: 0, duration: around ? .5 : Math.min(.20,.09+delta*.0014),
      };
    }
    active.current = rig;
    invalidate();
  }, [rig, thumb, index, middle, ring, little, opposition, holding, preview, invalidate]);

  useFrame((_, dt) => {
    const move = transition.current;
    const pose = current.current;
    const target = pose.holding ? 1 : 0;
    if (!move && grip.current === target) return;
    noteMotion();
    const step = Math.min(dt, .05);
    // Menutup di sekeliling kubus lebih pelan daripada melepasnya.
    grip.current = target ? Math.min(1, grip.current + step / .55) : Math.max(0, grip.current - step / .3);
    let moving = grip.current !== target;
    if (move) {
      move.elapsed += step;
      const progress = Math.min(1, move.elapsed / move.duration);
      const eased = progress * progress * (3 - 2 * progress);
      for (const key of FINGERS) pose.angles[key] = move.start[key] + (move.goal[key] - move.start[key]) * eased;
      pose.opposition = move.fromOpposition + (move.toOpposition - move.fromOpposition) * eased;
      if (progress < 1) moving = true;
      else transition.current = null;
    }
    rig.update(pose.angles, pose.opposition, ease(grip.current));
    if (moving) invalidate();
  });

  useEffect(() => () => rig.dispose(), [rig]);
  return <primitive object={rig.group} dispose={null} />;
}
