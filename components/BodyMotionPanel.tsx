"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { Check, Play, RotateCcw, Square } from "lucide-react";
import { BODY_JOINT_LIMITS, BODY_MISSION_HINT, BODY_NEUTRAL, type BodyAction, type BodyGameState, type BodyPose } from "../lib/bodyGame";

type Props = { state: BodyGameState; dispatch: Dispatch<BodyAction> };
const joints = ["rightArm", "leftArm", "head", "torso", "rightKnee", "leftKnee"] as const;

export function BodyMotionPanel({ state, dispatch }: Props) {
  const done = state.count === 6;
  return <div className="motion-pane body-motion">
    <div className="motion-intro"><div className="step-kicker">{done ? "Misi salam" : "Uji rakitan"}</div>
      <h3>{state.won ? "Robot berhasil menyapa!" : done ? "Sapa dengan tangan kanan" : "Uji sendi yang terpasang"}</h3>
      <p>{state.won ? "Coba gerakkan sendi lain atau kembalikan robot ke posisi tegak." : done ? BODY_MISSION_HINT : "Pilih sendi yang sudah terpasang. Kanan dan kiri mengikuti sisi tubuh robot."}</p>
    </div>
    <div className="joint-controls">{joints.map(key => {
      const { min, max, label, requires } = BODY_JOINT_LIMITS[key];
      const enabled = state.count >= requires;
      return <label key={key} className={`joint-row${enabled ? "" : " locked"}`}>
        <span><b>{label}</b><output>{enabled ? Math.round(state.pose[key]) + "°" : "Belum terpasang"}</output></span>
        <input type="range" aria-label={label} aria-valuetext={Math.round(state.pose[key]) + " derajat"} min={min} max={max}
          disabled={!enabled} value={state.pose[key]} onChange={e => dispatch({type: "pose", joint: key, value: Number(e.target.value)})}/>
      </label>;
    })}</div>
    <button className="wrist-neutral" type="button" disabled={joints.every(key => state.pose[key] === 0)}
      onClick={() => dispatch({type: "resetPose"})}><RotateCcw size={14}/>Kembalikan ke posisi tegak</button>
    {!done && <p className="live-hint" role="status">{state.hint}</p>}
  </div>;
}

const programs = {
  salam: { name: "Salam tangan kanan", frames: [
    { head: 28 }, { rightArm: 84 }, { rightArm: 65 }, { rightArm: 92 }, { rightArm: 70 }, { rightArm: 88 }, { ...BODY_NEUTRAL },
  ] },
  sendi: { name: "Periksa keseimbangan", frames: [
    { torso: 18, leftArm: 25 }, { rightKnee: 28, rightArm: 28 }, { ...BODY_NEUTRAL },
    { torso: -18, rightArm: 25 }, { leftKnee: 28, leftArm: 28 }, { ...BODY_NEUTRAL },
  ] },
} satisfies Record<string, { name: string; frames: Partial<BodyPose>[] }>;

type ProgramKey = keyof typeof programs;

export function BodyAutoPanel({ state, dispatch, active }: Props & { active: boolean }) {
  const [program, setProgram] = useState<ProgramKey | null>(null);
  const current = useRef(state.pose);
  current.current = state.pose;
  useEffect(() => {
    if (!program || state.count !== 6) return;
    if (!active) { setProgram(null); return; }
    const frames: Partial<BodyPose>[] = [{ ...BODY_NEUTRAL }, ...programs[program].frames];
    let index = 0, started = performance.now(), frame = 0;
    let from = { ...current.current }, last = { ...from };
    function advance(now: number) {
      const goal = { ...from, ...frames[index] };
      const t = Math.min(1, (now - started) / 650);
      const eased = t * t * (3 - 2 * t);
      for (const joint of joints) {
        const value = Math.round(from[joint] + (goal[joint] - from[joint]) * eased);
        if (last[joint] !== value) { dispatch({ type: "pose", joint, value }); last[joint] = value; }
      }
      if (t === 1) {
        from = goal; started = now; index++;
        if (index === frames.length) { setProgram(null); return; }
      }
      frame = requestAnimationFrame(advance);
    }
    frame = requestAnimationFrame(advance);
    const stopHidden = () => { if (document.hidden) setProgram(null); };
    document.addEventListener("visibilitychange", stopHidden);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", stopHidden); };
  }, [program, state.count, dispatch, active]);
  return <div className="motion-pane body-auto">
    <div className="motion-intro"><div className="step-kicker">Robot seluruh tubuh</div><h3>Gerak otomatis</h3>
      <p>Pilih gerakan untuk melihat beberapa sendi bekerja bersama.</p></div>
    {(Object.keys(programs) as ProgramKey[]).map(key => <button className="secondary-button" type="button"
      aria-pressed={program === key} key={key} onClick={() => setProgram(program === key ? null : key)}>
      {program === key ? <Square size={15}/> : <Play size={15}/>}
      {program === key ? "Hentikan gerakan" : programs[key].name}</button>)}
    {state.won && <p className="live-hint"><Check size={14}/> Misi salam berhasil.</p>}
  </div>;
}
