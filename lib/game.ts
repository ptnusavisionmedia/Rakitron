export type Vec3 = [number, number, number];
export type RobotMode = 'gripper' | 'hand';
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'] as const;
export type Finger = typeof FINGERS[number];
export type FingerAngles = Record<Finger, number>;
export type HandPreset = 'open' | 'grasp' | 'pinch' | 'point';
export const HAND_PRESETS = {
  open:  { fingers: { thumb: 0,  index: 0,  middle: 0,  ring: 0,  little: 0 },  opposition: 0 },
  grasp: { fingers: { thumb: 72, index: 76, middle: 83, ring: 86, little: 88 }, opposition: 72 },
  pinch: { fingers: { thumb: 66, index: 55, middle: 10, ring: 15, little: 20 }, opposition: 88 },
  point: { fingers: { thumb: 28, index: 0,  middle: 85, ring: 88, little: 90 }, opposition: 30 },
} as const satisfies Record<HandPreset, { fingers: FingerAngles; opposition: number }>;

export type Joint = 'yaw' | 'shoulder' | 'elbow';
export type Joints = Record<Joint, number>;
export type Cube = { position: Vec3; yaw: number; mode: 'rest' | 'held' | 'falling'; speed: number };

const part = (id: string, name: string, short: string, description: string) => ({
  id, name, short, description, thumb: '/parts/' + id + '.svg',
});
export const PARTS = [
  part('base', 'Alas putar', 'Alas', 'Piringan alas memutar seluruh lengan ke kiri dan kanan.'),
  part('shoulder', 'Modul bahu', 'Bahu', 'Garpu bahu menyangga lengan atas pada poros jingganya.'),
  part('upper-arm', 'Lengan atas', 'Lengan atas', 'Bagian ini mengangkat lengan ketika poros bahu berputar.'),
  part('elbow', 'Modul siku', 'Siku', 'Engsel siku membuat ujung lengan dapat menekuk.'),
  part('forearm', 'Lengan bawah', 'Lengan bawah', 'Soket berbentuk D menghubungkan lengan bawah dengan poros siku.'),
  part('gripper', 'Capit paralel', 'Capit', 'Dua rahangnya bergeser bersamaan untuk menjepit kubus.'),
];

const HAND_PARTS = [
  ...PARTS.slice(0, -1),
  part('hand', 'Tangan lima jari', 'Tangan', 'Lima jari beruas dan ibu jari yang bisa berhadapan dengan telunjuk untuk mencubit atau menggenggam.'),
];

export function partsFor(mode: RobotMode) {
  return mode === 'hand' ? HAND_PARTS : PARTS;
}

export const JOINT_LIMITS: Record<Joint, { min: number; max: number; requires: number }> = {
  yaw: { min: -170, max: 170, requires: 1 },
  shoulder: { min: 0, max: 95, requires: 3 },
  elbow: { min: -135, max: -5, requires: 5 },
};
export const OPEN_GAP = 0.45;
export const CUBE_SIZE = 0.30;
export const DEFAULT_JOINTS: Joints = { yaw: -95, shoulder: 55, elbow: -95 };
const DEG = Math.PI / 180;
const HALF_CUBE = CUBE_SIZE / 2;
const GRIP_DEPTH: Record<RobotMode, number> = { gripper: 0.36, hand: 0.54 };
const initialRotation = [0, 0, 270, 0, 270, 0];
export const SNAP_DISTANCE = 0.28;

export function turnsToAlign(rotation: number) {
  return ((360 - rotation) % 360) / 90;
}

function rotatedPoint(yaw: number, radius: number, height: number): Vec3 {
  return [radius * Math.cos(yaw), height, -radius * Math.sin(yaw)];
}

export function getPose(joints: Joints, mode: RobotMode = 'gripper') {
  const yaw = joints.yaw * DEG;
  const upperAngle = joints.shoulder * DEG;
  const lowerAngle = (joints.shoulder + joints.elbow) * DEG;
  const upperRadius = 1.35 * Math.cos(upperAngle);
  const upperHeight = 0.78 + 1.35 * Math.sin(upperAngle);
  const radius = upperRadius + 1.10 * Math.cos(lowerAngle);
  const height = upperHeight + 1.10 * Math.sin(lowerAngle);
  return {
    elbow: rotatedPoint(yaw, upperRadius, upperHeight),
    wrist: rotatedPoint(yaw, radius, height),
    grip: rotatedPoint(yaw, radius, height - GRIP_DEPTH[mode]),
  };
}

