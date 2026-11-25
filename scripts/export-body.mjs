import { writeFile } from "node:fs/promises";
import { AnimationClip, Group, QuaternionKeyframeTrack, Scene, VectorKeyframeTrack } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BODY_NEUTRAL, BODY_PARTS } from "../lib/bodyGame.ts";
import { createBodyModel } from "../lib/bodyModel.ts";
import renderPreview from "./render-preview.cjs";

// GLTFExporter wraps its binary output in a Blob before writing the final GLB.
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
};

const rig = createBodyModel();
const scene = new Scene();
scene.name = "Rakitron";
scene.add(rig.group);
const partsDirectory = new URL("../public/parts/", import.meta.url);

const greeting = [
  [0,    BODY_NEUTRAL],
  [0.45, { rightArm: 22, leftArm: 0, head: 15 }],
  [1.15, { rightArm: 85, leftArm: 0, head: 32 }],
  [1.55, { rightArm: 74, leftArm: 0, head: 32 }],
  [1.95, { rightArm: 90, leftArm: 0, head: 32 }],
  [2.35, { rightArm: 77, leftArm: 0, head: 32 }],
  [2.75, { rightArm: 86, leftArm: 0, head: 32 }],
  [3.65, BODY_NEUTRAL],
];

const bodyCheck = [
  [0, BODY_NEUTRAL],
  [0.8, { rightKnee: 25, torso: -12, leftArm: 18 }],
  [1.6, BODY_NEUTRAL],
  [2.4, { leftKnee: 25, torso: 12, rightArm: 18 }],
  [3.2, BODY_NEUTRAL],
];

function poseClip(name, keys) {
  const moving = [];
  const times = [];
  rig.setPose(BODY_NEUTRAL);
  rig.group.traverse(node => {
    if (node.isGroup) moving.push({
      node, rotation: node.quaternion.clone(), position: node.position.clone(),
      rotations: [], positions: [], turned: false, translated: false,
    });
  });
  for (const [time, pose] of keys) {
    times.push(time);
    rig.setPose({ ...BODY_NEUTRAL, ...pose });
    for (const joint of moving) {
      joint.rotations.push(...joint.node.quaternion.toArray());
      joint.positions.push(...joint.node.position.toArray());
      if (joint.rotation.angleTo(joint.node.quaternion) > 0.00001) joint.turned = true;
      if (joint.position.distanceTo(joint.node.position) > 0.00001) joint.translated = true;
    }
  }
  const tracks = [];
  for (const joint of moving) {
    if (joint.turned) tracks.push(new QuaternionKeyframeTrack(joint.node.uuid + ".quaternion", times, joint.rotations));
    if (joint.translated) tracks.push(new VectorKeyframeTrack(joint.node.uuid + ".position", times, joint.positions));
  }
  return new AnimationClip(name, -1, tracks);
}

function componentCard(id, title) {
  const part = rig.parts[id].clone(true);
  part.position.set(0, 0, 0);
  const mount = new Group();
  mount.add(part);
  const side = id.startsWith("right-") ? -1 : 1;
  const limb = id.endsWith("-arm") || id.endsWith("-leg");
  if (limb) mount.rotation.z = side * (id.endsWith("-arm") ? 0.66 : 0.57);
  const view = limb ? [side * 1.15, 0.58, 3.5] : [1.08, 0.38, 3.5];
  return renderPreview(mount, title, view, 248, 160);
}

try {
  const clips = [poseClip("Salam", greeting), poseClip("Uji sendi", bodyCheck)];
  rig.setPose(BODY_NEUTRAL);
  scene.updateMatrixWorld(true);

  const compacted = new Map();
  rig.group.traverse(node => {
    if (!node.isMesh || node.geometry.index) return;
    const original = node.geometry;
    if (!compacted.has(original)) compacted.set(original, mergeVertices(original));
    node.geometry = compacted.get(original);
  });
  const bytes = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips });
  const reference = renderPreview(rig.group, "Robot seluruh tubuh Rakitron", [1.0, 0.27, 3.5], 560, 400);
  const files = BODY_PARTS.map(({ id, name }) => [
    new URL("body-" + id + ".svg", partsDirectory),
    componentCard(id, name),
  ]);
  files.push(
    [new URL("assembled-body.svg", partsDirectory), reference],
    [new URL("../public/models/rakitron-body.glb", import.meta.url), new Uint8Array(bytes)],
  );
  await Promise.all(files.map(([path, content]) => writeFile(path, content)));
  for (const geometry of compacted.values()) geometry.dispose();
  console.log("rakitron-body.glb | " + BODY_PARTS.length + " komponen | 2 klip gerak | " + bytes.byteLength + " byte");
} finally {
  rig.dispose();
}
