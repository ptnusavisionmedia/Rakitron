import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion } from 'three';
import { gameReducer as step, initialState, CUBE_SIZE, CUBE_START, TRAY, PARTS, FINGERS, HAND_PRESETS, partsFor, getPose, fitsTray, WRIST_LIMITS, NEUTRAL_WRIST, HAND_PALM_OFFSET, HAND_WRIST_PIVOT, wristQuaternion, SNAP_DISTANCE, turnsToAlign, buildStepsFor, handBraces } from '../lib/game.ts';

const joint = (s, key, value) => step(s, { type:'joint', key, value });
const action = (s, type) => step(s, { type });
const place = s => step(s, { type:'place', distance:0 });
// Selecting in these tests also finishes the part's own sub-assembly, which has its own tests below.
const pick = (s, index) => step(s, { type:'select', index });
const build = s => { while (s.selected !== null && s.built < buildStepsFor(s.robotMode, s.selected).length) s = step(s, { type:'build' }); return s; };
const select = (s, index) => build(pick(s, index));
function assembled() {
  let s = initialState();
  for (let i = 0; i < 6; i++) {
    s = select(s, i);
    if (s.rotation) s = action(s, 'rotate');
    s = place(s);
    assert.equal(s.count, i + 1);
  }
  return s;
}
function pickup() {
  let s = assembled();
  s = joint(s, 'yaw', -135);
  s = joint(s, 'elbow', -90);
  s = joint(s, 'shoulder', 30);
  return action(s, 'close');
}
function settle(s) {
  for (let i = 0; i < 200 && s.cube.mode === 'falling'; i++) s = step(s, {type:'tick', dt:1/60});
  return s;
}

test('only fitting oriented nearby components can be installed; partial controls match installed modules', () => {
  let s = initialState();
  assert.equal(select(s, 3).selected, null);
  assert.equal(joint(s,'yaw',40).joints.yaw,s.joints.yaw);
  s = select(s,0);
  assert.equal(step(s,{type:'place',distance:0.5}).count,0);
  assert.equal(step(s,{type:'place',distance:0,partIndex:1}).count,0);
  s = place(s);
  assert.equal(joint(s,'yaw',40).joints.yaw,40);
  assert.equal(joint(s,'shoulder',40).joints.shoulder,s.joints.shoulder);
  s = place(select(s,1));
  s = select(s,2);
  assert.equal(place(s).count,2);
  s = place(action(s,'rotate'));
  assert.equal(s.count,3);
  assert.equal(joint(s,'shoulder',40).joints.shoulder,40);
  assert.equal(action(s,'undo').count,2);
});

test('closing an empty gripper misses; jaws capture the cube only when aligned', () => {
  assert.equal(action(assembled(),'close').cube.mode,'rest');
  const s = pickup();
  assert.equal(s.cube.mode,'held');
  assert.equal(s.gap,CUBE_SIZE);
  assert.equal(s.won,false);
  const raised = joint(s,'shoulder',42);
  assert.ok(raised.cube.position[1] > s.cube.position[1] + 0.25);
});

test('crossing the bin while holding the cube is insufficient; release and settle completes the mission', () => {
  let s = pickup();
  s = joint(s,'shoulder',42);
  s = joint(s,'yaw',-45);
  assert.equal(s.won,false);
  s = action(s,'open');
  assert.equal(s.cube.mode,'falling');
  assert.equal(s.won,false);
  s = settle(s);
  assert.equal(s.cube.mode,'rest');
  assert.equal(s.won,true);
  assert.ok(Math.abs(s.cube.position[1] - (TRAY.y + CUBE_SIZE/2)) < 0.00001);
  s = action(s,'resetCube');
  assert.deepEqual(s.cube.position,CUBE_START);
  assert.equal(s.count,6);
  assert.equal(s.won,false);
});

test('release on the table is recoverable and never completes the mission', () => {
  let s = pickup();
  s = joint(s,'shoulder',42);
  s = settle(action(s,'open'));
  assert.equal(s.won,false);
  assert.equal(s.cube.position[1],CUBE_SIZE/2);
  assert.equal(s.count,6);
});