const pickup = getPose({ yaw: -135, shoulder: 30, elbow: -90 }).grip;
const delivery = getPose({ yaw: -45, shoulder: 30, elbow: -90 }).grip;
export const CUBE_START: Vec3 = [pickup[0], HALF_CUBE, pickup[2]];
export const TRAY = { x: delivery[0], z: delivery[2], y: 0.045, width: 0.76, depth: 0.69, yaw: -45 };

function newCube(): Cube {
  return { position: [...CUBE_START], yaw: -135, mode: 'rest', speed: 0 };
}

export type GameState = {
  robotMode: RobotMode;
  fingers: FingerAngles;
  opposition: number;
  count: number;
  selected: number | null;
  rotation: number;
  joints: Joints;
  gap: number;
  cube: Cube;
  won: boolean;
  hint: string;
  highlight: Joint | 'grip' | null;
};

export function initialState(robotMode: RobotMode = 'gripper'): GameState {
  return {
    robotMode, fingers: { ...HAND_PRESETS.open.fingers }, opposition: 0,
    count: 0, selected: null, rotation: 0, joints: { ...DEFAULT_JOINTS }, gap: OPEN_GAP,
    cube: newCube(), won: false, hint: 'Pilih alas putar dari laci komponen.', highlight: null,
  };
}

function localXZ(deltaX: number, deltaZ: number, yawDegrees: number) {
  const angle = yawDegrees * DEG;
  return [deltaX * Math.cos(angle) - deltaZ * Math.sin(angle), deltaX * Math.sin(angle) + deltaZ * Math.cos(angle)];
}

function halfExtent(relativeYaw: number) {
  const a = relativeYaw * DEG;
  return HALF_CUBE * (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)));
}

// A cube crossing the rim does not count as a delivery.
export function fitsTray(cube: Cube) {
  const [x, z] = localXZ(cube.position[0] - TRAY.x, cube.position[2] - TRAY.z, TRAY.yaw);
  const half = halfExtent(cube.yaw - TRAY.yaw);
  return Math.abs(x) + half <= TRAY.width / 2 && Math.abs(z) + half <= TRAY.depth / 2;
}

function landingHeight(cube: Cube) {
  if (fitsTray(cube)) return TRAY.y + HALF_CUBE;
  const [x, z] = localXZ(cube.position[0] - TRAY.x, cube.position[2] - TRAY.z, TRAY.yaw);
  const half = halfExtent(cube.yaw - TRAY.yaw);
  const onRim = Math.abs(x) - half < TRAY.width / 2 + 0.035 && Math.abs(z) - half < TRAY.depth / 2 + 0.035;
  return HALF_CUBE + (onRim ? TRAY.y + 0.095 : 0);
}

function assemblyHint(mode: RobotMode, count: number, selected: number | null = null, rotation = 0) {
  const parts = partsFor(mode);
  if (selected !== null) {
    const turns = turnsToAlign(rotation);
    if (turns > 0) return `Tekan Putar 90° ${turns} kali agar ${parts[selected].name.toLowerCase()} sejajar dengan soket.`;
    return 'Sudah sejajar. Ketuk soket atau tekan Pasang komponen.';
  }
  if (count < parts.length) return 'Pilih ' + parts[count].name.toLowerCase() + ' dari laci komponen.';
  return mode === 'hand' ? 'Dekatkan telapak terbuka ke kubus kuning, lalu genggam.' : 'Arahkan capit terbuka ke kubus kuning.';
}

// The finger pads surround a 0.30-unit cube in the wrist's horizontal frame.
function insideHandSpan(grip: Vec3, cube: Cube, wristYaw: number) {
  const [x, z] = localXZ(cube.position[0] - grip[0], cube.position[2] - grip[2], wristYaw);
  const half = halfExtent(cube.yaw - wristYaw);
  return Math.abs(x) + half <= 0.42 && Math.abs(z) + half <= 0.40;
}

