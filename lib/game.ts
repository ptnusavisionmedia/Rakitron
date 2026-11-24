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
  point: { fingers: { thumb: 82, index: 0,  middle: 85, ring: 88, little: 90 }, opposition: 24 },
} as const satisfies Record<HandPreset, { fingers: FingerAngles; opposition: number }>;

export type Joint = 'yaw' | 'shoulder' | 'elbow';
export type Joints = Record<Joint, number>;
export type WristAxis = 'pitch' | 'deviation' | 'roll';
export type WristAngles = Record<WristAxis, number>;
export const WRIST_LIMITS: Record<WristAxis, { min: number; max: number }> = {
  pitch: { min: -65, max: 75 }, deviation: { min: -30, max: 20 }, roll: { min: -90, max: 90 },
};
export const NEUTRAL_WRIST: WristAngles = { pitch: 0, deviation: 0, roll: 0 };
export type Quaternion = [number, number, number, number];
export type Cube = {
  position: Vec3; orientation: Quaternion; yaw: number; mode: 'rest' | 'held' | 'falling'; speed: number;
  handContact?: { offset: Vec3; orientation: Quaternion };
};

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

function product(a: Quaternion, b: Quaternion): Quaternion {
  const [x,y,z,w] = a, [i,j,k,r] = b;
  return [w*i+x*r+y*k-z*j, w*j-x*k+y*r+z*i, w*k+x*j-y*i+z*r, w*r-x*i-y*j-z*k];
}

function inverse([x,y,z,w]: Quaternion): Quaternion { return [-x,-y,-z,w]; }

// Ry(baseYaw + roll) × Rz(deviation) × Rx(-pitch), centered on the hand's mounting pin.
export function wristQuaternion(wrist: WristAngles, baseYaw = 0): Quaternion {
  const x = -wrist.pitch*DEG/2, y = (baseYaw + wrist.roll)*DEG/2, z = wrist.deviation*DEG/2;
  return product(product([0, Math.sin(y), 0, Math.cos(y)], [0, 0, Math.sin(z), Math.cos(z)]),
    [Math.sin(x), 0, 0, Math.cos(x)]);
}

function rotateVector([x,y,z]: Vec3, q: Quaternion): Vec3 {
  // For a unit quaternion, v' = v + w*t + q.xyz × t, with t = 2(q.xyz × v).
  const [i,j,k,w] = q;
  const tx = 2*(j*z-k*y), ty = 2*(k*x-i*z), tz = 2*(i*y-j*x);
  return [x+w*tx+j*tz-k*ty, y+w*ty+k*tx-i*tz, z+w*tz+i*ty-j*tx];
}

function add(a: Vec3, b: Vec3): Vec3 { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function difference(a: Vec3, b: Vec3): Vec3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }

export function getPose(joints: Joints, mode: RobotMode = 'gripper', wristAngles: WristAngles = NEUTRAL_WRIST) {
  const yaw = joints.yaw * DEG;
  const upperAngle = joints.shoulder * DEG;
  const lowerAngle = (joints.shoulder + joints.elbow) * DEG;
  const upperRadius = 1.35 * Math.cos(upperAngle);
  const upperHeight = 0.78 + 1.35 * Math.sin(upperAngle);
  const radius = upperRadius + 1.10 * Math.cos(lowerAngle);
  const height = upperHeight + 1.10 * Math.sin(lowerAngle);
  const wrist = rotatedPoint(yaw, radius, height);
  const orientation = wristQuaternion(mode === 'hand' ? wristAngles : NEUTRAL_WRIST, joints.yaw);
  return {
    elbow: rotatedPoint(yaw, upperRadius, upperHeight), wrist, orientation,
    grip: add(wrist, rotateVector([0,-GRIP_DEPTH[mode],0], orientation)),
  };
}

const pickup = getPose({ yaw: -135, shoulder: 30, elbow: -90 }).grip;
const delivery = getPose({ yaw: -45, shoulder: 30, elbow: -90 }).grip;
export const CUBE_START: Vec3 = [pickup[0], HALF_CUBE, pickup[2]];
export const TRAY = { x: delivery[0], z: delivery[2], y: 0.045, width: 0.76, depth: 0.69, yaw: -45 };

function newCube(): Cube {
  return { position: [...CUBE_START], orientation: wristQuaternion(NEUTRAL_WRIST, -135), yaw: -135, mode: 'rest', speed: 0 };
}

export type GameState = {
  robotMode: RobotMode;
  fingers: FingerAngles;
  wrist: WristAngles;
  opposition: number;
  count: number;
  selected: number | null;
  rotation: number;
  joints: Joints;
  gap: number;
  cube: Cube;
  won: boolean;
  hint: string;
  highlight: Joint | 'grip' | 'wrist' | null;
};