test('each socket keeps its selected part through failed placement, quarter turns, undo and refit', () => {
  let s = initialState();
  for (let index = 0; index < PARTS.length; index++) {
    s = select(s, index);
    const initialTurns = index === 2 || index === 4 ? 1 : 0;
    assert.equal(turnsToAlign(s.rotation), initialTurns);
    for (let turn = 0; turn < 4; turn++) {
      const remaining = (initialTurns + 4 - turn) % 4;
      assert.equal(turnsToAlign(s.rotation), remaining);
      if (remaining) {
        const rejected = place(s);
        assert.equal(rejected.count, index);
        assert.equal(rejected.selected, index);
        assert.match(rejected.hint, new RegExp(remaining + ' kali'));
      }
      s = action(s, 'rotate');
    }
    if (initialTurns) s = action(s, 'rotate');
    // Selecting the same card twice must preserve the aligned pose.
    s = select(s, index);
    assert.equal(s.rotation, 0);
    for (const distance of [-1, Infinity, NaN, SNAP_DISTANCE + 0.001]) {
      assert.equal(step(s, { type: 'place', partIndex: index, distance }).count, index);
    }
    const fit = { type: 'place', partIndex: index, distance: SNAP_DISTANCE };
    s = step(s, fit);
    assert.equal(s.count, index + 1);
    assert.equal(s.selected, null);
    assert.equal(step(s, fit), s);
    s = select(action(s, 'undo'), index);
    if (initialTurns) s = action(s, 'rotate');
    s = step(s, fit);
    assert.equal(s.count, index + 1);
  }
  assert.deepEqual(action(s, 'restart'), initialState());
});

test('a low shoulder can be raised to install the forearm and gripper without reselecting them', () => {
  let s = action(action(assembled(), 'undo'), 'undo');
  s = joint(s, 'shoulder', 0);
  s = action(select(s, 4), 'rotate');
  s = place(s);
  assert.equal(s.count, 4);
  assert.match(s.hint, /Uji gerak.*Sudut bahu/);
  s = joint(s, 'shoulder', 20);
  assert.equal(s.selected, 4);
  assert.equal(s.rotation, 0);
  s = place(s);
  assert.equal(s.count, 5);
  s = place(select(s, 5));
  assert.equal(s.count, 5);
  assert.match(s.hint, /Uji gerak.*Sudut bahu/);
  s = place(joint(s, 'shoulder', 55));
  assert.equal(s.count, 6);
});

test('interchanging end tools retains assembled links, angles and compatible selections', () => {
  const handParts = partsFor('hand');
  assert.deepEqual(handParts.slice(0, 5), PARTS.slice(0, 5));
  assert.deepEqual(handParts.map(p => p.id).slice(-1), ['hand']);
  assert.equal(handParts[5].thumb, '/parts/hand.svg');
  assert.equal(partsFor('gripper'), PARTS);
  let s = assembled();
  s = joint(s, 'yaw', -60);
  const before = s.joints;
  s = step(s, { type: 'robotMode', mode: 'hand' });
  assert.equal(s.count, 5);
  assert.equal(s.joints, before);
  assert.match(s.hint, /tangan lima jari/i);
  assert.equal(step(s, { type: 'finger', key: 'thumb', value: 45 }), s);
  const unchanged = step(s, { type: 'robotMode', mode: 'hand' });
  assert.equal(unchanged, s);
  s = place(select(s, 5));
  assert.equal(s.count, 6);
  assert.equal(step(s, { type: 'robotMode', mode: 'gripper' }).count, 5);
  let partial = place(select(initialState(), 0));
  partial = place(select(partial, 1));
  partial = action(select(partial, 2), 'rotate');
  const switched = step(partial, { type: 'robotMode', mode: 'hand' });
  assert.equal(switched.selected, 2);
  assert.equal(switched.rotation, 0);
  assert.equal(place(switched).count, 3);
  assert.deepEqual(action(s, 'restart'), initialState('hand'));
});

function assembledHand() {
  let s = initialState('hand');
  for (let index = 0; index < partsFor('hand').length; index++) {
    s = select(s, index);
    if (s.rotation !== 0) s = action(s, 'rotate');
    s = place(s);
    assert.equal(s.count, index + 1);
  }
  return s;
}
function reachCubeWithHand() {
  let s = joint(assembledHand(), 'yaw', -130);
  s = joint(s, 'elbow', -92);
  return joint(s, 'shoulder', 38);
}
const finger = (s, key, value) => step(s, { type: 'finger', key, value });
const preset = (s, preset) => step(s, { type: 'handPreset', preset });
const oppose = (s, value) => step(s, { type: 'opposition', value });