function jointHint(state: GameState, joints: Joints) {
  if (state.count < PARTS.length) return assemblyHint(state.robotMode, state.count, state.selected, state.rotation);
  if (state.cube.mode === 'falling') return 'Perhatikan tempat kubus mendarat.';
  const hand = state.robotMode === 'hand';
  const grip = getPose(joints, state.robotMode).grip;
  if (state.cube.mode === 'held') {
    if (Math.hypot(grip[0] - TRAY.x, grip[2] - TRAY.z) < 0.16) return hand ? 'Buka tangan untuk menjatuhkan kubus ke baki.' : 'Buka capit untuk menjatuhkan kubus ke baki.';
    return 'Angkat kubus, lalu putar alas ke arah baki biru.';
  }
  if (state.won) return 'Berhasil! Kubus sudah berada di dalam baki.';
  const [cx, cy, cz] = state.cube.position;
  const targetYaw = Math.atan2(-cz, cx) / DEG;
  if (Math.abs(targetYaw - joints.yaw) > 5) return hand ? 'Putar alas sampai telapak menghadap kubus.' : 'Putar alas sampai kedua rahang menghadap kubus.';
  if (hand) {
    if (!insideHandSpan(grip, state.cube, joints.yaw)) return 'Atur siku dan bahu hingga telapak berada di atas kubus.';
    if (Math.abs(grip[1] - cy) > 0.20) return grip[1] > cy ? 'Turunkan telapak sampai kubus berada di antara jari.' : 'Angkat telapak sedikit agar kubus berada di antara jari.';
    return fingersOppose(state.fingers, state.opposition) ? 'Buka tangan, lalu genggam kembali di sekeliling kubus.' : 'Kubus berada di antara jari. Pilih Genggam atau Cubit.';
  }
  if (Math.hypot(grip[0]-cx, grip[2]-cz) > 0.30) return 'Tekuk siku dan atur bahu hingga capit tepat di atas kubus.';
  if (Math.abs(grip[1] - cy) > 0.22) return grip[1] > cy ? 'Turunkan lengan sampai kubus berada di antara kedua rahang.' : 'Angkat lengan sedikit agar rahang sejajar dengan kubus.';
  return state.gap < OPEN_GAP ? 'Buka capit sebelum mencoba menjepit lagi.' : 'Kubus sudah di antara rahang. Tekan Tutup capit.';
}

function moveJoint(state: GameState, key: Joint, value: number): GameState {
  const limit = JOINT_LIMITS[key];
  if (!limit || state.count < limit.requires || !Number.isFinite(value)) return state;
  const target = Math.max(limit.min, Math.min(limit.max, value));
  const joints = { ...state.joints };
  const from = joints[key];
  const steps = Math.max(1, Math.ceil(Math.abs(target - from)));
  let blocked = false;
  const handInstalled = state.robotMode === 'hand' && state.count === HAND_PARTS.length;
  const clearance = handInstalled ? HALF_CUBE : 0.075;
  // Sweep the requested change so pointer jumps cannot move the arm through the table.
  for (let i = 1; i <= steps; i++) {
    const angle = from + (target - from) * i / steps;
    const candidate = { ...joints, [key]: angle };
    if (state.count >= 5) {
      const pose = getPose(candidate, state.robotMode);
      const carried = state.cube.mode === 'held';
      const minHeight = carried ? landingHeight({ ...state.cube, position: pose.grip, yaw: candidate.yaw }) - 0.009 : clearance;
      if ((state.count === 6 ? pose.grip[1] : pose.wrist[1]) < minHeight || pose.wrist[1] < 0.08) {
        blocked = true;
        break;
      }
    }
    joints[key] = angle;
  }
  let cube = state.cube;
  if (cube.mode === 'held') {
    const p = getPose(joints, state.robotMode).grip;
    cube = { ...cube, position: [p[0], Math.max(HALF_CUBE, p[1]), p[2]], yaw: joints.yaw };
  }
  return { ...state, joints, cube, highlight: key, hint: blocked ? (state.robotMode === 'hand' ? 'Angkat lengan sedikit agar jari melewati permukaan.' : 'Angkat lengan sedikit agar capit melewati permukaan.') : jointHint(state, joints) };
}

