import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer as step, initialState, CUBE_SIZE, CUBE_START, TRAY, PARTS, FINGERS, HAND_PRESETS, partsFor, getPose, SNAP_DISTANCE, turnsToAlign } from '../lib/game.ts';

const joint = (s, key, value) => step(s, { type:'joint', key, value });
const action = (s, type) => step(s, { type });
const place = s => step(s, { type:'place', distance:0 });
const select = (s, index) => step(s, { type:'select', index });
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
  let s = joint(assembledHand(), 'yaw', -135);
  s = joint(s, 'elbow', -92);
  return joint(s, 'shoulder', 37);
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
  assert.equal(s.joints.shoulder, 37);
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
    held = joint(held, 'shoulder', 45);
    held = joint(held, 'yaw', -45);
    assert.equal(held.won, false);
    held = preset(held, 'open');
    assert.equal(held.cube.mode, 'falling');
    assert.equal(settle(held).won, true);
  }
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