test('five independent finger controls and thumb opposition obey limits and four poses', () => {
  let s = assembledHand();
  for (const [index, key] of FINGERS.entries()) {
    const before = s.fingers;
    s = finger(s, key, 12 + index * 9);
    assert.deepEqual(s.fingers, { ...before, [key]: 12 + index * 9 });
  }
  const fingers = s.fingers;
  s = oppose(s, 120);
  assert.equal(s.opposition, 90);
  assert.deepEqual(s.fingers, fingers);
  assert.equal(finger(s, 'thumb', -5).fingers.thumb, 0);
  assert.equal(finger(s, 'little', 125).fingers.little, 90);
  assert.equal(finger(s, 'middle', NaN), s);
  assert.equal(oppose(s, Infinity), s);
  for (const name of ['open', 'grasp', 'pinch', 'point']) {
    s = preset(s, name);
    assert.deepEqual(s.fingers, HAND_PRESETS[name].fingers);
    assert.equal(s.opposition, HAND_PRESETS[name].opposition);
    assert.equal(s.cube.mode, 'rest');
  }
  const locked = assembled();
  assert.equal(finger(locked, 'index', 70), locked);
  assert.equal(preset(locked, 'grasp'), locked);
});

test('hand grasps and releases the cube by finger contact, including manual pinch', () => {
  let s = reachCubeWithHand();
  assert.equal(s.joints.shoulder, 38);
  assert.equal(s.joints.elbow, -92);
  const grip = getPose(s.joints, 'hand').grip;
  assert.ok(Math.hypot(...grip.map((value, i) => value - CUBE_START[i])) < 0.02);
  s = finger(finger(s, 'thumb', 66), 'index', 68);
  assert.equal(s.cube.mode, 'rest');
  s = oppose(s, 88);
  assert.equal(s.cube.mode, 'held');
  s = finger(s, 'little', 20);
  assert.equal(s.cube.mode, 'held');
  s = oppose(joint(s, 'shoulder', 45), 0);
  assert.equal(s.cube.mode, 'falling');
  assert.equal(settle(s).won, false);
  for (const pose of ['pinch', 'grasp']) {
    let held = preset(reachCubeWithHand(), pose);
    assert.equal(held.cube.mode, 'held');
    const sw = step(held, { type: 'robotMode', mode: 'gripper' });
    assert.equal(sw.cube.mode, 'falling');
    assert.equal(sw.count, 5);
    assert.equal(action(held, 'undo').cube.mode, 'falling');
    held = joint(held, 'shoulder', 48);
    held = joint(held, 'yaw', -40);
    assert.equal(held.won, false);
    held = preset(held, 'open');
    assert.equal(held.cube.mode, 'falling');
    assert.equal(settle(held).won, true);
  }
});

test('only an untouched starting cube aligns to a newly selected tool', () => {
  const gripper = initialState();
  const hand = step(gripper,{type:'robotMode',mode:'hand'});
  assert.deepEqual(hand.cube.position,gripper.cube.position);
  near(hand.cube.yaw,-130);
  assert.deepEqual(hand.cube.orientation,wristQuaternion(NEUTRAL_WRIST,-130));
  for (const reset of ['tryHand','resetCube','restart']) assert.deepEqual(action(hand,reset).cube,hand.cube);
  assert.deepEqual(step(hand,{type:'robotMode',mode:'gripper'}).cube,gripper.cube);
  const dropped = settle(preset(preset(reachCubeWithHand(),'grasp'),'open'));
  assert.equal(dropped.cube.mode,'rest');
  assert.equal(step(dropped,{type:'robotMode',mode:'gripper'}).cube,dropped.cube);
});

