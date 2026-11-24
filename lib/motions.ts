// Program gerak otomatis: urutan langkah yang dijalankan lewat aksi permainan biasa,
// sehingga batas sendi, tabrakan dengan meja, dan aturan menggenggam tetap berlaku.
import {
  DEFAULT_JOINTS, FINGERS, HAND_PRESETS,
  type Action, type Finger, type FingerAngles, type GameState, type Joint, type Joints,
  type RobotMode, type WristAngles, type WristAxis,
} from './game.ts';

export type MotionSound = 'motionStart' | 'motionEnd' | 'weld' | 'spray' | 'scan' | 'torque';
type Pose = { joints?: Partial<Joints>; wrist?: Partial<WristAngles>; fingers?: Partial<FingerAngles>; opposition?: number };
export type MotionStep =
  | ({ kind: 'move'; seconds: number; sound?: MotionSound; label?: string } & Pose)
  | { kind: 'do'; action: Action; seconds: number; sound?: MotionSound; label?: string }
  | { kind: 'settle'; seconds: number; label?: string };
export type Motion = { id: string; mode: RobotMode; name: string; detail: string; steps: MotionStep[] };

const move = (seconds: number, pose: Pose, extra: { sound?: MotionSound; label?: string } = {}): MotionStep =>
  ({ kind: 'move', seconds, ...pose, ...extra });
const act = (action: Action, seconds: number, extra: { sound?: MotionSound; label?: string } = {}): MotionStep =>
  ({ kind: 'do', action, seconds, ...extra });
const OPEN_HAND = { ...HAND_PRESETS.open.fingers };
const FIST: FingerAngles = { thumb: 78, index: 86, middle: 88, ring: 88, little: 90 };

const gripperHome = (seconds = 1.4): MotionStep => move(seconds, { joints: { ...DEFAULT_JOINTS } }, { label: 'Kembali ke posisi siaga' });
const handHome = (seconds = 1.4): MotionStep[] => [
  act({ type: 'resetWrist' }, .35, { label: 'Meluruskan pergelangan' }),
  move(seconds, { joints: { ...DEFAULT_JOINTS }, wrist: { pitch: 0, deviation: 0 }, fingers: OPEN_HAND, opposition: 0 }, { label: 'Kembali ke posisi siaga' }),
];

// Las titik: lengan berhenti di tiap titik, turun, menekan elektroda, lalu naik lagi.
const weldSpots = [-122, -104, -86, -68].flatMap((yaw, i): MotionStep[] => [
  move(i ? .55 : 1.1, { joints: { yaw, shoulder: 46, elbow: -95 } }, { label: `Menuju titik las ${i + 1}` }),
  move(.32, { joints: { shoulder: 37 } }, { label: 'Menurunkan elektroda' }),
  act({ type: 'close' }, .28, { sound: 'weld', label: 'Mengelas' }),
  act({ type: 'open' }, .16),
  move(.3, { joints: { shoulder: 46 } }),
]);