function closeGripper(state: GameState): GameState {
  if (state.count !== PARTS.length || state.cube.mode === 'held') return state;
  const grip = getPose(state.joints).grip;
  const {position: p} = state.cube;
  const [x, z] = localXZ(p[0] - grip[0], p[2] - grip[2], state.joints.yaw);
  const half = halfExtent(state.cube.yaw - state.joints.yaw);
  const withinPads = Math.abs(p[1] - grip[1]) <= 0.22 && Math.abs(x) <= 0.28;
  if (state.cube.mode === 'rest' && withinPads && Math.abs(z) + half <= state.gap / 2 + 0.12) {
    return {
      ...state, cube: { ...state.cube, mode: 'held', yaw: state.joints.yaw,
        position: [grip[0], Math.max(grip[1], HALF_CUBE), grip[2]] },
      gap: CUBE_SIZE, highlight: 'grip', hint: 'Kubus terjepit! Angkat lengan dan putar ke arah baki biru.',
    };
  }
  return { ...state, gap: 0, highlight: 'grip', hint: 'Buka capit dan letakkan kubus di antara kedua penjepit.' };
}

function fingersOppose(fingers: FingerAngles, opposition: number) {
  const supportsThumb = fingers.index >= 55 || (fingers.middle >= 55 && fingers.ring >= 55);
  return opposition >= 48 && fingers.thumb >= 52 && supportsThumb;
}

function poseHand(state: GameState, fingers: FingerAngles, opposition: number): GameState {
  if (state.robotMode !== 'hand' || state.count !== HAND_PARTS.length) return state;
  const next = { ...state, fingers, opposition, highlight: 'grip' as const };
  const closed = fingersOppose(fingers, opposition);
  if (state.cube.mode === 'held' && !closed) {
    return { ...next, cube: { ...state.cube, mode: 'falling', speed: 0 }, hint: 'Perhatikan tempat kubus mendarat.' };
  }
  // Contact starts when the thumb closes against another finger around a resting cube.
  if (closed && !fingersOppose(state.fingers, state.opposition) && state.cube.mode === 'rest') {
    const grip = getPose(state.joints, 'hand').grip;
    if (Math.abs(state.cube.position[1] - grip[1]) <= 0.20 && insideHandSpan(grip, state.cube, state.joints.yaw)) {
      return { ...next, won: false, cube: { ...state.cube, mode: 'held', yaw: state.joints.yaw,
        position: [grip[0], Math.max(HALF_CUBE, grip[1]), grip[2]] },
        hint: 'Kubus terpegang. Angkat lengan, lalu putar alas menuju baki biru.' };
    }
  }
  return { ...next, hint: jointHint(next, state.joints) };
}

function applyHandPreset(state: GameState, preset: HandPreset) {
  const pose = HAND_PRESETS[preset];
  return poseHand(state, { ...pose.fingers }, pose.opposition);
}

