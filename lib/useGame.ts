'use client';

import { useEffect, useMemo, useReducer } from 'react';
import { gameReducer, initialState, type Finger, type HandPreset, type Joint, type RobotMode, type WristAxis } from './game';

export function useGame() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialState);
  const mode = state.cube.mode;

  useEffect(() => {
    if (mode !== 'falling') return;
    let previous = performance.now();
    let frame = 0;
    function advance(time: number) {
      dispatch({ type: 'tick', dt: (time - previous) / 1000 });
      previous = time;
      frame = requestAnimationFrame(advance);
    }
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const actions = useMemo(() => ({
    tryHand: () => dispatch({ type: 'tryHand' }),
    setRobotMode: (mode: RobotMode) => dispatch({ type: 'robotMode', mode }),
    setWrist: (key: WristAxis, value: number) => dispatch({ type: 'wrist', key, value }),
    resetWrist: () => dispatch({ type: 'resetWrist' }),
    setFinger: (key: Finger, value: number) => dispatch({ type: 'finger', key, value }),
    setOpposition: (value: number) => dispatch({ type: 'opposition', value }),
    setHandPreset: (preset: HandPreset) => dispatch({ type: 'handPreset', preset }),
    select: (index: number) => dispatch({ type: 'select', index }),
    rotate: () => dispatch({ type: 'rotate' }),
    place: (distance = 0, partIndex?: number) => dispatch({ type: 'place', distance, partIndex }),
    undo: () => dispatch({ type: 'undo' }),
    setJoint: (key: Joint, value: number) => dispatch({ type: 'joint', key, value }),
    open: () => dispatch({ type: 'open' }),
    close: () => dispatch({ type: 'close' }),
    resetCube: () => dispatch({ type: 'resetCube' }),
    restart: () => dispatch({ type: 'restart' }),
  }), []);

  return { ...state, ...actions };
}

export type Game = ReturnType<typeof useGame>;
