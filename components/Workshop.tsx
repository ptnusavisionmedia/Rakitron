"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine, ArrowRight, BookOpen, Box, Boxes, Check,
  CircleHelp, Crosshair, Expand, Focus, Grab, Hand,
  Layers3, Minus, MousePointer2, Orbit, Plus, RotateCcw,
  RotateCw, SlidersHorizontal, Sparkles, Square, Undo2, Repeat2, Star, Play, Volume2, VolumeX, Wrench, X, Music, Music2,
} from "lucide-react";
import { JOINT_LIMITS, buildStepsFor, partsFor, turnsToAlign, type RobotMode } from "../lib/game";
import { PLACE_LAND, createBus, useGameEvents } from "../lib/gameEvents";
import { sfx } from "../lib/sfx";
import AutoControls from "./AutoControls";
import Cheer from "./Cheer";
import HandControls from "./HandControls";
import WristControls from "./WristControls";
import { useGame, type Game } from "../lib/useGame";
import { useMotion, type MotionPlayer } from "../lib/useMotion";

const ComponentBench = dynamic(() => import("./ComponentBench"), { ssr: false, loading: () => null });
const WorkshopScene = dynamic(() => import("./WorkshopScene"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status"><span />Menyiapkan meja 3D…</div>,
});

type View = "perspective" | "front" | "top";
type Pane = "parts" | "assembly" | "motion" | "auto";
const HAND_ASSET_VERSION = "?v=centered-wrist";

type DialogType = "help" | "reference" | "restart" | null;
type JointKey = "yaw" | "shoulder" | "elbow";
const joints: { key: JointKey; title: string }[] = [
  { key: "yaw", title: "Putaran alas" },
  { key: "shoulder", title: "Sudut bahu" },
  { key: "elbow", title: "Sudut siku" },
];

function Brand() {
  return <span className="brand"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="#ff713d" />
    <path d="M7.8 32.4h18.6l-2.1-4.2h-4.7l2-9.9 6.6-4.3 3.8 1.5 2.8-2.1-1.3-2.3-1.9 1.2-2.4-1.2.4-2.5 2.1-.7-1.2-2.3-3.4 1.1-1.2 4-8.3 4.2-3.2 13.3H10z" fill="#142c24" />
    <circle cx="19.2" cy="16.4" r="3.65" fill="#142c24" />
    <circle cx="19.2" cy="16.4" r="1.35" fill="#ffb894" />
    <circle cx="17.2" cy="27.8" r="1.25" fill="#ffb894" />
  </svg><span>Rakitron</span></span>;
}

function Dialog({ kind, onClose, children }: { kind: DialogType; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (kind && !ref.current?.open) ref.current?.showModal();
    if (!kind && ref.current?.open) ref.current.close();
  }, [kind]);
  return <dialog className="workshop-dialog" ref={ref} onCancel={onClose}
    onClick={event => { if (event.target === ref.current) onClose(); }} aria-labelledby="dialog-title">
    <div className="dialog-inner">
      <button className="icon-button dialog-close" aria-label="Tutup" onClick={onClose}><X size={20}/></button>
      {children}
    </div>
  </dialog>;
}

function RunningBanner({ player }: { player: MotionPlayer }) {
  if (!player.status) return null;
  return <button type="button" className="auto-banner" onClick={() => player.stop()}>
    <span><b>{player.status.name}</b> sedang berjalan</span><i><Square size={11}/>Hentikan</i>
  </button>;
}

