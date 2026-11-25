import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { AnimationMixer, Box3, LoopOnce, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BODY_NEUTRAL, BODY_PARTS } from "../lib/bodyGame.ts";
import { createBodyModel } from "../lib/bodyModel.ts";

let model;
let rig;
let robot;
before(async () => {
  const data = await readFile(new URL("../public/models/rakitron-body.glb", import.meta.url));
  model = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
  rig = createBodyModel();
  rig.setPose(BODY_NEUTRAL);
  rig.group.updateMatrixWorld(true);
  robot = model.scene.getObjectByName("RakitronHumanoid");
  assert.ok(robot);
});
after(() => rig?.dispose());

test("all six exported modules keep their actual surfaces and assembled coordinates", () => {
  assert.deepEqual(robot.children.map(part => part.name).sort(), BODY_PARTS.map(part => part.id).sort());
  for (const { id } of BODY_PARTS) {
    const source = rig.parts[id];
    const exported = robot.getObjectByName(id);
    const stages = new Set();
    exported.traverse(node => { if (node.isMesh) stages.add(node.userData.assemblyStage); });
    assert.deepEqual([...stages].sort(), [0, 1, 2, 3], id + " assembly layers are missing");
    const a = new Box3().setFromObject(source, true);
    const b = new Box3().setFromObject(exported, true);
    assert.ok(!b.isEmpty(), id + " has no surfaces");
    assert.ok(a.min.distanceTo(b.min) < 0.0005 && a.max.distanceTo(b.max) < 0.0005, id + " bounds differ");
    const actual = exported.getWorldPosition(new Vector3());
    assert.ok(actual.distanceTo(source.getWorldPosition(new Vector3())) < 0.00001, id + " socket moved");
  }
  for (const limb of ["arm", "leg"]) {
    assert.ok(robot.getObjectByName("right-" + limb).position.x < 0);
    assert.ok(robot.getObjectByName("left-" + limb).position.x > 0);
  }
});

for (const [name, samples] of [
  ["Salam", [
    [1.15, { rightArm: 85, head: 32 }],
    [1.95, { rightArm: 90, head: 32 }],
  ]],
  ["Uji sendi", [
    [0.8, { rightKnee: 25, torso: -12, leftArm: 18 }],
    [2.4, { leftKnee: 25, torso: 12, rightArm: 18 }],
  ]],
]) {
  test(name + " reproduces the simulator's articulated body, including moving mounts", () => {
    const clip = model.animations.find(animation => animation.name === name);
    assert.ok(clip);
    const mixer = new AnimationMixer(model.scene);
    const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    try {
      for (const [time, pose] of [...samples, [clip.duration, BODY_NEUTRAL]]) {
        mixer.setTime(time);
        rig.setPose({ ...BODY_NEUTRAL, ...pose });
        model.scene.updateMatrixWorld(true);
        rig.group.updateMatrixWorld(true);
        for (const [jointName, source] of Object.entries(rig.joints)) {
          const exported = robot.getObjectByName(source.name);
          assert.ok(exported, jointName + " missing");
          const a = exported.matrixWorld.elements, b = source.matrixWorld.elements;
          assert.ok(a.every((value, i) => Math.abs(value - b[i]) < 0.0002), jointName + " differs from live rig");
        }
      }
    } finally {
      mixer.stopAllAction();
      mixer.uncacheRoot(model.scene);
    }
  });
}

test("each assembly part and the finished body have a distinct rendered reference", async () => {
  const cards = [...BODY_PARTS.map(({ id }) => "body-" + id), "assembled-body"];
  const renders = new Set();
  for (const card of cards) {
    const svg = await readFile(new URL("../public/parts/" + card + ".svg", import.meta.url), "utf8");
    const encoded = svg.match(/data:image\/png;base64,([^"]+)/)?.[1];
    assert.ok(encoded, card + " missing image");
    const png = Buffer.from(encoded, "base64");
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    const reference = card === "assembled-body";
    assert.equal(png.readUInt32BE(16), reference ? 560 : 248);
    assert.equal(png.readUInt32BE(20), reference ? 400 : 160);
    renders.add(encoded);
  }
  assert.equal(renders.size, cards.length, "reused module image");
});
