import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer as step, initialState, DEFAULT_JOINTS, HAND_PRESETS, NEUTRAL_WRIST } from '../lib/game.ts';
import { advancePlayback, findMotion, motionsFor, pickAndPlaceFor, startPlayback } from '../lib/motions.ts';

function assembled(mode) {
  let s = initialState(mode);
  if (mode === 'hand') return step(s, { type: 'tryHand' });
  for (let i = 0; i < 6; i++) {
    s = step(s, { type: 'select', index: i });
    for (let part = 0; part < 6; part++) s = step(s, { type: 'build' });
    while (s.rotation) s = step(s, { type: 'rotate' });
    s = step(s, { type: 'place', distance: 0 });
  }
  assert.equal(s.count, 6);
  return s;
}

// Plays a program frame by frame through the real reducer, as the browser hook does.
function play(motion, state, dt = 1/30, onStepEnd) {
  let playback = startPlayback(motion), frames = 0;
  const sounds = [];
  while (playback) {
    const before = playback;
    const result = advancePlayback(playback, state, dt);
    for (const action of result.actions) state = step(state, action);
    if (state.cube.mode === 'falling') state = step(state, { type: 'tick', dt });
    sounds.push(...result.sounds);
    if (onStepEnd && (!result.playback || result.playback.index !== before.index)) onStepEnd(motion.steps[before.index], state, before.index);
    playback = result.playback;
    assert.ok(++frames < 5000, 'program must finish');
  }
  return { state, sounds, seconds: frames * dt };
}

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < .01, `${label}: ${actual} != ${expected}`);
function reached(target, state, label) {
  for (const [key, value] of Object.entries(target.joints ?? {})) near(state.joints[key], value, label + ' joint ' + key);
  for (const [key, value] of Object.entries(target.wrist ?? {})) near(state.wrist[key], value, label + ' wrist ' + key);
  for (const [key, value] of Object.entries(target.fingers ?? {})) near(state.fingers[key], value, label + ' finger ' + key);
  if (target.opposition !== undefined) near(state.opposition, target.opposition, label + ' opposition');
}

for (const mode of ['gripper', 'hand']) {
  test(`${mode}: four motion programs reach every target without being blocked and end at home`, () => {
    const motions = motionsFor(mode);
    assert.equal(motions.length, 4);
    assert.equal(new Set(motions.map(m => m.id)).size, 4);
    for (const motion of motions) {
      assert.equal(motion.mode, mode);
      assert.equal(findMotion(motion.id), motion);
      for (const dt of [1/30, 1/60, .05]) {
        const { state, sounds, seconds } = play(motion, assembled(mode), dt, (done, s, index) => {
          if (done.kind === 'move') reached(done, s, `${motion.id} step ${index}`);
        });
        assert.equal(sounds[0], 'motionStart');
        assert.equal(sounds.at(-1), 'motionEnd');
        assert.ok(seconds > 4 && seconds < 30, motion.id + ' lasts ' + seconds);
        assert.deepEqual(state.joints, DEFAULT_JOINTS, motion.id + ' returns the arm home');
        assert.notEqual(state.cube.mode, 'held');
        if (mode === 'hand') {
          assert.deepEqual(state.wrist, NEUTRAL_WRIST, motion.id + ' leaves the wrist neutral');
          assert.deepEqual(state.fingers, HAND_PRESETS.open.fingers, motion.id + ' leaves the hand open');
          assert.equal(state.opposition, 0);
        }
      }
    }
  });

  test(`${mode}: automatic pick and place delivers the cube from any starting situation`, () => {
    const motion = pickAndPlaceFor(mode);
    let held = false;
    const first = play(motion, assembled(mode), 1/30, (done, s) => { held ||= s.cube.mode === 'held'; });
    assert.ok(held, 'cube was carried');
    assert.equal(first.state.won, true);
    assert.equal(first.state.cube.mode, 'rest');
    assert.deepEqual(first.state.joints, DEFAULT_JOINTS);
    // Run again from the finished state, and from a moved arm with a bent wrist or closed tool.
    assert.equal(play(motion, first.state, 1/60).state.won, true);
    let odd = step(step(assembled(mode), { type: 'joint', key: 'yaw', value: 60 }), { type: 'joint', key: 'shoulder', value: 80 });
    odd = mode === 'hand'
      ? step(step(odd, { type: 'wrist', key: 'roll', value: 200 }), { type: 'handPreset', preset: 'point' })
      : step(odd, { type: 'close' });
    assert.equal(play(motion, odd, .05).state.won, true);
  });
}

test('a program stops asking for moves once it ends, and unknown ids are not found', () => {
  const motion = motionsFor('gripper')[0];
  const done = advancePlayback({ motion, index: motion.steps.length, elapsed: 0, from: null }, assembled('gripper'), 1/30);
  assert.equal(done.playback, null);
  assert.deepEqual(done.actions, []);
  assert.equal(findMotion('nope'), undefined);
});
