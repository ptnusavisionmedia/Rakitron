"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { RefObject } from "react";
import type { Group } from "three";
import { FINGERS } from "../lib/game";
import { noteMotion } from "./idle";
import { createRoboticHand, type HandAngles, type HandModelProps } from "../lib/handModel";

export { createRoboticHand } from "../lib/handModel";

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
  wristQuaternion?: readonly [number, number, number, number];
  wristRef?: RefObject<Group | null>;
};

export default function RoboticHand({ angles, opposition = 0, preview = false, highlighted = false, holding = false, wristQuaternion, wristRef }: HandViewProps) {
  const rig = useMemo(() => createRoboticHand({ angles: resting, preview }), [preview]);
  const invalidate = useThree(state => state.invalidate);
  const active = useRef<typeof rig | null>(null);
  const current = useRef({ angles: { ...angles }, opposition, holding });
  const transition = useRef<Transition | null>(null);
  const { thumb, index, middle, ring, little } = angles;

  useLayoutEffect(() => {
    if (!wristRef) return;
    wristRef.current = rig.wristPivot;
    return () => { if (wristRef.current === rig.wristPivot) wristRef.current = null; };
  }, [rig, wristRef]);

  useLayoutEffect(() => {
    if (wristQuaternion) rig.wristPivot.quaternion.fromArray(wristQuaternion);
    else rig.wristPivot.quaternion.identity();
    invalidate();
  }, [rig, wristQuaternion, invalidate]);

  useLayoutEffect(() => {
    rig.setHighlighted(highlighted);
    invalidate();
  }, [rig, highlighted, invalidate]);

  useLayoutEffect(() => {
    const pose = current.current;
    const next = { thumb, index, middle, ring, little };
    const delta = Math.max(Math.abs(opposition-pose.opposition), ...FINGERS.map(key => Math.abs(next[key]-pose.angles[key])));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (active.current !== rig || preview || reducedMotion || holding || holding !== pose.holding || delta <= 6) {
      transition.current = null;
      pose.angles = next;
      pose.opposition = opposition;
      pose.holding = holding;
      rig.update(next, opposition, holding);
    } else {
      transition.current = {
        start: { ...pose.angles }, goal: next, fromOpposition: pose.opposition,
        toOpposition: opposition, elapsed: 0, duration: Math.min(.20,.09+delta*.0014),
      };
    }
    active.current = rig;
    invalidate();
  }, [rig, thumb, index, middle, ring, little, opposition, holding, preview, invalidate]);

  useFrame((_, dt) => {
    const move = transition.current;
    if (!move) return;
    noteMotion();
    move.elapsed += Math.min(dt, .05);
    const progress = Math.min(1, move.elapsed / move.duration);
    const eased = progress * progress * (3 - 2 * progress);
    const pose = current.current;
    for (const key of FINGERS) pose.angles[key] = move.start[key] + (move.goal[key] - move.start[key]) * eased;
    pose.opposition = move.fromOpposition + (move.toOpposition - move.fromOpposition) * eased;
    rig.update(pose.angles, pose.opposition, pose.holding);
    if (progress < 1) invalidate();
    else transition.current = null;
  });

  useEffect(() => () => rig.dispose(), [rig]);
  return <primitive object={rig.group} dispose={null} />;
}
