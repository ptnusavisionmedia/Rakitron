import { readFile, writeFile } from "node:fs/promises";
import { AnimationClip, QuaternionKeyframeTrack, Scene } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FINGERS, HAND_PRESETS, NEUTRAL_WRIST } from "../lib/game.ts";
import { createRoboticHand } from "../lib/handModel.ts";

// The Three.js exporter reads its final binary Blob through the browser FileReader API.
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
};

const sourceUrl = new URL("../public/models/rakitron-arm.glb", import.meta.url);
const outputUrl = new URL("../public/models/rakitron-hand.glb", import.meta.url);
const bytes = await readFile(sourceUrl);
const kit = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
const armParts = ["Stand", "Base", "Shoulder", "UpperArm", "Elbow", "Forearm", "Gripper"].map(name => {
  const node = kit.scene.getObjectByName(name);
  if (!node) throw new Error(`Komponen sumber tidak ditemukan: ${name}`);
  return node;
});

const arm = new Scene();
arm.name = "Rakitron";
kit.scene.updateMatrixWorld(true);
// The kit stores separate parts in an assembled display pose. Preserve those world transforms when nesting joints.
let mount = arm;
for (const part of armParts) {
  mount.attach(part);
  mount = part;
}
const oldTool = armParts.at(-1);
const hand = createRoboticHand({ angles: HAND_PRESETS.open.fingers });
oldTool.parent.add(hand.group);
hand.group.position.copy(oldTool.position);
hand.group.quaternion.copy(oldTool.quaternion);
hand.group.scale.copy(oldTool.scale);
oldTool.removeFromParent();

const pivots = [];
hand.group.traverse(node => {
  if (node.isMesh) node.geometry = mergeVertices(node.geometry);
  if (node.isGroup) pivots.push({ node, rest: node.quaternion.clone() });
});
hand.update(HAND_PRESETS.grasp.fingers, HAND_PRESETS.grasp.opposition);
const joints = pivots.filter(({ node, rest }) => rest.angleTo(node.quaternion) > 1e-5).map(({ node }) => node);

const gestures = { open: "Terbuka", grasp: "Genggam", pinch: "Cubit", point: "Tunjuk" };
const clips = Object.entries(gestures).map(([id, name]) => {
  const start = id === "open" ? HAND_PRESETS.grasp : HAND_PRESETS.open;
  const end = HAND_PRESETS[id];
  const times = [];
  const rotations = joints.map(() => []);
  // Sample the same angular controls used by the simulator, including the thumb's curved opposition path.
  for (let frame = 0; frame <= 16; frame++) {
    const phase = frame / 16;
    const t = phase * phase * (3 - 2 * phase);
    const angles = Object.fromEntries(FINGERS.map(key => [key, start.fingers[key] + (end.fingers[key] - start.fingers[key]) * t]));
    hand.update(angles, start.opposition + (end.opposition - start.opposition) * t);
    times.push(phase);
    joints.forEach((node, index) => rotations[index].push(...node.quaternion.toArray()));
  }
  return new AnimationClip(name, 1, joints.map((node, index) =>
    new QuaternionKeyframeTrack(node.uuid + ".quaternion", times, rotations[index])));
});

// A quarter turn between consecutive roll keys preserves the direction of the full revolution in glTF.
const wristKeys = [
  [0, NEUTRAL_WRIST],
  [.55, { ...NEUTRAL_WRIST, pitch: 50 }],
  [1.25, { ...NEUTRAL_WRIST, pitch: -38 }],
  [1.85, NEUTRAL_WRIST],
  [2.30, { ...NEUTRAL_WRIST, deviation: 18 }],
  [2.90, { ...NEUTRAL_WRIST, deviation: -25 }],
  [3.5, NEUTRAL_WRIST],
  [4.25, { ...NEUTRAL_WRIST, roll: 90 }],
  [5, { ...NEUTRAL_WRIST, roll: 180 }],
  [5.75, { ...NEUTRAL_WRIST, roll: 270 }],
  [6.5, { ...NEUTRAL_WRIST, roll: 360 }],
];
const wristJoints = [hand.rollPivot, hand.deviationPivot, hand.wristPivot];
const wristValues = wristJoints.map(() => []);
for (const [, angles] of wristKeys) {
  hand.setWrist(angles);
  wristJoints.forEach((joint, index) => wristValues[index].push(...joint.quaternion.toArray()));
}
clips.push(new AnimationClip("Pergelangan", -1, wristJoints.map((joint, index) =>
  new QuaternionKeyframeTrack(joint.uuid + ".quaternion", wristKeys.map(([time]) => time), wristValues[index]))));
hand.setWrist(NEUTRAL_WRIST);

hand.update(HAND_PRESETS.open.fingers, HAND_PRESETS.open.opposition);
arm.updateMatrixWorld(true);
const binary = await new GLTFExporter().parseAsync(arm, { binary: true, animations: clips });
await writeFile(outputUrl, new Uint8Array(binary));
hand.dispose();
console.log(`rakitron-hand.glb · ${joints.length} sendi animasi · ${clips.length} klip · ${binary.byteLength} byte`);