const GRIPPER_MOTIONS: Motion[] = [
  {
    id: 'gripper-calibrate', mode: 'gripper', name: 'Kalibrasi sumbu',
    detail: 'Setiap sumbu bergerak bergantian sampai ke dua batasnya, seperti robot industri saat dinyalakan.',
    steps: [
      act({ type: 'open' }, .3, { label: 'Membuka capit' }),
      move(1.3, { joints: { yaw: -150 } }, { label: 'Sumbu 1: putaran alas' }),
      move(2.2, { joints: { yaw: -40 } }),
      move(1.2, { joints: { yaw: -95 } }),
      move(1.1, { joints: { shoulder: 85 } }, { label: 'Sumbu 2: bahu' }),
      move(1.4, { joints: { shoulder: 40 } }),
      move(.8, { joints: { shoulder: 55 } }),
      move(1.2, { joints: { elbow: -45 } }, { label: 'Sumbu 3: siku' }),
      move(1.6, { joints: { elbow: -125 } }),
      move(.9, { joints: { elbow: -95 } }),
      act({ type: 'close' }, .45, { label: 'Uji capit' }),
      act({ type: 'open' }, .45),
      act({ type: 'close' }, .35),
      act({ type: 'open' }, .35),
    ],
  },
  {
    id: 'gripper-scan', mode: 'gripper', name: 'Pindai area kerja',
    detail: 'Lengan menyapu meja perlahan dari kiri ke kanan pada dua ketinggian, seperti robot inspeksi.',
    steps: [
      act({ type: 'open' }, .3, { label: 'Membuka capit' }),
      move(1.2, { joints: { yaw: -155, shoulder: 44, elbow: -100 } }, { label: 'Menuju awal lintasan' }),
      move(3.6, { joints: { yaw: -30 } }, { sound: 'scan', label: 'Memindai baris bawah' }),
      move(.8, { joints: { shoulder: 54, elbow: -82 } }, { label: 'Naik ke baris berikutnya' }),
      move(3.6, { joints: { yaw: -155 } }, { sound: 'scan', label: 'Memindai baris atas' }),
      gripperHome(),
    ],
  },
  {
    id: 'gripper-weld', mode: 'gripper', name: 'Las titik',
    detail: 'Berhenti di empat titik berurutan, turun, menekan, lalu naik, seperti robot las di pabrik mobil.',
    steps: [act({ type: 'open' }, .3, { label: 'Membuka elektroda' }), ...weldSpots, gripperHome()],
  },
  {
    id: 'gripper-spray', mode: 'gripper', name: 'Semprot cat',
    detail: 'Sapuan mendatar yang rata, turun satu baris setiap lintasan, seperti robot pengecatan.',
    steps: [
      act({ type: 'open' }, .3, { label: 'Menyiapkan nosel' }),
      move(1.2, { joints: { yaw: -132, shoulder: 62, elbow: -72 } }, { label: 'Menuju sudut panel' }),
      move(1.7, { joints: { yaw: -58 } }, { sound: 'spray', label: 'Lintasan 1' }),
      move(.5, { joints: { shoulder: 54, elbow: -82 } }),
      move(1.7, { joints: { yaw: -132 } }, { sound: 'spray', label: 'Lintasan 2' }),
      move(.5, { joints: { shoulder: 46, elbow: -92 } }),
      move(1.7, { joints: { yaw: -58 } }, { sound: 'spray', label: 'Lintasan 3' }),
      gripperHome(),
    ],
  },
];

const oneFinger = (finger: Finger, label: string): MotionStep[] => [
  move(.42, { fingers: { [finger]: finger === 'thumb' ? 70 : 84 } }, { label }),
  move(.38, { fingers: { [finger]: 0 } }),
];
const fastenTurn = (label: string): MotionStep[] => [
  move(1.9, { wrist: { roll: 360 } }, { sound: 'torque', label }),
  act({ type: 'resetWrist' }, .12),
];