export type Action =
  | { type: 'robotMode'; mode: RobotMode }
  | { type: 'finger'; key: Finger; value: number }
  | { type: 'opposition'; value: number }
  | { type: 'handPreset'; preset: HandPreset }
  | { type: 'select'; index: number }
  | { type: 'place'; distance: number; partIndex?: number }
  | { type: 'joint'; key: Joint; value: number }
  | { type: 'tick'; dt: number }
  | { type: 'tryHand' | 'rotate' | 'undo' | 'open' | 'close' | 'resetCube' | 'restart' };

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'tryHand':
      if (state.robotMode !== 'hand' || state.count === HAND_PARTS.length) return state;
      return { ...initialState('hand'), count: HAND_PARTS.length, hint: assemblyHint('hand', HAND_PARTS.length) };
    case 'robotMode': {
      if (state.robotMode === action.mode) return state;
      const toolIndex = PARTS.length - 1;
      const count = Math.min(state.count, toolIndex);
      const selected = state.selected === toolIndex ? null : state.selected;
      const rotation = selected === null ? 0 : state.rotation;
      return { ...state, robotMode: action.mode, count, selected, rotation,
        fingers: { ...HAND_PRESETS.open.fingers }, opposition: 0, gap: OPEN_GAP, highlight: null, won: false,
        cube: state.cube.mode === 'held' ? { ...state.cube, mode: 'falling', speed: 0 } : state.cube,
        hint: assemblyHint(action.mode, count, selected, rotation) };
    }
    case 'finger':
      if (!FINGERS.includes(action.key) || !Number.isFinite(action.value)) return state;
      return poseHand(state, { ...state.fingers, [action.key]: Math.max(0, Math.min(90, action.value)) }, state.opposition);
    case 'opposition':
      if (!Number.isFinite(action.value)) return state;
      return poseHand(state, state.fingers, Math.max(0, Math.min(90, action.value)));
    case 'handPreset': return applyHandPreset(state, action.preset);
    case 'select': {
      if (action.index !== state.count || action.index < 0 || action.index >= PARTS.length) {
        return { ...state, hint: assemblyHint(state.robotMode, state.count, state.selected, state.rotation) };
      }
      if (state.selected === action.index) return state;
      const rotation = initialRotation[action.index];
      return { ...state, selected: action.index, rotation, highlight: null,
        hint: assemblyHint(state.robotMode, state.count, action.index, rotation) };
    }
    case 'rotate': {
      if (state.selected === null) return state;
      const rotation = (state.rotation + 90) % 360;
      return { ...state, rotation, hint: assemblyHint(state.robotMode, state.count, state.selected, rotation) };
    }
    case 'place': {
      if (state.selected === null || state.selected !== state.count || (action.partIndex !== undefined && action.partIndex !== state.selected)) return state;
      if (!Number.isFinite(action.distance) || action.distance < 0 || action.distance > SNAP_DISTANCE) {
        return { ...state, hint: 'Dekatkan komponen ke soket yang disorot.' };
      }
      if (state.rotation !== 0) return { ...state, hint: assemblyHint(state.robotMode, state.count, state.selected, state.rotation) };
      const count = state.count + 1;
      if (count >= 5) {
        const pose = getPose(state.joints, state.robotMode);
        const lowestPoint = count === 5 ? pose.wrist[1] : pose.grip[1];
        if (lowestPoint < (state.robotMode === 'hand' && count === 6 ? HALF_CUBE : 0.08)) {
          return { ...state, hint: 'Di Uji gerak, naikkan Sudut bahu agar komponen muat di atas meja. Kembali ke Perakitan untuk memasangnya.' };
        }
      }
      return { ...state, count, selected: null, rotation: 0, highlight: null, hint: assemblyHint(state.robotMode, count) };
    }
    case 'undo': {
      if (!state.count) return { ...state, selected: null, rotation: 0, hint: assemblyHint(state.robotMode, 0) };
      const count = state.count - 1;
      return { ...state, count, selected: null, rotation: 0, won: false, gap: OPEN_GAP, fingers: { ...HAND_PRESETS.open.fingers }, opposition: 0, highlight: null,
        cube: state.cube.mode === 'held' ? { ...state.cube, mode: 'falling', speed: 0 } : state.cube,
        hint: assemblyHint(state.robotMode, count) };
    }
    case 'joint': return moveJoint(state, action.key, action.value);
    case 'close': return state.robotMode === 'hand' ? applyHandPreset(state, 'grasp') : closeGripper(state);
    case 'open': {
      if (state.robotMode === 'hand') return applyHandPreset(state, 'open');
      if (state.count < 6) return state;
      const held = state.cube.mode === 'held';
      return { ...state, gap: OPEN_GAP, highlight: 'grip',
        cube: held ? { ...state.cube, mode: 'falling', speed: 0 } : state.cube,
        hint: held ? 'Perhatikan tempat kubus mendarat.' : 'Arahkan capit terbuka ke kubus kuning.' };
    }
    case 'tick': {
      if (state.cube.mode !== 'falling' || !Number.isFinite(action.dt) || action.dt <= 0) return state;
      const dt = Math.min(action.dt, 0.06);
      const speed = state.cube.speed + 9.8 * dt;
      const y = state.cube.position[1] - speed * dt;
      const floor = landingHeight(state.cube);
      const settled = y <= floor;
      const cube: Cube = { ...state.cube, speed: settled ? 0 : speed, mode: settled ? 'rest' : 'falling',
        position: [state.cube.position[0], Math.max(floor, y), state.cube.position[2]] };
      if (!settled) return { ...state, cube };
      const won = state.count === 6 && fitsTray(cube);
      return { ...state, cube, won, hint: won ? 'Berhasil! Robot rakitanmu memindahkan kubus.' :
        state.count === 6 ? (state.robotMode === 'hand' ? 'Kubus ada di luar baki. Genggam kembali atau kembalikan kubus.' : 'Kubus ada di luar baki. Jepit lagi atau kembalikan kubus.') : assemblyHint(state.robotMode, state.count, state.selected, state.rotation) };
    }
    case 'resetCube':
      return { ...state, cube: newCube(), won: false, gap: OPEN_GAP, fingers: { ...HAND_PRESETS.open.fingers }, opposition: 0, highlight: null, hint: assemblyHint(state.robotMode, state.count, state.selected, state.rotation) };
    case 'restart': return initialState(state.robotMode);
  }
}