function MotionPanel({ game, active, player }: { game: Game; active: boolean; player: MotionPlayer }) {
  const [section, setSection] = useState<"fingers" | "wrist" | "arm">("fingers");
  const handReady = game.robotMode === "hand" && game.count === 6;
  const showFingers = handReady && section === "fingers";
  const showWrist = handReady && section === "wrist";
  return <div className="motion-pane">
    <div className="motion-intro"><div className="step-kicker">{handReady ? "Tangan lima jari" : game.count === 6 ? "Misi pemindahan" : "Uji rakitan"}</div>
      <h3>{game.won ? "Kubus berhasil dipindah!" : showWrist ? "Gerakkan pergelangan" : showFingers ? "Gerakkan jari" : game.count === 6 ? "Pindahkan kubus" : "Gerakkan sendi"}</h3>
      <p>{game.won ? "Coba lagi dari posisi awal jika kamu mau." : showWrist ? "Pilih sudut telapak atau putar satu putaran penuh." : showFingers ? "Pilih gestur atau atur tekukan setiap jari." : handReady ? "Arahkan telapak ke kubus, lalu pilih Genggam di kontrol Jari." : game.count === 6 ? "Jepit kubus, angkat, lalu lepaskan di dalam baki." : "Coba setiap sendi begitu komponennya terpasang."}</p>
    </div>
    <RunningBanner player={player}/>
    {handReady && <div className="motion-sections" role="group" aria-label="Bagian yang digerakkan">
      <button type="button" aria-pressed={section === "fingers"} onClick={() => setSection("fingers")}>Jari</button>
      <button type="button" aria-pressed={section === "wrist"} onClick={() => setSection("wrist")}>Pergelangan</button>
      <button type="button" aria-pressed={section === "arm"} onClick={() => setSection("arm")}>Lengan</button>
    </div>}
    {showFingers ? <HandControls game={game}/> : showWrist ? <WristControls game={game} active={active}/> : <div className="joint-controls">
      {joints.map(({ key, title }) => {
        const limit = JOINT_LIMITS[key];
        const enabled = game.count >= limit.requires;
        return <label key={key} className={`joint-row ${enabled ? "" : "locked"} ${game.highlight === key ? "hinted" : ""}`}>
          <span><b>{title}</b><output>{enabled ? Math.round(game.joints[key]) + "°" : "Belum terpasang"}</output></span>
          <input aria-label={title} type="range" min={limit.min} max={limit.max} step="1" disabled={!enabled}
            value={game.joints[key]} onChange={event => game.setJoint(key, Number(event.target.value))}/>
        </label>;
      })}
    </div>}
    {game.robotMode === "gripper" && <div className={`grip-controls ${game.highlight === "grip" ? "hinted" : ""}`}>
      <span>Capit</span><div>
        <button disabled={game.count < 6} onClick={() => game.open()}><Hand size={14}/> Buka</button>
        <button disabled={game.count < 6} onClick={() => game.close()}><Grab size={14}/> Jepit</button>
      </div>
    </div>}
    <p className="live-hint" role="status">{game.hint}</p>
    {game.count === 6 && <button className="text-button cube-reset" onClick={() => game.resetCube()}><RotateCcw size={14}/> Kembalikan kubus</button>}
  </div>;
}

function AutoPanel({ game, player }: { game: Game; player: MotionPlayer }) {
  return <div className="motion-pane">
    <div className="motion-intro"><div className="step-kicker">{game.robotMode === "hand" ? "Tangan lima jari" : "Capit paralel"}</div>
      <h3>Gerak otomatis</h3>
      <p>Pilih program, lalu robot bergerak sendiri. Tekan program yang berjalan untuk menghentikannya.</p>
    </div>
    <AutoControls game={game} player={player}/>
    <p className="live-hint" role="status">{game.hint}</p>
  </div>;
}

const ROBOTS: { mode: RobotMode; name: string; tagline: string; image: string; level: number; points: string[] }[] = [
  { mode: "gripper", name: "Lengan capit", tagline: "Robot pabrik yang memindahkan barang", image: "/parts/assembled.svg", level: 1,
    points: ["6 komponen, 24 bagian untuk dirakit", "Dua rahang yang menjepit benda", "Bisa mengelas, memindai, dan mengecat"] },
  { mode: "hand", name: "Lengan tangan lima jari", tagline: "Robot dengan tangan seperti tanganmu", image: "/parts/assembled-hand.svg" + HAND_ASSET_VERSION, level: 2,
    points: ["6 komponen, 25 bagian untuk dirakit", "Lima jari dan pergelangan yang lentur", "Bisa berhitung, mencubit, dan memutar baut"] },
];

