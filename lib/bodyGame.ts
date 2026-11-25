import type { BuildStep } from "./game";

export type BodyPartId = "right-leg" | "left-leg" | "torso" | "right-arm" | "left-arm" | "head";
export type BodyJoint = "rightKnee" | "leftKnee" | "torso" | "rightArm" | "leftArm" | "head";
export type BodyPose = Record<BodyJoint, number>;

// The model and its thumbnails share an immutable cache revision.
const bodyRevision = "?v=android-2";
export const BODY_MODEL_URL = "/models/rakitron-body.glb" + bodyRevision;
export const BODY_REFERENCE_URL = "/parts/assembled-body.svg" + bodyRevision;

export const BODY_NEUTRAL: BodyPose = { rightKnee: 0, leftKnee: 0, torso: 0, rightArm: 0, leftArm: 0, head: 0 };

export const BODY_JOINT_LIMITS: Record<BodyJoint, { min: number; max: number; requires: number; label: string }> = {
  rightKnee: { min: 0, max: 35, requires: 1, label: "Lutut kanan" },
  leftKnee: { min: 0, max: 35, requires: 2, label: "Lutut kiri" },
  torso: { min: -25, max: 25, requires: 3, label: "Putar torso" },
  rightArm: { min: 0, max: 100, requires: 4, label: "Angkat tangan kanan" },
  leftArm: { min: 0, max: 100, requires: 5, label: "Angkat tangan kiri" },
  head: { min: -55, max: 55, requires: 6, label: "Putar kepala" },
};

// The robot faces +Z and stands on Y=0. Anatomical right is the negative X side.
export const BODY_ANCHORS: Record<BodyPartId, [number, number, number]> = {
  "right-leg": [-.174, 1.18, 0],
  "left-leg": [.174, 1.18, 0],
  torso: [0, 1.18, 0],
  "right-arm": [-.349, 1.92, 0],
  "left-arm": [.349, 1.92, 0],
  head: [0, 2.12, 0],
};

export type BodyPart = {
  id: BodyPartId;
  name: string;
  short: string;
  description: string;
  thumb: string;
  initialRotation: number;
  steps: BuildStep[];
};

function step(name: string, detail: string): BuildStep { return { name, detail }; }

function legSteps(side: string) {
  return [
    step("Rangka kaki " + side, "Sambungkan rangka paha dan tulang kering ke telapak kaki. Ujung sepatu menghadap ke depan."),
    step("Penggerak lutut", "Pasang motor dan poros pada pertemuan paha dan tulang kering agar lutut bisa menekuk."),
    step("Pelindung tulang kering", "Tutup rangka dengan pelat pelindung. Sisakan celah di sekitar engsel lutut."),
    step("Sol dan pengunci", "Pasang bantalan pada sol, lalu kunci penutup agar kaki siap berdiri di dudukan."),
  ];
}

function armSteps(side: string) {
  return [
    step("Rangka tangan " + side, "Hubungkan tulang lengan atas, lengan bawah, dan rangka telapak."),
    step("Penggerak bahu dan siku", "Pasang motor bahu dan engsel siku sehingga tangan dapat terangkat dan tertekuk."),
    step("Pelindung lengan", "Pasang cangkang di luar lengan dan punggung tangan. Jari dan siku harus tetap bebas bergerak."),
    step("Pengunci pergelangan", "Kunci sambungan pergelangan. Saat lengan rileks di sisi badan, ibu jari mengarah ke depan."),
  ];
}

function part(id: BodyPartId, name: string, description: string, initialRotation: number, steps: BuildStep[]): BodyPart {
  return { id, name, short: name, description, initialRotation, steps, thumb: "/parts/body-" + id + ".svg" + bodyRevision };
}

