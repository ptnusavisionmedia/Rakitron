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

test('export keeps the wrist housing fixed and reproduces the three joint axes through a full turn', () => {
  const hand = find(model.scene, 'RoboticHand');
  const mount = find(hand, 'WristMount');
  const rotor = find(mount, 'WristRotor');
  const gimbal = find(rotor, 'WristGimbal');
  const palm = find(gimbal, 'WristArticulation');
  const grip = find(palm, 'GripCenter');
  const socket = find(model.scene, 'SocketGripper');
  assert.equal(hand.parent, find(model.scene, 'Forearm'));
  assert.equal(mount.parent, hand);
  assert.equal(rotor.parent, mount);
  assert.equal(gimbal.parent, rotor);
  assert.equal(palm.parent, gimbal);
  for (const name of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) find(palm, name);

  const position = node => node.getWorldPosition(new Vector3());
  const localPosition = node => hand.worldToLocal(position(node));
  const originalMount = position(mount);
  const bearing = position(rotor);
  const mountFrame = mount.matrixWorld.clone();
  const forearmFrame = hand.parent.matrixWorld.clone();
  assert.ok(originalMount.distanceTo(position(socket)) < 0.00001);
  assert.ok(position(palm).distanceTo(bearing) < 0.00001);
  assert.ok(position(gimbal).distanceTo(bearing) < 0.00001);
  const runtimeGrip = find(rig.group, 'GripCenter');
  const samples = [
    [.55, { ...NEUTRAL_WRIST, pitch: 50 }],
    [1.25, { ...NEUTRAL_WRIST, pitch: -38 }],
    [2.30, { ...NEUTRAL_WRIST, deviation: 18 }],
    [2.90, { ...NEUTRAL_WRIST, deviation: -25 }],
  ];
  // The halfway samples catch keys that snap or unwind on the second half of a turn.
  for (let angle = 0; angle <= 360; angle += 45) {
    samples.push([3.5 + angle / 120, { ...NEUTRAL_WRIST, roll: angle }]);
  }
  let previousTime = 0;
  withClip('Pergelangan', (clip, mixer) => {
    assert.equal(clip.tracks.length, 3);
    assert.equal(clip.duration, samples.at(-1)[0]);
    for (const [time, angles] of samples) {
      mixer.update(time - previousTime);
      previousTime = time;
      rig.setWrist(angles);
      const expected = new Quaternion(...wristQuaternion(angles));
      closeRotation(rotor.quaternion, rig.rollPivot.quaternion, 'Rotor ' + time);
      closeRotation(gimbal.quaternion, rig.deviationPivot.quaternion, 'Gimbal ' + time);
      closeRotation(palm.quaternion, rig.wristPivot.quaternion, 'Palm ' + time);
      closeRotation(rotor.quaternion.clone().multiply(gimbal.quaternion).multiply(palm.quaternion), expected, 'Overall wrist ' + time);
      assert.ok(position(rotor).distanceTo(bearing) < 0.00001);
      assert.ok(position(gimbal).distanceTo(bearing) < 0.00001);
      assert.ok(position(palm).distanceTo(bearing) < 0.00001);
      assert.ok(mount.matrixWorld.equals(mountFrame), 'Housing moved at ' + time);
      assert.ok(hand.parent.matrixWorld.equals(forearmFrame), 'Forearm moved at ' + time);
      assert.ok(localPosition(grip).distanceTo(position(runtimeGrip)) < 0.00001, 'Grip center drifted at ' + time);
    }
  });
  rig.setWrist(NEUTRAL_WRIST);
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