export function initialState(robotMode: RobotMode = 'gripper'): GameState {
  return {
    robotMode, fingers: { ...HAND_PRESETS.open.fingers }, wrist: { ...NEUTRAL_WRIST }, opposition: 0,
    count: 0, selected: null, rotation: 0, joints: { ...DEFAULT_JOINTS }, gap: OPEN_GAP,
    cube: newCube(), won: false, hint: 'Pilih alas putar dari laci komponen.', highlight: null,
  };
}

function localXZ(deltaX: number, deltaZ: number, yawDegrees: number) {
  const angle = yawDegrees * DEG;
  return [deltaX * Math.cos(angle) - deltaZ * Math.sin(angle), deltaX * Math.sin(angle) + deltaZ * Math.cos(angle)];
}

// Project the three edge vectors onto the destination frame; tilted cubes are wider on some axes.
function cubeExtents(orientation: Quaternion): Vec3 {
  const x = rotateVector([HALF_CUBE,0,0], orientation);
  const y = rotateVector([0,HALF_CUBE,0], orientation);
  const z = rotateVector([0,0,HALF_CUBE], orientation);
  return [0,1,2].map(i => Math.abs(x[i]) + Math.abs(y[i]) + Math.abs(z[i])) as Vec3;
}

const trayFrame = inverse(wristQuaternion(NEUTRAL_WRIST, TRAY.yaw));

function trayFootprint(cube: Cube) {
  const [x,z] = localXZ(cube.position[0] - TRAY.x, cube.position[2] - TRAY.z, TRAY.yaw);
  const [halfX,halfY,halfZ] = cubeExtents(product(trayFrame, cube.orientation));
  const inside = Math.abs(x) + halfX <= TRAY.width/2 && Math.abs(z) + halfZ <= TRAY.depth/2;
  const aboveRim = Math.abs(x) - halfX < TRAY.width/2 + 0.035 && Math.abs(z) - halfZ < TRAY.depth/2 + 0.035;
  return { inside, aboveRim, halfY };
}

export function fitsTray(cube: Cube) { return trayFootprint(cube).inside; }