export const BODY_PARTS: BodyPart[] = [
  part("right-leg", "Kaki kanan", "Letakkan kaki kanan robot pada dudukan. Ujung telapak menghadap ke depan.", 0, legSteps("kanan")),
  part("left-leg", "Kaki kiri", "Pasang kaki kiri di samping kaki kanan. Kedua telapak menopang robot.", 270, legSteps("kiri")),
  part("torso", "Torso", "Turunkan rangka badan hingga kedua sambungan panggul bertemu dengan kedua kaki.", 0, [
    step("Rangka panggul dan dada", "Satukan rangka panggul dengan tulang punggung yang menopang dada robot."),
    step("Motor pinggang", "Dudukkan penggerak di antara panggul dan dada agar dada dan bahu dapat berputar bersama."),
    step("Pelindung dada", "Tutup sisi depan dan belakang torso dengan panel pelindung. Biarkan soket bahu dan leher terbuka."),
    step("Pengunci panel", "Kencangkan panel pada rangka, kemudian periksa kedua sambungan bahu."),
  ]),
  part("right-arm", "Tangan kanan", "Pasang lengan dan tangan kanan robot pada soket bahu kanannya.", 270, armSteps("kanan")),
  part("left-arm", "Tangan kiri", "Pasang lengan dan tangan kiri robot pada soket bahu kirinya.", 270, armSteps("kiri")),
  part("head", "Kepala", "Turunkan kepala ke poros leher. Sensor depan menghadap searah dengan telapak kaki.", 0, [
    step("Rangka kepala", "Pasang rangka kepala pada cincin dudukan leher."),
    step("Penggerak leher", "Pasang motor putar agar kepala dapat menoleh ke kanan dan kiri."),
    step("Cangkang kepala", "Pasang pelindung tengkorak, pipi, dan rahang. Sisakan dua rongga untuk mata robot."),
    step("Sensor depan", "Dudukkan kedua sensor optik di bawah alis. Keduanya menghadap ke depan saat kepala lurus."),
  ]),
];

export const BODY_SNAP_DISTANCE = .28;
export const BODY_GREETING = { rightArm: 65, leftArm: 20, head: 20 };
export const BODY_MISSION_HINT = "Angkat tangan kanan setidaknya 65°, biarkan tangan kiri di 20° atau kurang, lalu arahkan kepala ke kanan setidaknya 20°.";

export type BodyGameState = {
  count: number;
  selected: number | null;
  built: number;
  buildProgress: number[];
  partRotations: number[];
  rotation: number;
  pose: BodyPose;
  hint: string;
  won: boolean;
};

export type BodyAction =
  | { type: "select"; index: number }
  | { type: "build"; step?: number }
  | { type: "place"; index?: number; distance?: number }
  | { type: "pose"; joint: BodyJoint; value: number }
  | { type: "ready" | "rotate" | "undo" | "restart" | "resetPose" };

function assemblyHint(count: number, selected: number | null, built: number, rotation: number): string {
  if (count === BODY_PARTS.length) return BODY_MISSION_HINT;
  const next = BODY_PARTS[count].name.toLowerCase();
  if (selected === null) return "Pilih " + next + " dari laci komponen.";
  const piece = BODY_PARTS[selected];
  const currentStep = piece.steps[built];
  if (currentStep) return "Rakit " + currentStep.name.toLowerCase() + " untuk modul " + piece.name.toLowerCase() + ".";
  if (selected !== count) return "Modul " + piece.name.toLowerCase() + " sudah siap. Pasang " + next + " lebih dahulu.";
  if (rotation) return "Putar 90° sebanyak " + (360 - rotation) / 90 + " kali untuk menyelaraskan " + next + ".";
  return "Sambungan sejajar. Pasang " + next + " pada soket yang menyala.";
}

export function bodyInitialState(): BodyGameState {
  return {
    count: 0, selected: null, built: 0, buildProgress: BODY_PARTS.map(() => 0),
    partRotations: BODY_PARTS.map(p => p.initialRotation), rotation: 0,
    pose: { ...BODY_NEUTRAL }, won: false, hint: assemblyHint(0, null, 0, 0),
  };
}