function RobotMenu({ game, onChoose }: { game: Game; onChoose: (mode: RobotMode, ready?: boolean) => void }) {
  return <section className="robot-menu" aria-labelledby="menu-title">
    <div className="menu-intro">
      <div className="step-kicker">Bengkel Rakitron</div>
      <h1 id="menu-title">Pilih robot yang mau kamu rakit<span>.</span></h1>
      <p>Setiap robot dirakit dari enam komponen. Kamu akan merakit tiap komponen dulu di ruang rakit, lalu memasangnya ke robot.</p>
    </div>
    <div className="robot-cards">
      {ROBOTS.map(robot => {
        const started = game.robotMode === robot.mode && game.count > 0;
        return <article key={robot.mode} className="robot-card">
          <div className="robot-picture"><img src={robot.image} alt="" draggable="false"/>
            <span className="robot-level" aria-label={"Tingkat " + robot.level + " dari 2"}>{[1, 2].map(n => <Star key={n} size={13} fill={n <= robot.level ? "currentColor" : "none"}/>)}{robot.level === 1 ? "Mudah" : "Menantang"}</span>
          </div>
          <div className="robot-info">
            <h2>{robot.name}</h2>
            <p>{robot.tagline}</p>
            <ul>{robot.points.map(point => <li key={point}><Check size={13} strokeWidth={3}/>{point}</li>)}</ul>
            {started && <div className="robot-progress"><span>Sudah terpasang {game.count} dari 6</span><i style={{ width: game.count / 6 * 100 + "%" }}/></div>}
            <button type="button" className="primary-button" onClick={() => onChoose(robot.mode)}><Play size={16}/><span>{started ? "Lanjutkan merakit" : "Rakit robot ini"}</span><ArrowRight className="end-icon" size={16}/></button>
            {robot.mode === "hand" && <button type="button" className="text-button robot-skip" onClick={() => onChoose("hand", true)}>Lewati perakitan, coba tangan yang sudah jadi</button>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function CameraToolbar({ view, setView, zoom, reset }: { view: View; setView: (v: View) => void; zoom: (n: number) => void; reset: () => void }) {
  const [showViews, setShowViews] = useState(false);
  const viewButtons = [{ key: "perspective" as View, label: "Perspektif" }, { key: "front" as View, label: "Depan" }, { key: "top" as View, label: "Atas" }];
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showViews) return;
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setShowViews(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setShowViews(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [showViews]);
  return <div className="camera-toolbar" aria-label="Kontrol kamera">
    <div className="camera-menu-wrap" ref={menuRef}>
      {showViews && <div className="camera-menu" aria-label="Pilih sudut pandang">
        {viewButtons.map(v => <button key={v.key} aria-pressed={view === v.key} onClick={() => { setView(v.key); setShowViews(false); }}>
          {v.label}{view === v.key && <Check size={15}/>}
        </button>)}
      </div>}
      <button className="camera-view" title="Pilih sudut pandang" aria-label="Pilih sudut pandang" aria-expanded={showViews} onClick={() => setShowViews(!showViews)}><Box size={17}/><span>{viewButtons.find(v => v.key === view)?.label}</span></button>
    </div>
    <i/><button aria-label="Perbesar tampilan" title="Perbesar" onClick={() => zoom(1)}><Plus size={17}/></button>
    <button aria-label="Perkecil tampilan" title="Perkecil" onClick={() => zoom(-1)}><Minus size={17}/></button>
    <i/><button aria-label="Atur ulang kamera" title="Atur ulang kamera" onClick={reset}><Focus size={16}/></button>
  </div>;
}

function Axis() {
  return <svg className="axis" viewBox="0 0 46 44" fill="none" aria-hidden="true">
    <path d="M22 29V8" stroke="#648974" strokeWidth="1.5"/><path d="m22 29 15 6" stroke="#d17f62" strokeWidth="1.5"/>
    <path d="m22 29-15 7" stroke="#7894a0" strokeWidth="1.5"/><circle cx="22" cy="29" r="2.7" fill="#63736a"/>
    <g fontFamily="monospace" fontWeight="600" fontSize="8"><text x="19.5" y="7" fill="#426b51">Y</text><text x="38" y="39" fill="#ac5d43">X</text><text x="1" y="40" fill="#597e8e">Z</text></g>
  </svg>;
}

export default function Workshop() {
  const game = useGame();
  const player = useMotion(game);
  const [screen, setScreen] = useState<"menu" | "workshop">("menu");
  const [benchHold, setBenchHold] = useState(false);
  const [pane, setPane] = useState<Pane>("parts");
  const [desktopPane, setDesktopPane] = useState<"assembly" | "motion" | "auto">("assembly");
  const [dialog, setDialog] = useState<DialogType>(null);
  const [view, setView] = useState<View>("perspective");
  const [zoom, setZoom] = useState(0);
  const [cameraReset, setCameraReset] = useState(0);
  const [socketFocus, setSocketFocus] = useState(0);
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(false);
  const bus = useRef(createBus()).current;
  const previousCount = useRef(0);
  const previousSelection = useRef<number | null>(null);
  const primaryAction = useRef<HTMLButtonElement>(null);
  const latest = useRef(game);
  latest.current = game;
  const { count, selected, won } = game;
  const parts = partsFor(game.robotMode);
  const next = parts[Math.min(count, parts.length - 1)];
  const complete = count === parts.length;
  const isHand = game.robotMode === "hand";
  const referenceImage = isHand ? "/parts/assembled-hand.svg" + HAND_ASSET_VERSION : "/parts/assembled.svg";
  const referenceAlt = isHand ? "Lengan robot lengkap dengan tangan lima jari" : "Lengan robot lengkap dengan capit paralel";
  const buildSteps = selected !== null ? buildStepsFor(game.robotMode, selected) : [];
  const building = selected !== null && game.built < buildSteps.length;
  const needsRotation = selected !== null && !building && turnsToAlign(game.rotation) > 0;

  useGameEvents(game, bus);
  // Suara menyala secara bawaan; pilihan anak disimpan. Browser baru mengizinkan bunyi setelah sentuhan pertama.
  useEffect(() => {
    try {
      if (localStorage.getItem("rakitron-sound") === "off") setSound(false);
      if (localStorage.getItem("rakitron-music") === "on") setMusic(true);
    } catch { /* penyimpanan tidak tersedia */ }
    const unlock = () => { void sfx.unlock(); };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => { window.removeEventListener("pointerdown", unlock, { capture: true }); window.removeEventListener("keydown", unlock, { capture: true }); };
  }, []);
  useEffect(() => { sfx.setEnabled(sound); }, [sound]);
  useEffect(() => { sfx.setMusic(music && sound); }, [music, sound]);
  useEffect(() => bus.on(event => {
    switch (event.type) {
      case "select": sfx.play("select"); break;
      case "rotate": sfx.play("rotate"); break;
      case "built": sfx.play("snap"); sfx.play("note", { delay: .04, step: event.step }); break;
      case "placed":
        if (event.bulk) break;
        sfx.play("whoosh");
        sfx.play("snap", { delay: PLACE_LAND });
        if (!event.complete) sfx.play("note", { delay: PLACE_LAND + .02, step: event.index });
        break;
      case "complete": sfx.play("fanfare", { delay: event.bulk ? 0 : PLACE_LAND + .12 }); break;
      case "undo": sfx.play("undo"); break;
      case "magnet": sfx.play("magnet"); break;
      case "servo": sfx.play("servo", { amount: event.amount }); break;
      case "grab": sfx.play("grab"); break;
      case "release": sfx.play("release"); break;
      case "land": sfx.play("land"); break;
      case "win": sfx.play("win"); break;
    }
  }), [bus]);
  function toggleSound() {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem("rakitron-sound", next ? "on" : "off"); } catch { /* abaikan */ }
    if (next) { sfx.setEnabled(true); void sfx.unlock().then(() => sfx.play("select")); }
  }
  function toggleMusic() {
    const next = !music;
    setMusic(next);
    try { localStorage.setItem("rakitron-music", next ? "on" : "off"); } catch { /* abaikan */ }
    if (next && !sound) toggleSound();
    void sfx.unlock();
  }
  useEffect(() => {
    if (count > previousCount.current) {
      if (complete) { setDesktopPane("motion"); setPane("motion"); }
    } else if (selected !== null && selected !== previousSelection.current) {
      setDesktopPane("assembly");
      setPane("assembly");
    } else if (count < previousCount.current && count > 0) {
      setDesktopPane("assembly");
      setPane("assembly");
    }
    previousCount.current = count;
    previousSelection.current = selected;
  }, [count, selected, complete]);
  useEffect(() => {
    if (dialog) return;
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable='true']") || e.repeat) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); latest.current.undo(); return; }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key.toLowerCase() === "r" && latest.current.selected !== null) { e.preventDefault(); latest.current.rotate(); }
      if (e.key === "Enter" && !(e.target as HTMLElement)?.closest("button,a") && latest.current.selected !== null) { e.preventDefault(); primaryAction.current?.click(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [dialog]);

  function changePane(nextPane: Pane) { setPane(nextPane); if (nextPane !== "parts") setDesktopPane(nextPane); }
  function choose(index: number, fromKeyboard = false) {
    if (index !== count) return;
    game.select(index);
    changePane("assembly");
    if (fromKeyboard) requestAnimationFrame(() => primaryAction.current?.focus());
  }
  function resetCamera() { setView("perspective"); setZoom(0); setCameraReset(v => v + 1); }
  function chooseModel(mode: RobotMode) {
    if (mode === game.robotMode) return;
    game.setRobotMode(mode);
    changePane("assembly");
    resetCamera();
  }
  // Ambil dan taruh memakai seluruh lengan, jadi kamera kembali ke pandangan penuh.
  const autoPlayer: MotionPlayer = { ...player, play: id => { if (id.endsWith("pick-place")) resetCamera(); player.play(id); } };
  function chooseRobot(mode: RobotMode, ready = false) {
    if (mode !== game.robotMode) game.setRobotMode(mode);
    if (ready) game.tryHand();
    setScreen("workshop");
    changePane(ready ? "motion" : "assembly");
    resetCamera();
  }
  function openMenu() { player.stop(); setScreen("menu"); window.scrollTo({ top: 0 }); }
  // Ruang rakit tetap terbuka sebentar setelah bagian terakhir masuk, supaya animasinya terlihat.
  useEffect(() => {
    if (selected === null) { setBenchHold(false); return; }
    if (building) { setBenchHold(true); return; }
    const timer = setTimeout(() => setBenchHold(false), 1500);
    return () => clearTimeout(timer);
  }, [selected, building]);
  const showBench = selected !== null && !complete && (building || benchHold);
  const benchPart = selected !== null ? parts[selected] : null;
  function restart() { game.restart(); changePane("parts"); setDesktopPane("assembly"); resetCamera(); setDialog(null); }

  return <div className="workshop-app">
    <header className="site-header"><div className="header-inner">
      <a className="brand-link" href="#bengkel" aria-label="Rakitron, ke bengkel"><Brand/></a>
      <nav className="main-nav" aria-label="Navigasi utama">
        <a href="#bengkel" className="active"><Wrench size={16}/> Bengkel</a>
        <button onClick={() => setDialog("help")}><BookOpen size={16}/> Cara bermain</button>
      </nav>
      {screen === "workshop" && <div className="header-status" aria-hidden="true">
        <b>{isHand ? "Lengan tangan lima jari" : "Lengan capit"}</b>
        <span className="progress-track">{parts.map((part, i) => <i key={part.id} className={i < count ? "filled" : ""}/>)}</span>
        <span className="progress-count"><strong>{count}</strong> / 6</span>
      </div>}
      <div className="header-actions">
        <button className={`sound-button ${music && sound ? "is-on" : ""}`} title={music ? "Matikan musik" : "Nyalakan musik"} aria-label={music ? "Matikan musik" : "Nyalakan musik"} aria-pressed={music} onClick={toggleMusic}>{music && sound ? <Music2 size={17}/> : <Music size={17}/>}</button>
        <button className={`sound-button ${sound ? "is-on" : ""}`} title={sound ? "Matikan suara" : "Aktifkan suara"} aria-label={sound ? "Matikan suara" : "Aktifkan suara"} aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button>
        {screen === "workshop" && <button className="restart-button" onClick={openMenu}><Repeat2 size={15}/><span>Ganti robot</span></button>}
        {screen === "workshop" && <button className="restart-button" onClick={() => setDialog("restart")}><RotateCcw size={15}/><span>Mulai ulang</span></button>}
      </div>
    </div></header>
    <main className="studio" id="bengkel" data-screen={screen}>
      {screen === "menu" ? <RobotMenu game={game} onChoose={chooseRobot}/> : <>
      <section className="studio-heading" aria-labelledby="workshop-title"><div>
        <h1 id="workshop-title">{isHand ? "Lengan tangan lima jari" : "Lengan capit"}<span>.</span></h1>
        <p>Rakit tiap komponen di ruang rakit, pasang ke robot, lalu uji geraknya.</p>
      </div><div className="build-progress" role="progressbar" aria-label="Komponen terpasang" aria-valuenow={count} aria-valuemin={0} aria-valuemax={6}>
        <div><span className="progress-name">Progres rakitan</span><span className="progress-count"><strong>{count}</strong> / 6</span></div>
        <div className="progress-track">{parts.map((part, i) => <i key={part.id} className={i < count ? "filled" : ""}/>)}</div>
      </div></section>
      <div className="workspace" data-pane={pane} data-hand-ready={isHand && complete}>
        <section className="scene-panel" aria-label="Meja perakitan tiga dimensi">
          <WorkshopScene game={game} bus={bus} view={view} zoom={zoom} cameraReset={cameraReset} socketFocus={socketFocus}/>
          <Cheer bus={bus} nameOf={i => parts[i]?.name ?? "Komponen"}/>
          {showBench && benchPart && <div className="bench" role="group" aria-label={"Ruang rakit " + benchPart.name}>
            <ComponentBench mode={game.robotMode} index={selected!} built={game.built} onBuild={game.build}/>
            <div className="bench-title"><span>Ruang rakit</span><b>{benchPart.name}</b></div>
            <div className="bench-dots" aria-hidden="true">{buildSteps.map((part, i) => <i key={part.name} className={i < game.built ? "done" : i === game.built ? "current" : ""}/>)}</div>
            <div className={`bench-note ${building ? "" : "finished"}`} role="status">
              {building ? <><small>Bagian {game.built + 1} dari {buildSteps.length} · seret atau ketuk bagian ini</small><b>{buildSteps[game.built].name}</b></>
                : <><small>Semua bagian terpasang</small><b>{benchPart.name} selesai!</b></>}
            </div>
            <span className="bench-tip">Seret latar untuk memutar</span>
          </div>}
          <div className="scene-caption"><span className="live-dot"/><span>Meja kerja</span></div>
          <button className="socket-focus" disabled={complete && !isHand} onClick={() => setSocketFocus(v => v + 1)} title={complete && isHand ? "Lihat tangan" : "Lihat sambungan"}><Crosshair size={14}/><span>{complete && isHand ? "Lihat tangan" : "Lihat sambungan"}</span></button>
          <CameraToolbar view={view} setView={setView} reset={resetCamera} zoom={n => setZoom(v => Math.max(-6, Math.min(8, v + n)))}/>
          <Axis/>
        </section>
        <div className="mobile-tabs" aria-label="Tampilan bengkel">
          <button aria-pressed={pane === "parts"} onClick={() => changePane("parts")}><Boxes size={15}/>Komponen</button>
          <button aria-pressed={pane === "assembly"} onClick={() => changePane("assembly")}><Layers3 size={15}/>Perakitan</button>
          <button aria-pressed={pane === "motion"} onClick={() => changePane("motion")}><SlidersHorizontal size={15}/>Uji gerak</button>
          <button aria-pressed={pane === "auto"} disabled={!complete} onClick={() => changePane("auto")}><Sparkles size={15}/>Otomatis</button>
        </div>
        <aside className="guide-panel" aria-label="Panduan dan kontrol robot">
          <div className="guide-tabs" aria-label="Pilih panel">
            <button aria-pressed={desktopPane === "assembly"} onClick={() => changePane("assembly")}><i>{complete ? <Check size={11} strokeWidth={3}/> : 1}</i>Rakit</button>
            <button aria-pressed={desktopPane === "motion"} onClick={() => changePane("motion")}><i>2</i>Uji gerak</button>
            <button aria-pressed={desktopPane === "auto"} disabled={!complete} title={complete ? undefined : "Selesaikan rakitan dulu"} onClick={() => changePane("auto")}><i>3</i>Otomatis</button>
          </div>
          {desktopPane === "assembly" ? <div className="guide-body">
            {(selected === null || complete) && <button className="reference-card" aria-label="Perbesar model acuan lengan robot" onClick={() => setDialog("reference")}>
              <span className="ref-caption"><span/>Model acuan</span>
              <img src={referenceImage} alt={referenceAlt} draggable="false"/>
              <span className="ref-expand"><Expand size={12}/></span>
            </button>}
            <div className="guide-direction"><div className="step-kicker">{complete ? "Perakitan selesai" : `Langkah ${String(count + 1).padStart(2, "0")} / 06`}</div>
              <h2>{complete ? "Robot siap bergerak!" : `${building ? "Rakit" : "Pasang"} ${next.name.toLocaleLowerCase("id")}`}</h2>
              <p aria-live="polite">{game.hint}</p>
            </div>
            {selected !== null && !complete && <ol className="build-steps" aria-label={"Bagian " + next.name}>
              {buildSteps.map((part, i) => <li key={part.name} className={i < game.built ? "done" : i === game.built ? "current" : ""}>
                <i>{i < game.built ? <Check size={11} strokeWidth={3}/> : i + 1}</i>
                <span><b>{part.name}</b>{(i === game.built || (!building && i === buildSteps.length - 1)) && <small>{part.detail}</small>}</span>
              </li>)}
            </ol>}
            <div className="assembly-actions">
              <button ref={primaryAction} className={`primary-button ${!complete && !needsRotation ? "attention" : ""}`} onClick={() => {
                setBenchHold(false);
                if (complete) changePane("motion");
                else if (selected === null) choose(count);
                else if (building) game.build();
                else if (needsRotation) game.rotate();
                else game.place(0, selected);
              }}>{complete ? <SlidersHorizontal size={17}/> : selected === null ? <MousePointer2 size={17}/> : building ? <Wrench size={17}/> : needsRotation ? <RotateCw size={17}/> : <ArrowDownToLine size={17}/>}
              <span>{complete ? "Buka kontrol gerak" : selected === null ? "Pilih komponen" : building ? `Pasang ${buildSteps[game.built].name.toLocaleLowerCase("id")} otomatis` : needsRotation ? "Putar 90°" : "Pasang ke robot"}</span><ArrowRight className="end-icon" size={16}/></button>
              <div className="secondary-actions"><button disabled={selected === null || complete || building} onClick={() => game.rotate()} title="Putar komponen" aria-label="Putar komponen"><RotateCw size={14}/>Putar 90°</button>
                <button disabled={count === 0} onClick={() => game.undo()} title="Lepas bagian terakhir" aria-label="Lepas bagian terakhir"><Undo2 size={15}/>Urungkan</button></div>
            </div>
          </div> : desktopPane === "auto" && complete ? <AutoPanel game={game} player={autoPlayer}/>
            : <MotionPanel game={game} active={pane === "motion" && dialog === null} player={player}/>}
        </aside>
        <section className="parts-drawer" aria-labelledby="parts-heading">
          <div className="drawer-heading"><div><div className="drawer-icon"><Boxes size={21}/></div><h2 id="parts-heading">Laci komponen</h2></div><span className="drawer-count">{parts.length} komponen</span></div>
          <div className="parts-grid">{parts.map((part, i) => {
            const fitted = i < count, current = i === count, chosen = selected === i;
            return <button key={part.id} className={`part-card ${fitted ? "fitted" : ""} ${current ? "current" : ""} ${chosen ? "chosen" : ""}`} disabled={!current}
              title={part.description} draggable={current}
              onDragStart={event => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-rakitron-part", String(i));
                game.select(i);
              }}
              aria-label={`${part.name}${fitted ? ", sudah terpasang" : chosen ? ", dipilih" : current ? ", siap dipasang" : ", menunggu giliran"}`} aria-pressed={chosen} onClick={event => choose(i, event.detail === 0)}>
              <span className="part-index">{String(i + 1).padStart(2, "0")}</span>
              <span className="part-indicator">{fitted ? <Check size={11} strokeWidth={3}/> : current ? <i/> : null}</span>
              <img alt="" src={part.id === "hand" ? part.thumb + HAND_ASSET_VERSION : part.thumb} draggable="false"/><span className="part-label">{part.name}</span>
            </button>;
          })}</div>
        </section>
      </div>
      <div className="workshop-footer"><span><Orbit size={14}/>Seret meja untuk memutar pandangan.</span>
        <span className="status-keys"><span><kbd>R</kbd> Putar</span><span><kbd>Enter</kbd> Pasang</span><span><kbd>Ctrl Z</kbd> Urungkan</span></span><button onClick={() => setDialog("help")}><CircleHelp size={14}/>Bantuan bengkel</button></div>

      </>}
    </main>
    <Dialog kind={dialog} onClose={() => setDialog(null)}>
      {dialog === "help" && <><span className="dialog-symbol"><BookOpen size={24}/></span><h2 id="dialog-title">Cara bermain</h2>
        <ol className="help-steps"><li><strong>Pilih robot dan komponen</strong><p>Di layar awal, pilih robot yang mau dirakit. Lalu pilih komponen dari laci, mulai dari alas. Tombol Ganti robot membawamu kembali ke layar pilihan.</p></li>
          <li><strong>Cocokkan dan pasang</strong><p>Komponen yang dipilih masuk ke ruang rakit. Pasang bagiannya satu per satu sambil membaca kegunaannya. Lalu, jika diminta, tekan Putar 90° sampai bagian sejajar. Lalu ketuk soket, seret bagian ke soket, atau tekan Pasang komponen.</p></li>
          <li><strong>Gerakkan rakitanmu</strong><p>Buka Uji gerak untuk mencoba sendi. Pada model tangan, dekatkan lengan ke kubus, atur arah telapak di Pergelangan, lalu buka Jari untuk memilih Genggam atau Cubit.</p></li></ol>
        <div className="shortcuts"><span><kbd>R</kbd> Putar bagian</span><span><kbd>Enter</kbd> Pasang</span><span><kbd>Ctrl/⌘ Z</kbd> Urungkan</span></div>
        <button className="primary-button modal-primary" onClick={() => setDialog(null)}>Kembali ke bengkel<ArrowRight size={16}/></button></>}
      {dialog === "reference" && <><div className="step-kicker">Model acuan</div><h2 id="dialog-title">Lengan robot lengkap</h2><div className="ref-large"><img src={referenceImage} alt={referenceAlt}/></div>
        <p>{isHand ? "Poros terpasang di tengah ujung lengan bawah dan segaris dengan tengah telapak. Telapak dapat berputar 360°, menekuk, dan miring pada sambungan ini." : "Ikuti urutan komponen dari alas hingga capit. Coba gerakkan setiap sendi saat sudah terpasang."}</p>
        {isHand && <a className="hand-download" href={"/models/rakitron-hand.glb" + HAND_ASSET_VERSION} download="Rakitron-Tangan-Lima-Jari.glb"><ArrowDownToLine size={16}/>Unduh model 3D (.glb)</a>}</>}
      {dialog === "restart" && <><span className="dialog-symbol"><RotateCcw size={24}/></span><h2 id="dialog-title">Mulai rakitan baru?</h2><p>Komponen akan kembali ke laci dan kubus akan kembali ke posisi awal.</p>
        <div className="confirm-buttons"><button className="secondary-button" onClick={() => setDialog(null)}>Lanjut bermain</button><button className="primary-button" onClick={restart}>Mulai ulang<RotateCcw size={15}/></button></div></>}
    </Dialog>
    <span className="sr-only" role="status">{won ? "Misi selesai. Kubus sudah berada di dalam baki." : ""}</span>
  </div>;
}



