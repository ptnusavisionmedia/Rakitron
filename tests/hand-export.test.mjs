import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HAND_PRESETS, NEUTRAL_WRIST, wristQuaternion } from '../lib/game.ts';
import { createRoboticHand } from '../lib/handModel.ts';

let model;
let rig;
before(async () => {
  const bytes = await readFile(new URL('../public/models/rakitron-hand.glb', import.meta.url));
  model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  rig = createRoboticHand({ angles: HAND_PRESETS.open.fingers });
});
after(() => rig?.dispose());

function find(root, name) {
  const node = root.getObjectByName(name);
  assert.ok(node, 'Missing named node ' + name);
  return node;
}

function closeRotation(actual, expected, label) {
  // Animation samples are stored as float32 in GLB. Both signs represent the same quaternion.
  const error = actual.clone().normalize().angleTo(expected.clone().normalize());
  assert.ok(error < 0.0001, label + ' differs by ' + error + ' radians');
}

function withClip(name, check) {
  const clip = model.animations.find(item => item.name === name);
  assert.ok(clip, 'Missing clip ' + name);
  const mixer = new AnimationMixer(model.scene);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  try {
    check(clip, mixer);
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(model.scene);
  }
}

test('export attaches the wrist to the forearm and rotates the hand about the stationary socket', () => {
  const scene = model.scene;
  const hand = find(scene, 'RoboticHand');
  const mount = find(hand, 'WristMount');
  const wrist = find(hand, 'WristArticulation');
  const grip = find(wrist, 'GripCenter');
  const socket = find(scene, 'SocketGripper');
  assert.equal(hand.parent, find(scene, 'Forearm'));
  assert.equal(wrist.parent, hand);
  assert.equal(mount.parent, hand);
  for (const name of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) find(wrist, name);

  const position = node => node.getWorldPosition(new Vector3());
  const pivot = position(wrist);
  const originalMount = position(mount);
  const fixedRotation = mount.getWorldQuaternion(new Quaternion());
  const forearmMatrix = hand.parent.matrixWorld.clone();
  assert.ok(pivot.distanceTo(position(socket)) < 0.00001);
  const localGrip = wrist.worldToLocal(position(grip));
  let last = 0;
  withClip('Pergelangan', (clip, mixer) => {
    const samples = [
      [0.55, { ...NEUTRAL_WRIST, pitch: 50 }],
      [2.30, { ...NEUTRAL_WRIST, deviation: 18 }],
      [4.00, { ...NEUTRAL_WRIST, roll: 65 }],
      [clip.duration, NEUTRAL_WRIST],
    ];
    for (const [time, angles] of samples) {
      mixer.update(time - last);
      last = time;
      const expected = new Quaternion(...wristQuaternion(angles));
      closeRotation(wrist.quaternion, expected, 'Wrist ' + time);
      assert.ok(position(wrist).distanceTo(pivot) < 0.00001);
      assert.ok(position(mount).distanceTo(originalMount) < 0.00001);
      closeRotation(mount.getWorldQuaternion(new Quaternion()), fixedRotation, 'Fixed collar');
      assert.ok(hand.parent.matrixWorld.equals(forearmMatrix), 'Wrist animation moved the forearm');
      assert.ok(wrist.worldToLocal(position(grip)).distanceTo(localGrip) < 0.00001);
    }
  });
});

test('every exported gesture finishes at the runtime pose, including all three thumb joints', () => {
  const digitalJoints = ['ThumbCMC', 'ThumbMCP', 'ThumbIP'];
  for (const finger of ['Index', 'Middle', 'Ring', 'Little']) {
    for (const joint of [finger, finger + 'MCP', finger + 'PIP', finger + 'DIP']) digitalJoints.push(joint);
  }
  for (const [preset, clipName] of Object.entries({ open: 'Terbuka', grasp: 'Genggam', pinch: 'Cubit', point: 'Tunjuk' })) {
    const pose = HAND_PRESETS[preset];
    rig.update(pose.fingers, pose.opposition);
    withClip(clipName, (clip, mixer) => {
      mixer.update(clip.duration);
      for (const name of digitalJoints) {
        const runtime = find(rig.group, name);
        const exported = find(model.scene, name);
        closeRotation(exported.quaternion, runtime.quaternion, clipName + '/' + name);
        assert.ok(exported.position.distanceTo(runtime.position) < 0.00001, clipName + '/' + name + ' origin differs');
      }
    });
  }
});
