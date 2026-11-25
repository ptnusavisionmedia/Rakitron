"use client";

import { useEffect, useReducer, useRef } from "react";
import { BODY_PARTS, bodyInitialState, bodyReducer } from "./bodyGame";
import { emitAssemblyChange, type Bus } from "./gameEvents";

export function useBodyGame(bus: Bus, active: boolean) {
  const [state, dispatch] = useReducer(bodyReducer, undefined, bodyInitialState);
  const previous = useRef(state);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (!active || before === state) return;
    emitAssemblyChange(before, state, bus, state.selected === null ? 0 : BODY_PARTS[state.selected].steps.length);
    if (!before.won && state.won) bus.emit({ type: "win" });
    if (state.count === before.count && state.pose !== before.pose) bus.emit({ type: "servo", amount: .4 });
  }, [state, active, bus]);
  return {
    ...state, dispatch,
    select: (index: number) => dispatch({ type: "select", index }),
    rotate: () => dispatch({ type: "rotate" }),
    build: () => dispatch({ type: "build" }),
    place: (distance = 0, index?: number) => dispatch({ type: "place", distance, index }),
    undo: () => dispatch({ type: "undo" }),
    restart: () => dispatch({ type: "restart" }),
  };
}