test('ready-made hand is opt-in, fully open and separate from manual assembly', () => {
  const basic = initialState();
  assert.equal(action(basic, 'tryHand'), basic);
  const partial = place(select(initialState('hand'), 0));
  const ready = action(partial, 'tryHand');
  assert.equal(ready.robotMode, 'hand');
  assert.equal(ready.count, partsFor('hand').length);
  assert.equal(ready.selected, null);
  assert.deepEqual(ready.joints, initialState('hand').joints);
  assert.deepEqual(ready.fingers, HAND_PRESETS.open.fingers);
  assert.equal(ready.opposition, 0);
  assert.deepEqual(ready.cube.position, CUBE_START);
  const posed = preset(ready, 'point');
  assert.equal(action(posed, 'tryHand'), posed);
  assert.equal(action(posed, 'undo').count, 5);
});

const wrist = (s, key, value) => step(s, { type: 'wrist', key, value });
const turn = (s, delta) => step(s, { type: 'turnWrist', delta });
const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a-b) <= epsilon, `${a} differs from ${b}`);
const vectorNear = (actual, expected) => actual.forEach((value, i) => near(value, expected[i]));
const radians = degrees => degrees*Math.PI/180;
const aroundX = ([x,y,z], a) => [x, y*Math.cos(a)-z*Math.sin(a), y*Math.sin(a)+z*Math.cos(a)];
const aroundY = ([x,y,z], a) => [x*Math.cos(a)+z*Math.sin(a), y, -x*Math.sin(a)+z*Math.cos(a)];
const aroundZ = ([x,y,z], a) => [x*Math.cos(a)-y*Math.sin(a), x*Math.sin(a)+y*Math.cos(a), z];

test('wrist axes are locked until the hand is installed, independently limited, and reset on removal', () => {
  for (const locked of [initialState('hand'), action(assembledHand(), 'undo'), assembled()]) {
    assert.equal(wrist(locked, 'pitch', 25), locked);
    assert.equal(turn(locked, 25), locked);
    assert.equal(action(locked, 'resetWrist'), locked);
  }
  let s = assembledHand();
  assert.deepEqual(s.wrist, NEUTRAL_WRIST);
  for (const [axis, limit] of Object.entries(WRIST_LIMITS)) {
    const start = action(s,'resetWrist');
    assert.deepEqual(start.wrist, NEUTRAL_WRIST);
    assert.equal(wrist(start, axis, Infinity), start);
    s = wrist(start, axis, limit.min - 200);
    assert.deepEqual(s.wrist, { ...start.wrist, [axis]: limit.min });
    s = wrist(s, axis, limit.max + 200);
    assert.deepEqual(s.wrist, { ...start.wrist, [axis]: limit.max });
    assert.equal(s.joints, start.joints);
    assert.equal(s.fingers, start.fingers);
    assert.equal(s.cube, start.cube);
  }
  assert.equal(wrist(s, 'not-a-joint', 10), s);
  assert.deepEqual(action(s, 'resetWrist').wrist, NEUTRAL_WRIST);
  assert.deepEqual(action(s,'resetCube').wrist, s.wrist);
  const undo = action(s,'undo');
  assert.deepEqual(place(select(undo,5)).wrist, NEUTRAL_WRIST);
  assert.deepEqual(step(s,{type:'robotMode', mode:'gripper'}).wrist, NEUTRAL_WRIST);
  assert.deepEqual(action(s, 'restart').wrist, NEUTRAL_WRIST);
});

test('grip center follows local flexion, deviation and a complete roll around the bearing below the mounting socket', () => {
  const joints = { yaw: 39, shoulder: 65, elbow: -105 };
  for (const angles of [
    NEUTRAL_WRIST, { pitch: 55, deviation: 0, roll: 0 }, { pitch: 0, deviation: 18, roll: 0 },
    { pitch: 0, deviation: 0, roll: 278 }, { pitch: -32, deviation: -20, roll: 64 },
    { pitch: 75, deviation: -30, roll: 359 }, { pitch: 22, deviation: 20, roll: 360 },
  ]) {
    const neutral = getPose(joints,'hand');
    const current = getPose(joints,'hand',angles);
    const worldOffset = aroundY(HAND_WRIST_PIVOT, radians(joints.yaw));
    const center = neutral.wrist.map((value, i) => value + worldOffset[i]);
    const neutralGrip = [0,-.57,.152].map((value,i) => value - HAND_WRIST_PIVOT[i]);
    const rotated = aroundY(aroundZ(aroundX(neutralGrip, radians(-angles.pitch)), radians(angles.deviation)),
      radians(joints.yaw+angles.roll));
    vectorNear(current.pivot, center);
    vectorNear(current.grip, center.map((value, i) => value + rotated[i]));
    vectorNear(current.wrist, neutral.wrist);
    vectorNear(current.elbow, neutral.elbow);
    near(Math.hypot(...current.orientation),1);
    const fixed = getPose(joints,'gripper');
    assert.deepEqual(getPose(joints,'gripper',angles), fixed);
  }
});