const HAND_MOTIONS: Motion[] = [
  {
    id: 'hand-finger-test', mode: 'hand', name: 'Uji jari berurutan',
    detail: 'Setiap jari menekuk dan lurus kembali satu per satu, uji standar tangan robot dan prostetik.',
    steps: [
      act({ type: 'handPreset', preset: 'open' }, .5, { label: 'Membuka tangan' }),
      ...oneFinger('little', 'Kelingking'), ...oneFinger('ring', 'Jari manis'), ...oneFinger('middle', 'Jari tengah'),
      ...oneFinger('index', 'Telunjuk'), ...oneFinger('thumb', 'Ibu jari'),
      move(.7, { opposition: 80 }, { label: 'Oposisi ibu jari' }),
      move(.7, { opposition: 0 }),
      move(.9, { fingers: FIST, opposition: 40 }, { label: 'Mengepal' }),
      move(.9, { fingers: OPEN_HAND, opposition: 0 }, { label: 'Membuka' }),
    ],
  },
  {
    id: 'hand-count', mode: 'hand', name: 'Hitung satu sampai lima',
    detail: 'Dari kepalan, jari terbuka satu per satu seperti berhitung, lalu kembali terbuka.',
    steps: [
      act({ type: 'handPreset', preset: 'open' }, .4, { label: 'Membuka tangan' }),
      move(.9, { fingers: FIST, opposition: 30 }, { label: 'Mengepal' }),
      move(.5, { fingers: { index: 0 } }, { label: 'Satu' }),
      move(.5, { fingers: { middle: 0 } }, { label: 'Dua' }),
      move(.5, { fingers: { ring: 0 } }, { label: 'Tiga' }),
      move(.5, { fingers: { little: 0 } }, { label: 'Empat' }),
      move(.6, { fingers: { thumb: 0 }, opposition: 0 }, { label: 'Lima' }),
      move(.5, { wrist: { deviation: 18 } }, { label: 'Melambai' }),
      move(.6, { wrist: { deviation: -26 } }),
      move(.6, { wrist: { deviation: 18 } }),
      move(.5, { wrist: { deviation: 0 } }),
    ],
  },
  {
    id: 'hand-fasten', mode: 'hand', name: 'Kencangkan baut',
    detail: 'Jari mencubit lalu pergelangan berputar penuh berulang kali, seperti robot perakit memutar baut.',
    steps: [
      act({ type: 'handPreset', preset: 'open' }, .4, { label: 'Membuka tangan' }),
      act({ type: 'resetWrist' }, .3),
      move(.8, { joints: { shoulder: 58, elbow: -98 } }, { label: 'Mendekati baut' }),
      act({ type: 'handPreset', preset: 'pinch' }, .7, { label: 'Mencubit kepala baut' }),
      ...fastenTurn('Putaran 1'), ...fastenTurn('Putaran 2'), ...fastenTurn('Putaran 3'),
      act({ type: 'handPreset', preset: 'open' }, .5, { label: 'Melepas' }),
      ...handHome(1),
    ],
  },
  {
    id: 'hand-wrist-range', mode: 'hand', name: 'Uji rentang pergelangan',
    detail: 'Pergelangan menekuk, miring, dan berputar sampai mendekati batasnya, lalu tangan menggenggam.',
    steps: [
      act({ type: 'handPreset', preset: 'open' }, .4, { label: 'Membuka tangan' }),
      act({ type: 'resetWrist' }, .3),
      move(.9, { joints: { shoulder: 62, elbow: -80 } }, { label: 'Mengangkat lengan' }),
      move(.9, { wrist: { pitch: 40 } }, { label: 'Tekuk ke telapak' }),
      move(1.2, { wrist: { pitch: -40 } }, { label: 'Tekuk ke punggung tangan' }),
      move(.7, { wrist: { pitch: 0 } }),
      move(.7, { wrist: { deviation: 18 } }, { label: 'Miring ke ibu jari' }),
      move(.9, { wrist: { deviation: -26 } }, { label: 'Miring ke kelingking' }),
      move(.6, { wrist: { deviation: 0 } }),
      move(1.6, { wrist: { roll: 180 } }, { sound: 'torque', label: 'Putar telapak' }),
      move(1.6, { wrist: { roll: 0 } }, { sound: 'torque' }),
      move(.8, { fingers: FIST, opposition: 40 }, { label: 'Menggenggam' }),
      move(.8, { fingers: OPEN_HAND, opposition: 0 }, { label: 'Membuka' }),
      ...handHome(1),
    ],
  },
];

/** Ambil kubus dari posisi awal dan taruh di baki, seperti sel robot pick-and-place. */
const PICK_AND_PLACE: Record<RobotMode, Motion> = {
  gripper: {
    id: 'gripper-pick-place', mode: 'gripper', name: 'Ambil dan taruh otomatis',
    detail: 'Robot mengambil kubus kuning dan menaruhnya di baki biru sendiri.',
    steps: [
      act({ type: 'open' }, .3, { label: 'Membuka capit' }),
      act({ type: 'resetCube' }, .4, { label: 'Menyiapkan kubus' }),
      move(.8, { joints: { shoulder: 55, elbow: -95 } }, { label: 'Naik ke ketinggian aman' }),
      move(1.2, { joints: { yaw: -135 } }, { label: 'Berputar ke kubus' }),
      move(.4, { joints: { elbow: -90 } }),
      move(1.1, { joints: { shoulder: 30 } }, { label: 'Turun ke kubus' }),
      act({ type: 'close' }, .55, { label: 'Menjepit kubus' }),
      move(1, { joints: { shoulder: 55 } }, { label: 'Mengangkat kubus' }),
      move(1.8, { joints: { yaw: -45 } }, { label: 'Berputar ke baki' }),
      move(.7, { joints: { shoulder: 42 } }, { label: 'Turun di atas baki' }),
      act({ type: 'open' }, .3, { label: 'Melepas kubus' }),
      { kind: 'settle', seconds: 2.5, label: 'Kubus mendarat' },
      move(.6, { joints: { shoulder: 55 } }),
      gripperHome(),
    ],
  },
  hand: {
    id: 'hand-pick-place', mode: 'hand', name: 'Ambil dan taruh otomatis',
    detail: 'Tangan menggenggam kubus kuning dan menaruhnya di baki biru sendiri.',
    steps: [
      act({ type: 'handPreset', preset: 'open' }, .4, { label: 'Membuka tangan' }),
      act({ type: 'resetWrist' }, .3),
      act({ type: 'resetCube' }, .4, { label: 'Menyiapkan kubus' }),
      move(.8, { joints: { shoulder: 55, elbow: -95 } }, { label: 'Naik ke ketinggian aman' }),
      move(1.2, { joints: { yaw: -130 } }, { label: 'Berputar ke kubus' }),
      move(.4, { joints: { elbow: -92 } }),
      move(1.1, { joints: { shoulder: 38 } }, { label: 'Turun ke kubus' }),
      act({ type: 'handPreset', preset: 'grasp' }, .8, { label: 'Menggenggam kubus' }),
      move(1, { joints: { shoulder: 55 } }, { label: 'Mengangkat kubus' }),
      move(1.8, { joints: { yaw: -45 } }, { label: 'Berputar ke baki' }),
      move(.7, { joints: { shoulder: 46 } }, { label: 'Turun di atas baki' }),
      act({ type: 'handPreset', preset: 'open' }, .4, { label: 'Melepas kubus' }),
      { kind: 'settle', seconds: 2.5, label: 'Kubus mendarat' },
      move(.6, { joints: { shoulder: 55 } }),
      ...handHome(),
    ],
  },
};