function landingHeight(cube: Cube) {
  const { inside, aboveRim, halfY } = trayFootprint(cube);
  return halfY + (inside ? TRAY.y : aboveRim ? TRAY.y + 0.095 : 0);
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

type ToolPose = ReturnType<typeof getPose>;

function inHand(orientation: Quaternion, grip: Vec3, cube: Cube) {
  const localFrame = inverse(orientation);
  const offset = rotateVector(difference(cube.position, grip), localFrame);
  const relative = product(localFrame, cube.orientation);
  const [halfX,,halfZ] = cubeExtents(relative);
  // Center the cube between the opposed pads and leave room for its rotated side faces.
  const betweenPads = Math.abs(offset[0]) + halfX <= .22 && Math.abs(offset[2]) + halfZ <= .20;
  const alignedHeight = Math.abs(offset[1]) <= .06;
  return { offset, orientation: relative, betweenPads, alignedHeight };
}

function jointHint(state: GameState, joints: Joints) {
  if (state.count < PARTS.length) return assemblyHint(state.robotMode, state.count, state.selected, state.rotation);
  if (state.cube.mode === 'falling') return 'Perhatikan tempat kubus mendarat.';
  const hand = state.robotMode === 'hand';
  const pose = getPose(joints, state.robotMode, state.wrist);
  const grip = pose.grip;
  if (state.cube.mode === 'held') {
    if (Math.hypot(grip[0] - TRAY.x, grip[2] - TRAY.z) < 0.16) return hand ? 'Buka tangan untuk menjatuhkan kubus ke baki.' : 'Buka capit untuk menjatuhkan kubus ke baki.';
    return 'Angkat kubus, lalu putar alas ke arah baki biru.';
  }
  if (state.won) return 'Berhasil! Kubus sudah berada di dalam baki.';
  const [cx, cy, cz] = state.cube.position;
  const targetYaw = Math.atan2(-cz, cx) / DEG;
  if (hand) {
    const contact = inHand(pose.orientation, grip, state.cube);
    if (!contact.betweenPads) return 'Sejajarkan telapak dengan sisi kubus menggunakan lengan dan pergelangan.';
    if (!contact.alignedHeight) return grip[1] > cy ? 'Turunkan telapak sampai kubus berada di antara jari.' : 'Angkat telapak sedikit agar kubus berada di antara jari.';
    return fingersOppose(state.fingers, state.opposition) ? 'Buka tangan, lalu genggam kembali di sekeliling kubus.' : 'Kubus berada di antara jari. Pilih Genggam atau Cubit.';
  }
  if (Math.abs(targetYaw - joints.yaw) > 5) return 'Putar alas sampai kedua rahang menghadap kubus.';
  if (Math.hypot(grip[0]-cx, grip[2]-cz) > 0.30) return 'Tekuk siku dan atur bahu hingga capit tepat di atas kubus.';
  if (Math.abs(grip[1] - cy) > 0.22) return grip[1] > cy ? 'Turunkan lengan sampai kubus berada di antara kedua rahang.' : 'Angkat lengan sedikit agar rahang sejajar dengan kubus.';
  return state.gap < OPEN_GAP ? 'Buka capit sebelum mencoba menjepit lagi.' : 'Kubus sudah di antara rahang. Tekan Tutup capit.';
}

// Outer contact points of the wrist, palm, extended digits and thumb in the hand's local frame.
// Include both faces and poses so opening a finger cannot push it through the tabletop.
const handEnvelope: Vec3[] = [
  [0,0,-.14], [0,0,.14], [-.18,-.35,-.24], [.18,-.35,-.24],
  [-.18,-.35,.12], [.18,-.35,.12], [-.17,-.59,-.24], [.16,-.65,-.24],
  [-.077,-.66,-.24], [-.077,-.66,-.21], [.05,-.686,-.24], [-.14,-.58,.10], [.13,-.60,.12],
  [.51,-.50,.14], [.20,-.52,.21],
];

function carriedCube(cube: Cube, pose: ToolPose, yaw: number): Cube {
  if (cube.mode !== 'held') return cube;
  if (cube.handContact) {
    const orientation = product(pose.orientation, cube.handContact.orientation);
    const heading = rotateVector([1,0,0], orientation);
    return { ...cube, position: add(pose.grip, rotateVector(cube.handContact.offset, pose.orientation)),
      orientation, yaw: Math.atan2(-heading[2], heading[0])/DEG };
  }
  return { ...cube, position: [pose.grip[0], Math.max(HALF_CUBE,pose.grip[1]), pose.grip[2]], yaw,
    orientation: pose.orientation };
}

function toolClearance(count: number, hand: boolean, pose: ToolPose) {
  if (count < 5) return Infinity;
  let clearance = pose.wrist[1] - .08;
  if (count < 6) return clearance;
  if (!hand) return Math.min(clearance, pose.grip[1] - .075);
  for (const point of handEnvelope) {
    clearance = Math.min(clearance, pose.wrist[1] + rotateVector(point,pose.orientation)[1]);
  }
  return clearance;
}

function movePose(state: GameState, targetJoints: Joints, targetWrist: WristAngles, highlight: Joint | 'wrist'): GameState {
  const maxDelta = Math.max(
    Math.abs(targetJoints.yaw - state.joints.yaw), Math.abs(targetJoints.shoulder - state.joints.shoulder),
    Math.abs(targetJoints.elbow - state.joints.elbow), Math.abs(targetWrist.pitch - state.wrist.pitch),
    Math.abs(targetWrist.deviation - state.wrist.deviation), Math.abs(targetWrist.roll - state.wrist.roll),
  );
  const steps = Math.max(1,Math.ceil(maxDelta));
  let joints = state.joints;
  let wrist = state.wrist;
  let cube = state.cube;
  let blocked = false;
  // Check each degree, including a simultaneous return of all three wrist axes to neutral.
  for (let i=1;i<=steps;i++) {
    const at = (from: number, to: number) => i === steps ? to : from+(to-from)*i/steps;
    const nextJoints = targetJoints === state.joints ? state.joints : {
      yaw: at(state.joints.yaw,targetJoints.yaw), shoulder: at(state.joints.shoulder,targetJoints.shoulder),
      elbow: at(state.joints.elbow,targetJoints.elbow),
    };
    const nextWrist = targetWrist === state.wrist ? state.wrist : {
      pitch: at(state.wrist.pitch,targetWrist.pitch), deviation: at(state.wrist.deviation,targetWrist.deviation),
      roll: at(state.wrist.roll,targetWrist.roll),
    };
    const pose = getPose(nextJoints,state.robotMode,nextWrist);
    const moved = carriedCube(state.cube,pose,nextJoints.yaw);
    const hand = state.robotMode === 'hand';
    let clearance = toolClearance(state.count, hand, pose);
    if (moved.mode === 'held') {
      // The parallel gripper's original pads allow the grip center just below the supported cube.
      const centerHeight = hand ? moved.position[1] : pose.grip[1] + .009;
      clearance = Math.min(clearance, centerHeight - landingHeight(moved));
    }
    if (clearance < -1e-8) {
      blocked = true;
      break;
    }
    joints = nextJoints;
    wrist = nextWrist;
    cube = moved;
  }
  const next = { ...state, joints, wrist, cube, highlight };
  return { ...next, hint: blocked ? (state.robotMode === 'hand' ? 'Angkat lengan agar tangan dan kubus bebas dari permukaan.' :
    'Angkat lengan sedikit agar capit melewati permukaan.') : jointHint(next,joints) };
}

function moveJoint(state: GameState, key: Joint, value: number) {
  const limit = JOINT_LIMITS[key];
  if (!limit || state.count < limit.requires || !Number.isFinite(value)) return state;
  return movePose(state, { ...state.joints, [key]: Math.max(limit.min,Math.min(limit.max,value)) }, state.wrist, key);
}

function handInstalled(state: GameState) { return state.robotMode === 'hand' && state.count === HAND_PARTS.length; }

function releaseCube(cube: Cube): Cube {
  const { handContact, ...released } = cube;
  return { ...released, mode: 'falling', speed: 0 };
}

function closeGripper(state: GameState): GameState {
  if (state.count !== PARTS.length || state.cube.mode === 'held') return state;
  const grip = getPose(state.joints).grip;
  const {position: p} = state.cube;
  const [x, z] = localXZ(p[0] - grip[0], p[2] - grip[2], state.joints.yaw);
  const localFrame = inverse(wristQuaternion(NEUTRAL_WRIST, state.joints.yaw));
  const half = cubeExtents(product(localFrame,state.cube.orientation))[2];
  const withinPads = Math.abs(p[1] - grip[1]) <= 0.22 && Math.abs(x) <= 0.28;
  if (state.cube.mode === 'rest' && withinPads && Math.abs(z) + half <= state.gap / 2 + 0.12) {
    return {
      ...state, cube: { ...state.cube, mode: 'held', yaw: state.joints.yaw, orientation: wristQuaternion(NEUTRAL_WRIST, state.joints.yaw),
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
    return { ...next, cube: releaseCube(state.cube), hint: 'Perhatikan tempat kubus mendarat.' };
  }
  // Contact starts when the thumb closes against another finger around a resting cube.
  if (closed && !fingersOppose(state.fingers, state.opposition) && state.cube.mode === 'rest') {
    const pose = getPose(state.joints, 'hand', state.wrist);
    const contact = inHand(pose.orientation, pose.grip, state.cube);
    if (contact.betweenPads && contact.alignedHeight) {
      return { ...next, won: false, cube: { ...state.cube, mode: 'held',
        handContact: { offset: contact.offset, orientation: contact.orientation } },
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
  | { type: 'wrist'; key: WristAxis; value: number }
  | { type: 'tick'; dt: number }
  | { type: 'tryHand' | 'resetWrist' | 'rotate' | 'undo' | 'open' | 'close' | 'resetCube' | 'restart' };

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
        fingers: { ...HAND_PRESETS.open.fingers }, opposition: 0, wrist: { ...NEUTRAL_WRIST }, gap: OPEN_GAP, highlight: null, won: false,
        cube: state.cube.mode === 'held' ? releaseCube(state.cube) : state.cube,
        hint: assemblyHint(action.mode, count, selected, rotation) };
    }
    case 'wrist': {
      const limit = WRIST_LIMITS[action.key];
      if (!handInstalled(state) || !Object.hasOwn(WRIST_LIMITS, action.key) || !Number.isFinite(action.value)) return state;
      return movePose(state, state.joints, { ...state.wrist,
        [action.key]: Math.max(limit.min,Math.min(limit.max,action.value)) }, 'wrist');
    }
    case 'resetWrist':
      return handInstalled(state) ? movePose(state,state.joints,{ ...NEUTRAL_WRIST },'wrist') : state;
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
        if (toolClearance(count,state.robotMode === 'hand',pose) < 0) {
          return { ...state, hint: 'Di Uji gerak, naikkan Sudut bahu agar komponen muat di atas meja. Kembali ke Perakitan untuk memasangnya.' };
        }
      }
      return { ...state, count, selected: null, rotation: 0, highlight: null, hint: assemblyHint(state.robotMode, count) };
    }
    case 'undo': {
      if (!state.count) return { ...state, selected: null, rotation: 0, hint: assemblyHint(state.robotMode, 0) };
      const count = state.count - 1;
      return { ...state, count, selected: null, rotation: 0, won: false, wrist: { ...NEUTRAL_WRIST }, gap: OPEN_GAP, fingers: { ...HAND_PRESETS.open.fingers }, opposition: 0, highlight: null,
        cube: state.cube.mode === 'held' ? releaseCube(state.cube) : state.cube,
        hint: assemblyHint(state.robotMode, count) };
    }
    case 'joint': return moveJoint(state, action.key, action.value);
    case 'close': return state.robotMode === 'hand' ? applyHandPreset(state, 'grasp') : closeGripper(state);
    case 'open': {
      if (state.robotMode === 'hand') return applyHandPreset(state, 'open');
      if (state.count < 6) return state;
      const held = state.cube.mode === 'held';
      return { ...state, gap: OPEN_GAP, highlight: 'grip',
        cube: held ? releaseCube(state.cube) : state.cube,
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