test('the tilted contact volume detects a cube next to the palm and rejects the old vertical grip position', () => {
  let s = wrist(assembledHand(), 'pitch', 75);
  s = wrist(s,'roll',72);
  const pose = getPose(s.joints,'hand',s.wrist);
  const displaced = getPose(s.joints,'hand').grip;
  const withCubeAt = position => ({ ...s, cube: { ...s.cube, position, orientation: pose.orientation } });
  assert.equal(preset(withCubeAt(displaced),'grasp').cube.mode,'rest');
  const picked = preset(withCubeAt(pose.grip),'pinch');
  assert.equal(picked.cube.mode,'held');
  vectorNear(picked.cube.position,pose.grip);
  vectorNear(picked.cube.orientation,pose.orientation);
  const besideCube = joint(joint(joint(assembledHand(),'yaw',-128),'elbow',-92),'shoulder',42);
  assert.equal(preset(besideCube,'pinch').cube.mode, 'rest');
  const gentlyTilted = wrist(reachCubeWithHand(),'pitch',-3);
  assert.equal(preset(gentlyTilted,'grasp').cube.mode, 'held');
});

test('carried cube follows wrist rotation and releases without a position or orientation jump', () => {
  const atCube = reachCubeWithHand();
  let s = preset(atCube,'grasp');
  assert.equal(s.cube.mode,'held');
  vectorNear(s.cube.position,atCube.cube.position);
  vectorNear(s.cube.orientation,atCube.cube.orientation);
  s = joint(s, 'shoulder', 55);
  const beforeTwist = s;
  const angles = { pitch: 32, deviation: -17, roll: 48 };
  for (const [axis,value] of Object.entries(angles)) s = wrist(s,axis,value);
  assert.deepEqual(s.wrist,angles);
  const mounting = getPose(s.joints,'hand').pivot;
  const oldOffset = beforeTwist.cube.position.map((value,i)=>value-mounting[i]);
  const localOffset = aroundY(oldOffset, radians(-s.joints.yaw));
  const moved = aroundY(aroundZ(aroundX(localOffset,radians(-angles.pitch)),radians(angles.deviation)),radians(s.joints.yaw+angles.roll));
  vectorNear(s.cube.position, mounting.map((value,i)=>value+moved[i]));
  const expectedOrientation = new Quaternion(...wristQuaternion(angles,s.joints.yaw))
    .multiply(new Quaternion(...beforeTwist.cube.handContact.orientation));
  near(Math.abs(new Quaternion(...s.cube.orientation).dot(expectedOrientation)),1);
  assert.notDeepEqual(s.cube.orientation,beforeTwist.cube.orientation);
  const retained = s.cube;
  for (const release of [preset(s,'open'),action(s,'undo'),step(s,{type:'robotMode',mode:'gripper'})]) {
    assert.equal(release.cube.mode,'falling');
    assert.equal(release.cube.handContact, undefined);
    vectorNear(release.cube.position,retained.position);
    vectorNear(release.cube.orientation,retained.orientation);
  }
  const tiltDrop = settle(preset(s,'open'));
  assert.ok(tiltDrop.cube.position[1] > CUBE_SIZE/2 + .01);
  vectorNear(tiltDrop.cube.orientation,retained.orientation);
});