export function bodyReducer(state: BodyGameState, action: BodyAction): BodyGameState {
  const { count, selected, rotation, built } = state;
  switch (action.type) {
    case "restart":
      return bodyInitialState();
    case "ready":
      return {
        ...bodyInitialState(), count: BODY_PARTS.length, buildProgress: BODY_PARTS.map(p => p.steps.length),
        partRotations: BODY_PARTS.map(() => 0),
        hint: BODY_MISSION_HINT,
      };
    case "select": {
      const index = action.index;
      if (!Number.isInteger(index) || index < count || index >= BODY_PARTS.length) return state;
      const progress = state.buildProgress[index];
      const nextRotation = state.partRotations[index];
      return {
        ...state, selected: index, built: progress, rotation: nextRotation, pose: { ...BODY_NEUTRAL },
        hint: assemblyHint(count, index, progress, nextRotation),
      };
    }
    case "build": {
      if (selected === null || built >= BODY_PARTS[selected].steps.length) return state;
      if (action.step !== undefined && action.step !== built) return state;
      const progress = [...state.buildProgress];
      progress[selected] = built + 1;
      return {
        ...state, built: built + 1, buildProgress: progress, pose: { ...BODY_NEUTRAL },
        hint: assemblyHint(count, selected, built + 1, rotation),
      };
    }
    case "rotate": {
      if (selected === null || built !== BODY_PARTS[selected].steps.length) return state;
      const nextRotation = (rotation + 90) % 360;
      const partRotations = [...state.partRotations];
      partRotations[selected] = nextRotation;
      return { ...state, rotation: nextRotation, partRotations, pose: { ...BODY_NEUTRAL }, hint: assemblyHint(count, selected, built, nextRotation) };
    }
    case "place": {
      if (selected === null) return state;
      if (selected !== count || (action.index !== undefined && action.index !== count)) {
        return { ...state, hint: "Soket berikutnya untuk " + BODY_PARTS[count].name.toLowerCase() + ". Pilih modul dan sisi yang sesuai." };
      }
      if (built !== BODY_PARTS[selected].steps.length || rotation !== 0) {
        return { ...state, hint: assemblyHint(count, selected, built, rotation) };
      }
      const distance = action.distance === undefined ? 0 : action.distance;
      if (!Number.isFinite(distance) || distance < 0 || distance > BODY_SNAP_DISTANCE) {
        return { ...state, hint: "Dekatkan sambungan modul ke soket yang menyala." };
      }
      return { ...state, count: count + 1, selected: null, built: 0, rotation: 0, pose: { ...BODY_NEUTRAL },
        hint: assemblyHint(count + 1, null, 0, 0) };
    }
    case "undo": {
      const previous = Math.max(0, count - 1);
      return { ...state, count: previous, selected: null, built: 0, rotation: 0,
        pose: { ...BODY_NEUTRAL }, won: false, hint: assemblyHint(previous, null, 0, 0) };
    }
    case "resetPose":
      return { ...state, pose: { ...BODY_NEUTRAL }, hint: count < BODY_PARTS.length ? assemblyHint(count, selected, built, rotation) :
        state.won ? "Pose kembali netral. Kamu bisa mencoba gerakan lain." : BODY_MISSION_HINT };
    case "pose": {
      if (!Object.hasOwn(BODY_JOINT_LIMITS, action.joint) || !Number.isFinite(action.value)) return state;
      const limits = BODY_JOINT_LIMITS[action.joint];
      if (count < limits.requires) return state;
      const value = Math.min(limits.max, Math.max(limits.min, action.value));
      if (value === state.pose[action.joint]) return state;
      const pose = { ...state.pose, [action.joint]: value };
      const greeting = count === BODY_PARTS.length && pose.rightArm >= BODY_GREETING.rightArm &&
        pose.leftArm <= BODY_GREETING.leftArm && pose.head >= BODY_GREETING.head;
      const won = state.won || greeting;
      const hint = won ? "Robot berhasil menyapa! Kamu bisa melanjutkan uji gerak." :
        count === BODY_PARTS.length ? BODY_MISSION_HINT : "Gerakkan sendi yang sudah terpasang atau lanjutkan perakitan.";
      return { ...state, pose, won, hint };
    }
  }
}