export function motionsFor(mode: RobotMode) { return mode === 'hand' ? HAND_MOTIONS : GRIPPER_MOTIONS; }
export function pickAndPlaceFor(mode: RobotMode) { return PICK_AND_PLACE[mode]; }
export function findMotion(id: string) {
  return [...GRIPPER_MOTIONS, ...HAND_MOTIONS, PICK_AND_PLACE.gripper, PICK_AND_PLACE.hand].find(motion => motion.id === id);
}

export type Playback = { motion: Motion; index: number; elapsed: number; from: Pose | null };
export function startPlayback(motion: Motion): Playback { return { motion, index: 0, elapsed: 0, from: null }; }

// Profil kecepatan S: mulai dan berhenti halus seperti pengendali servo sungguhan.
const ease = (t: number) => t * t * t * (t * (6 * t - 15) + 10);

function capture(step: Pose, state: GameState): Pose {
  const from: Pose = {};
  if (step.joints) from.joints = { ...state.joints };
  if (step.wrist) from.wrist = { ...state.wrist };
  if (step.fingers) from.fingers = { ...state.fingers };
  if (step.opposition !== undefined) from.opposition = state.opposition;
  return from;
}

export type Advance = { playback: Playback | null; actions: Action[]; sounds: MotionSound[] };
/** Memajukan program sejauh `dt` detik dan mengembalikan aksi permainan untuk bingkai ini. */
export function advancePlayback(playback: Playback, state: GameState, dt: number): Advance {
  const { motion } = playback;
  const step = motion.steps[playback.index];
  const actions: Action[] = [];
  const sounds: MotionSound[] = [];
  if (!step) return { playback: null, actions, sounds };
  let from = playback.from;
  if (!from) {
    if (playback.index === 0) sounds.push('motionStart');
    if (step.kind !== 'settle' && step.sound) sounds.push(step.sound);
    if (step.kind === 'do') actions.push(step.action);
    from = step.kind === 'move' ? capture(step, state) : {};
  }
  const elapsed = playback.elapsed + Math.max(0, dt);
  const progress = Math.min(1, elapsed / Math.max(step.seconds, 1e-3));
  let finished = progress >= 1;
  if (step.kind === 'move') {
    const t = ease(progress);
    const at = (a: number, b: number) => progress >= 1 ? b : a + (b - a) * t;
    for (const key of Object.keys(step.joints ?? {}) as Joint[]) {
      actions.push({ type: 'joint', key, value: at(from.joints![key]!, step.joints![key]!) });
    }
    for (const key of Object.keys(step.wrist ?? {}) as WristAxis[]) {
      actions.push({ type: 'wrist', key, value: at(from.wrist![key]!, step.wrist![key]!) });
    }
    for (const key of FINGERS) {
      const target = step.fingers?.[key];
      if (target !== undefined) actions.push({ type: 'finger', key, value: at(from.fingers![key]!, target) });
    }
    if (step.opposition !== undefined) actions.push({ type: 'opposition', value: at(from.opposition!, step.opposition) });
  } else if (step.kind === 'settle') {
    finished = finished || (elapsed > .2 && state.cube.mode !== 'falling');
  }
  if (!finished) return { playback: { motion, index: playback.index, elapsed, from }, actions, sounds };
  const index = playback.index + 1;
  if (index >= motion.steps.length) {
    sounds.push('motionEnd');
    return { playback: null, actions, sounds };
  }
  return { playback: { motion, index, elapsed: 0, from: null }, actions, sounds };
}