test('wrist movement, combined neutral return, and arm movement stop at table contact and recover after lifting', () => {
  const low = reachCubeWithHand();
  const contact = wrist(low,'pitch',75);
  assert.ok(contact.wrist.pitch < 75);
  const held = preset(low,'grasp');
  const grounded = wrist(held,'pitch',75);
  assert.ok(grounded.wrist.pitch < 75);
  assert.equal(grounded.cube.mode,'held');
  assert.match(grounded.hint,/Angkat lengan/);
  const lifted = joint(held,'shoulder',55);
  assert.equal(wrist(lifted,'pitch',75).wrist.pitch,75);
  const tilted = wrist(wrist(assembledHand(),'pitch',65),'deviation',18);
  const lowered = joint(joint(tilted,'elbow',-92),'shoulder',0);
  assert.ok(lowered.joints.shoulder > 0);
  const attempted = action(lowered,'resetWrist');
  assert.ok(attempted.wrist.pitch > 0);
  assert.match(attempted.hint,/Angkat lengan/);
  const returned = action(joint(attempted,'shoulder',55),'resetWrist');
  assert.deepEqual(returned.wrist, NEUTRAL_WRIST);
  assert.equal(returned.count,6);
});

test('tray acceptance uses tilted cube corners and the hand can deliver after exercising all wrist axes', () => {
  const edge = TRAY.width/2-CUBE_SIZE/2-.008;
  const offset = aroundY([edge,0,0],radians(TRAY.yaw));
  const cube = { ...initialState().cube, yaw: TRAY.yaw, position: [TRAY.x+offset[0],1,TRAY.z+offset[2]],
    orientation: wristQuaternion(NEUTRAL_WRIST,TRAY.yaw) };
  assert.equal(fitsTray(cube),true);
  assert.equal(fitsTray({ ...cube, orientation: wristQuaternion({ ...NEUTRAL_WRIST, deviation:20 },TRAY.yaw) }),false);
  let s = joint(preset(reachCubeWithHand(),'grasp'),'shoulder',45);
  for (const [axis,value] of [['pitch',30],['deviation',-10],['roll',40]]) s=wrist(s,axis,value);
  s = joint(action(s,'resetWrist'),'yaw',-45);
  assert.equal(s.cube.mode,'held');
  assert.equal(settle(preset(s,'open')).won,true);
});

test('radial deviation keeps the ring fingertip above the table when the forearm lowers', () => {
  let s = wrist(assembledHand(), 'deviation', 20);
  s = joint(s, 'elbow', -92);
  for (const shoulder of [37.3,37.2,37.1,37,36.9,36.8,36.7,36.6]) s = joint(s, 'shoulder', shoulder);
  assert.match(s.hint,/Angkat lengan/);
  const pose = getPose(s.joints,'hand',s.wrist);
  // Measured vertices on the ring finger in the open and cube-bracing meshes.
  for (const vertex of [[-.0741,-.6555,-.2248],[-.0720,-.6565,-.2133]]) {
    const fromBearing = vertex.map((v,i) => v + HAND_PALM_OFFSET[i] - HAND_WRIST_PIVOT[i]);
    const worldY = pose.pivot[1] + aroundZ(fromBearing,radians(20))[1];
    assert.ok(worldY >= 0 && worldY < .012, 'ring finger should stop immediately above the tabletop');
  }
  s = joint(s, 'shoulder', 55);
  assert.deepEqual(action(s,'resetWrist').wrist,NEUTRAL_WRIST);
});

test('roll covers a full revolution in either direction and supports repeated turns across the dial seam', () => {
  const start = wrist(wrist(assembledHand(), 'pitch', 21), 'deviation', -12);
  const reference = getPose(start.joints,'hand',start.wrist);
  for (const invalid of [NaN, Infinity, -Infinity, 0]) assert.equal(turn(start, invalid), start);
  for (const direction of [1,-1]) {
    let s = start;
    for (let i = 1; i <= 24; i++) {
      s = turn(s, direction * 30);
      assert.equal(s.wrist.roll, (direction * 30 * i % 360 + 360) % 360);
      const pose = getPose(s.joints,'hand',s.wrist);
      vectorNear(pose.pivot, reference.pivot);
      if (i % 12 === 0) {
        vectorNear(pose.grip, reference.grip);
        near(Math.abs(pose.orientation.reduce((dot,v,j) => dot + v*reference.orientation[j], 0)), 1);
      } else {
        assert.ok(Math.hypot(...pose.grip.map((v,j) => v-reference.grip[j])) > .01);
      }
    }
  }
  assert.equal(turn(start, 735).wrist.roll, 15);
  assert.equal(turn(start, -735).wrist.roll, 345);
  const end = wrist(start, 'roll', 360);
  assert.equal(end.wrist.roll, 360);
  vectorNear(getPose(end.joints,'hand',end.wrist).grip, reference.grip);
  assert.equal(turn(end, 2).wrist.roll, 2);
  assert.deepEqual(action(end,'resetWrist').wrist, NEUTRAL_WRIST);
});

