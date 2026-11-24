import { handArmClearance } from './wristClearance.ts';
import { HAND_PALM_OFFSET, HAND_WRIST_PIVOT } from './handKinematics.ts';
export { HAND_PALM_OFFSET, HAND_WRIST_PIVOT };

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
  pitch: { min: -65, max: 75 }, deviation: { min: -30, max: 20 }, roll: { min: 0, max: 360 },
};
export const NEUTRAL_WRIST: WristAngles = { pitch: 0, deviation: 0, roll: 0 };
export type Quaternion = [number, number, number, number];
export type Cube = {
  position: Vec3; orientation: Quaternion; yaw: number; mode: 'rest' | 'held' | 'falling'; speed: number;
  atStart?: boolean;
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

/** Sub-rakitan: setiap komponen dirakit dari bagian-bagiannya dulu sebelum dipasang ke robot. */
export type BuildStep = { name: string; detail: string };
const step = (name: string, detail: string): BuildStep => ({ name, detail });
const BUILD_STEPS: Record<string, BuildStep[]> = {
  base: [
    step('Rangka alas', 'Pelat logam berat ini menahan seluruh robot supaya tidak terguling.'),
    step('Bantalan putar', 'Cincin bantalan membuat alas bisa berputar dengan halus ke kiri dan kanan.'),
    step('Penutup alas', 'Penutup melindungi motor dan roda gigi di dalam alas dari debu.'),
    step('Baut dan lampu', 'Baut mengunci semua bagian, dan lampu menunjukkan robot sedang menyala.'),
  ],
  shoulder: [
    step('Rangka garpu bahu', 'Dua pipi garpu menjepit lengan atas dari kiri dan kanan.'),
    step('Poros dan bantalan', 'Poros adalah sumbu tempat lengan atas berayun naik dan turun.'),
    step('Penutup motor', 'Di balik penutup ada motor servo yang mengangkat lengan.'),
    step('Baut pengunci', 'Baut jingga menahan poros supaya tidak bergeser saat lengan bergerak.'),
  ],
  'upper-arm': [
    step('Tulang lengan', 'Batang aluminium ini ringan tetapi kuat, seperti tulang lengan atasmu.'),
    step('Bos poros', 'Lubang berbantalan di kedua ujung menyambung ke bahu dan siku.'),
    step('Pelindung lengan', 'Pelat gading menutup kabel dan membuat lengan aman disentuh.'),
    step('Kabel dan baut', 'Kabel membawa listrik dan perintah dari alas ke motor di ujung lengan.'),
  ],
  elbow: [
    step('Rumah siku', 'Rumah logam ini memegang motor yang menekuk lengan bawah.'),
    step('Poros berbentuk D', 'Sisi rata pada poros membuat lengan bawah ikut berputar, tidak selip.'),
    step('Penutup siku', 'Penutup menjaga roda gigi tetap bersih dan terlumasi.'),
    step('Cincin dan baut', 'Cincin jingga menandai sumbu putar siku.'),
  ],
  forearm: [
    step('Tulang lengan bawah', 'Batang ini membawa alat di ujungnya ke tempat yang dituju.'),
    step('Bos dan bantalan', 'Bos di pangkal masuk ke poros siku, bos di ujung memegang pergelangan.'),
    step('Pelindung lengan', 'Pelat pelindung menutup rangka dan jalur kabel.'),
    step('Kabel dan baut', 'Kabel servo diikat rapi supaya tidak terjepit saat siku menekuk.'),
  ],
  gripper: [
    step('Rangka capit', 'Jembatan logam ini menjadi rel tempat kedua rahang bergeser.'),
    step('Rel dan poros', 'Rel lurus menjaga rahang tetap sejajar saat membuka dan menutup.'),
    step('Penutup capit', 'Penutup melindungi mekanisme penggerak rahang.'),
    step('Rahang dan bantalan karet', 'Bantalan karet membuat benda tidak licin saat dijepit.'),
  ],
  hand: [
    step('Dudukan dan motor putar', 'Dudukan menyambung ke lengan bawah, motornya memutar telapak 360°.'),
    step('Sendi pergelangan', 'Sendi silang membuat telapak bisa menekuk dan miring seperti pergelanganmu.'),
    step('Telapak', 'Telapak menjadi tempat semua jari menempel dan menahan benda.'),
    step('Empat jari', 'Setiap jari punya tiga ruas yang menekuk bersama untuk melingkari benda.'),
    step('Ibu jari', 'Ibu jari bisa berhadapan dengan jari lain, itulah yang membuat tangan bisa mencubit.'),
  ],
};
export function buildStepsFor(mode: RobotMode, index: number): BuildStep[] {
  return BUILD_STEPS[partsFor(mode)[index]?.id] ?? [];
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

// Ry(baseYaw + roll) × Rz(deviation) × Rx(-pitch), about the rotary bearing below the mounting socket.
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
  const hand = mode === 'hand';
  const orientation = wristQuaternion(hand ? wristAngles : NEUTRAL_WRIST, joints.yaw);
  // The fixed housing ends at this bearing. The fingers and grasp point rotate below it.
  const pivot = hand ? add(wrist, rotateVector(HAND_WRIST_PIVOT, wristQuaternion(NEUTRAL_WRIST, joints.yaw))) : wrist;
  const neutralGrip: Vec3 = hand ? add([0,-GRIP_DEPTH.hand,0],HAND_PALM_OFFSET) : [0,-GRIP_DEPTH.gripper,0];
  const gripOffset = hand ? difference(neutralGrip,HAND_WRIST_PIVOT) : neutralGrip;
  return {
    elbow: rotatedPoint(yaw, upperRadius, upperHeight), wrist, pivot, orientation,
    grip: add(pivot, rotateVector(gripOffset, orientation)),
  };
}

const pickup = getPose({ yaw: -135, shoulder: 30, elbow: -90 }).grip;
const delivery = getPose({ yaw: -45, shoulder: 30, elbow: -90 }).grip;
export const CUBE_START: Vec3 = [pickup[0], HALF_CUBE, pickup[2]];
export const TRAY = { x: delivery[0], z: delivery[2], y: 0.045, width: 0.76, depth: 0.69, yaw: -45 };

function newCube(mode: RobotMode): Cube {
  // Each tool's neutral pickup faces the same point from a slightly different angle.
  const yaw = mode === 'hand' ? -130 : -135;
  return { position: [...CUBE_START], orientation: wristQuaternion(NEUTRAL_WRIST,yaw), yaw, mode: 'rest', speed: 0, atStart: true };
}

export type GameState = {
  robotMode: RobotMode;
  fingers: FingerAngles;
  wrist: WristAngles;
  opposition: number;
  count: number;
  selected: number | null;
  /** Jumlah bagian komponen terpilih yang sudah dirakit. */
  built: number;
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
    count: 0, selected: null, built: 0, rotation: 0, joints: { ...DEFAULT_JOINTS }, gap: OPEN_GAP,
    cube: newCube(robotMode), won: false, hint: 'Pilih alas putar dari laci komponen.', highlight: null,
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
const neutralHandEnvelope: Vec3[] = [
  [-.18,-.35,-.24], [.18,-.35,-.24],
  [-.18,-.35,.12], [.18,-.35,.12], [-.17,-.59,-.24], [.16,-.65,-.24],
  [-.077,-.66,-.24], [-.077,-.66,-.21], [.05,-.686,-.24], [-.14,-.58,.10], [.13,-.60,.12],
  // Mid-curl fingertip pads can reach the table before the fully extended hand.
  [.033,-.676,-.118], [.066,-.684,-.158], [.029,-.688,-.193], [.067,-.687,-.219],
  [-.073,-.656,-.161],
  [.51,-.50,.14], [.20,-.52,.21],
];
const handEnvelope = neutralHandEnvelope.map(point => difference(add(point,HAND_PALM_OFFSET),HAND_WRIST_PIVOT));

// Keep the two endpoints of the position slider available (0 and 360).
// A relative turn may pass either of them, so wrap its accepted end position.
function wrapRoll(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function carriedCube(cube: Cube, pose: ToolPose, yaw: number): Cube {
  if (cube.mode !== 'held') return cube;
  if (cube.handContact) {
    const orientation = product(pose.orientation, cube.handContact.orientation);
    // q and -q describe the same attitude. Retain the nearest sign across the dial seam.
    if (orientation.reduce((dot, value, i) => dot + value * cube.orientation[i], 0) < 0) {
      for (let i = 0; i < 4; i++) orientation[i] = -orientation[i];
    }
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
    clearance = Math.min(clearance, pose.pivot[1] + rotateVector(point,pose.orientation)[1]);
  }
  return clearance;
}

function armClearanceFor(state: GameState, joints = state.joints, wrist = state.wrist) {
  return handArmClearance(joints,wrist,HAND_WRIST_PIVOT,state.fingers,state.opposition,state.cube.mode === 'held');
}

function movesIntoArm(clearance: number, previous: number) {
  return clearance < -1e-8 && clearance < previous - 1e-8;
}

function movePose(state: GameState, targetJoints: Joints, targetWrist: WristAngles, highlight: Joint | 'wrist',
  rollTravel = targetWrist.roll - state.wrist.roll): GameState {
  const maxDelta = Math.max(
    Math.abs(targetJoints.yaw - state.joints.yaw), Math.abs(targetJoints.shoulder - state.joints.shoulder),
    Math.abs(targetJoints.elbow - state.joints.elbow), Math.abs(targetWrist.pitch - state.wrist.pitch),
    Math.abs(targetWrist.deviation - state.wrist.deviation), Math.abs(rollTravel),
  );
  const steps = Math.max(1,Math.ceil(maxDelta));
  let joints = state.joints;
  let wrist = state.wrist;
  let cube = state.cube;
  const hasHand = handInstalled(state);
  let previousArmClearance = hasHand ? armClearanceFor(state) : Infinity;
  let blockedHint: string | undefined;
  // Check each degree, including a simultaneous return of all three wrist axes to neutral.
  for (let i=1;i<=steps;i++) {
    const at = (from: number, to: number) => i === steps ? to : from+(to-from)*i/steps;
    const nextJoints = targetJoints === state.joints ? state.joints : {
      yaw: at(state.joints.yaw,targetJoints.yaw), shoulder: at(state.joints.shoulder,targetJoints.shoulder),
      elbow: at(state.joints.elbow,targetJoints.elbow),
    };
    const nextWrist = targetWrist === state.wrist ? state.wrist : {
      pitch: at(state.wrist.pitch,targetWrist.pitch), deviation: at(state.wrist.deviation,targetWrist.deviation),
      roll: i === steps ? targetWrist.roll : wrapRoll(state.wrist.roll + rollTravel * i / steps),
    };
    const pose = getPose(nextJoints,state.robotMode,nextWrist);
    const moved = carriedCube(cube,pose,nextJoints.yaw);
    const hand = state.robotMode === 'hand';
    let clearance = toolClearance(state.count, hand, pose);
    if (moved.mode === 'held') {
      // The parallel gripper's original pads allow the grip center just below the supported cube.
      const centerHeight = hand ? moved.position[1] : pose.grip[1] + .009;
      clearance = Math.min(clearance, centerHeight - landingHeight(moved));
    }
    if (clearance < -1e-8) {
      blockedHint = hand ? 'Angkat lengan agar tangan dan kubus bebas dari permukaan.' :
        'Angkat lengan sedikit agar capit melewati permukaan.';
      break;
    }
    if (hasHand) {
      const armClearance = armClearanceFor(state,nextJoints,nextWrist);
      // Existing poses can move away from contact, or rotate the entire assembly together.
      if (movesIntoArm(armClearance,previousArmClearance)) {
        blockedHint = 'Tangan menyentuh lengan bawah. Kurangi tekukan pergelangan atau ubah sudut siku.';
        break;
      }
      previousArmClearance = armClearance;
    }
    joints = nextJoints;
    wrist = nextWrist;
    cube = moved;
  }
  const next = { ...state, joints, wrist, cube, highlight };
  return { ...next, hint: blockedHint ?? jointHint(next,joints) };
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
      ...state, cube: { ...state.cube, mode: 'held', atStart: false, yaw: state.joints.yaw, orientation: wristQuaternion(NEUTRAL_WRIST, state.joints.yaw),
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

function nextHandPose(state: GameState, fingers: FingerAngles, opposition: number): GameState {
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
      return { ...next, won: false, cube: { ...state.cube, mode: 'held', atStart: false,
        handContact: { offset: contact.offset, orientation: contact.orientation } },
        hint: 'Kubus terpegang. Angkat lengan, lalu putar alas menuju baki biru.' };
    }
  }
  return { ...next, hint: jointHint(next, state.joints) };
}

function poseHand(state: GameState, fingers: FingerAngles, opposition: number): GameState {
  const target = nextHandPose(state,fingers,opposition);
  if (target === state) return state;
  const holding = target.cube.mode === 'held';
  // Free gestures animate along these joint angles. Contact switches directly to the cube-bracing pose.
  const distance = Math.max(Math.abs(opposition-state.opposition), ...FINGERS.map(key => Math.abs(fingers[key]-state.fingers[key])));
  const steps = holding || state.cube.mode === 'held' ? 1 : Math.max(1,Math.ceil(distance));
  let previous = armClearanceFor(state);
  for (let i=1;i<=steps;i++) {
    const t = i/steps;
    let sample = fingers;
    if (i < steps) {
      sample = { ...state.fingers };
      for (const key of FINGERS) sample[key] += (fingers[key]-sample[key])*t;
    }
    const thumb = state.opposition + (opposition-state.opposition)*t;
    const clearance = handArmClearance(state.joints,state.wrist,HAND_WRIST_PIVOT,sample,thumb,holding);
    if (movesIntoArm(clearance,previous)) {
      return { ...state, highlight: 'grip', hint: 'Gerak jari terhalang lengan bawah. Luruskan pergelangan atau ubah sudut siku.' };
    }
    previous = clearance;
  }
  return target;
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
  | { type: 'turnWrist'; delta: number }
  | { type: 'tick'; dt: number }
  | { type: 'tryHand' | 'resetWrist' | 'rotate' | 'undo' | 'open' | 'close' | 'resetCube' | 'restart' | 'build' };

function buildHint(mode: RobotMode, selected: number, built: number) {
  const steps = buildStepsFor(mode, selected);
  return `Bagian ${built + 1} dari ${steps.length}: seret ${steps[built].name.toLocaleLowerCase('id')} ke bayangan hijau.`;
}

/** Komponen dirakit bagian demi bagian dulu, baru boleh diputar dan dipasang ke robot. */
export function gameReducer(state: GameState, action: Action): GameState {
  const pending = state.selected !== null && state.built < buildStepsFor(state.robotMode, state.selected).length;
  if (action.type === 'build') {
    if (state.selected === null || !pending) return state;
    const built = state.built + 1;
    const done = built === buildStepsFor(state.robotMode, state.selected).length;
    return { ...state, built, hint: done ? assemblyHint(state.robotMode, state.count, state.selected, state.rotation)
      : buildHint(state.robotMode, state.selected, built) };
  }
  if (pending && (action.type === 'place' || action.type === 'rotate')) {
    if (action.type === 'place' && action.partIndex !== undefined && action.partIndex !== state.selected) return state;
    return { ...state, hint: 'Rakit dulu komponennya. ' + buildHint(state.robotMode, state.selected!, state.built) };
  }
  const next = reduce(state, action);
  if (next === state) return state;
  if (next.selected === null || next.selected !== state.selected) {
    const built = 0;
    const hint = next.selected !== null && buildStepsFor(next.robotMode, next.selected).length ? buildHint(next.robotMode, next.selected, 0) : next.hint;
    return { ...next, built, hint };
  }
  return next;
}

function reduce(state: GameState, action: Action): GameState {
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
        cube: state.cube.mode === 'held' ? releaseCube(state.cube) : state.cube.atStart ? newCube(action.mode) : state.cube,
        hint: assemblyHint(action.mode, count, selected, rotation) };
    }
    case 'wrist': {
      const limit = WRIST_LIMITS[action.key];
      if (!handInstalled(state) || !Object.hasOwn(WRIST_LIMITS, action.key) || !Number.isFinite(action.value)) return state;
      return movePose(state, state.joints, { ...state.wrist,
        [action.key]: Math.max(limit.min,Math.min(limit.max,action.value)) }, 'wrist');
    }
    case 'turnWrist': {
      if (!handInstalled(state) || !Number.isFinite(action.delta) || action.delta === 0) return state;
      // A complete revolution checks every possible contact. Further turns repeat that path.
      const travel = Math.abs(action.delta) < 360 ? action.delta : Math.sign(action.delta) * 360 + action.delta % 360;
      const roll = wrapRoll(state.wrist.roll + travel);
      return movePose(state, state.joints, { ...state.wrist, roll }, 'wrist', travel);
    }
    case 'resetWrist': {
      if (!handInstalled(state)) return state;
      const travel = state.wrist.roll > 180 ? 360 - state.wrist.roll : -state.wrist.roll;
      return movePose(state, state.joints, { ...NEUTRAL_WRIST }, 'wrist', travel);
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
        if (count === HAND_PARTS.length && state.robotMode === 'hand' &&
          armClearanceFor(state,state.joints,NEUTRAL_WRIST) < -1e-8) {
          return { ...state, hint: 'Di Uji gerak, ubah sudut siku atau bahu agar tangan tidak menyentuh lengan bawah. Lalu pasang kembali.' };
        }
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
      return { ...state, cube: newCube(state.robotMode), won: false, gap: OPEN_GAP, fingers: { ...HAND_PRESETS.open.fingers }, opposition: 0, highlight: null, hint: assemblyHint(state.robotMode, state.count, state.selected, state.rotation) };
    case 'restart': return initialState(state.robotMode);
    case 'build': return state;
  }
}