test('a tilted grasp stays on the same bearing through repeated rotations and can still deliver the cube', () => {
  let s = joint(preset(reachCubeWithHand(),'grasp'), 'shoulder', 65);
  s = wrist(wrist(s, 'pitch', 25), 'deviation', -15);
  const before = s.cube;
  for (const direction of [1,-1]) {
    for (let i = 0; i < 48; i++) {
      const previous = s.cube;
      s = turn(s, direction * 15);
      assert.equal(s.cube.mode, 'held');
      assert.deepEqual(s.cube.handContact, before.handContact);
      const dot = previous.orientation.reduce((sum,value,j) => sum + value*s.cube.orientation[j], 0);
      near(dot, Math.cos(radians(7.5)));
    }
    vectorNear(s.cube.position,before.position);
    vectorNear(s.cube.orientation,before.orientation);
  }
  s = action(s, 'resetWrist');
  s = joint(joint(s, 'shoulder', 48), 'yaw', -40);
  assert.equal(settle(preset(s, 'open')).won, true);
});

test('crossing 360 follows the chosen direction and a full-turn command checks the tray rim on the way', () => {
  let s = joint(preset(reachCubeWithHand(),'grasp'), 'shoulder', 65);
  s = joint(joint(s,'yaw',-41),'elbow',-88);
  s = wrist(wrist(s, 'pitch', 15), 'roll', 330);
  s = joint(s, 'shoulder', 0);
  const across = turn(s, 35);
  assert.equal(across.wrist.roll, 5);
  const back = turn(across, -35);
  assert.equal(back.wrist.roll, 330);
  vectorNear(back.cube.position, s.cube.position);
  assert.deepEqual(action(s, 'resetWrist').wrist, NEUTRAL_WRIST);
  const blocked = turn(s, -360);
  assert.ok(blocked.wrist.roll < 330 && blocked.wrist.roll > 180);
  assert.equal(blocked.cube.mode, 'held');
  assert.match(blocked.hint, /Angkat lengan/);
  const raised = joint(blocked,'shoulder',65);
  assert.equal(turn(raised,-360).wrist.roll, raised.wrist.roll);
});

test('the middle finger pad clears the tabletop when lowering a tilted pinching hand', () => {
  let s = preset(assembledHand(), 'pinch');
  s = wrist(wrist(s,'pitch',-15),'deviation',5);
  s = joint(s,'elbow',-92);
  s = joint(s,'shoulder',37.6);
  for (const shoulder of [37.5,37.4,37.3,37.2,37.1,37,36.9,36.8]) s = joint(s,'shoulder',shoulder);
  const pose = getPose(s.joints,'hand',s.wrist);
  const pad = [.035696,-.677081,-.144457].map((v,i) => v + HAND_PALM_OFFSET[i] - HAND_WRIST_PIVOT[i]);
  const clearance = pose.pivot[1] + aroundZ(aroundX(pad,radians(15)),radians(5))[1];
  assert.ok(clearance >= 0 && clearance < .012);
  assert.match(s.hint,/Angkat lengan/);
});

test('a steep tilt toward the forearm stops before the hand collides and can be reversed', () => {
  const start = wrist(wrist(preset(assembledHand(),'grasp'), 'roll', 285), 'deviation', 20);
  assert.equal(start.wrist.roll, 285);
  assert.equal(start.wrist.deviation, 20);
  const stopped = wrist(start, 'pitch', 75);
  assert.ok(stopped.wrist.pitch < 75);
  assert.match(stopped.hint, /lengan bawah/);
  const clear = wrist(stopped, 'pitch', 0);
  assert.equal(clear.wrist.pitch, 0);
  const neutral = action(clear,'resetWrist');
  assert.deepEqual(neutral.wrist, NEUTRAL_WRIST);
  assert.equal(turn(neutral, 360).wrist.roll, 0);
});

test('gestures and manual finger travel cannot cross the forearm from a clear wrist pose', () => {
  const tilted = wrist(wrist(wrist(assembledHand(),'roll',345),'deviation',20),'pitch',70);
  assert.deepEqual(tilted.wrist,{roll:345,deviation:20,pitch:70});
  // Closing the grasp brings the thumb into the centered pin at this compound tilt.
  for (const blocked of [preset(tilted,'grasp'), finger(tilted,'middle',90)]) {
    assert.deepEqual(blocked.fingers, tilted.fingers);
    assert.deepEqual(blocked.wrist, tilted.wrist);
    assert.equal(blocked.cube, tilted.cube);
    assert.match(blocked.hint, /Gerak jari terhalang lengan bawah/);
    const clear = action(blocked,'resetWrist');
    assert.deepEqual(preset(clear,'grasp').fingers, HAND_PRESETS.grasp.fingers);
    assert.equal(finger(clear,'middle',90).fingers.middle,90);
  }
});

test('every component is assembled from its own parts before it can be turned or fitted', () => {
  for (const mode of ['gripper', 'hand']) {
    let s = initialState(mode);
    for (let index = 0; index < 6; index++) {
      const steps = buildStepsFor(mode, index);
      assert.ok(steps.length >= 4, 'each component has several parts');
      for (const part of steps) assert.ok(part.name.length > 3 && part.detail.length > 20, 'named and explained');
      assert.equal(step(s, { type:'build' }), s, 'nothing to build before a component is chosen');
      s = pick(s, index);
      assert.equal(s.built, 0);
      assert.match(s.hint, /Bagian 1 dari/);
      const early = step(s, { type:'place', distance:0 });
      assert.equal(early.count, index, 'cannot fit an unassembled component');
      assert.match(early.hint, /Rakit dulu/);
      assert.equal(step(s, { type:'rotate' }).rotation, s.rotation, 'cannot turn it yet either');
      for (let done = 1; done <= steps.length; done++) {
        s = step(s, { type:'build' });
        assert.equal(s.built, done);
        assert.equal(s.count, index);
      }
      assert.equal(step(s, { type:'build' }), s, 'no extra parts');
      while (s.rotation) s = step(s, { type:'rotate' });
      s = step(s, { type:'place', distance:0 });
      assert.equal(s.count, index + 1);
      assert.equal(s.built, 0);
      assert.equal(s.selected, null);
    }
  }
});

test('sub-assembly progress resets with undo, restart, and changing the tool', () => {
  let s = step(step(pick(initialState(), 0), { type:'build' }), { type:'build' });
  assert.equal(s.built, 2);
  assert.equal(step(s, { type:'undo' }).built, 0);
  assert.equal(step(s, { type:'restart' }).built, 0);
  assert.equal(pick(step(s, { type:'undo' }), 0).built, 0);
  let tool = assembled();
  tool = step(tool, { type:'undo' });
  tool = step(pick(tool, 5), { type:'build' });
  assert.equal(tool.built, 1);
  const swapped = step(tool, { type:'robotMode', mode:'hand' });
  assert.equal(swapped.selected, null);
  assert.equal(swapped.built, 0);
});

test('the hand braces against the cube only while the cube is between its fingers', () => {
  assert.equal(handBraces(assembled()), false, 'the gripper never uses the hand pose');
  assert.equal(handBraces(assembledHand()), false, 'far from the cube');
  const around = reachCubeWithHand();
  assert.equal(around.cube.mode, 'rest');
  assert.equal(handBraces(around), true, 'open hand around the resting cube');
  const held = preset(around, 'grasp');
  assert.equal(held.cube.mode, 'held');
  assert.equal(handBraces(joint(held, 'shoulder', 60)), true, 'still braced while carrying');
  let released = preset(joint(held, 'shoulder', 60), 'open');
  assert.equal(released.cube.mode, 'falling');
  assert.equal(handBraces(released), true, 'the cube is still between the fingers as it starts to fall');
  released = settle(released);
  assert.equal(handBraces(released), false, 'the cube has dropped clear of the hand');
  assert.equal(handBraces(joint(around, 'shoulder', 70)), false, 'lifting the open hand away');
});
