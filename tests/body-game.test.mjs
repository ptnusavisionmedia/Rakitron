import assert from "node:assert/strict";
import test from "node:test";
import {
  BODY_ANCHORS, BODY_GREETING, BODY_JOINT_LIMITS, BODY_NEUTRAL, BODY_PARTS, BODY_SNAP_DISTANCE,
  bodyInitialState, bodyReducer,
} from "../lib/bodyGame.ts";

const act = (state, type, fields = {}) => bodyReducer(state, { type, ...fields });
const select = (state, index) => act(state, "select", { index });
const pose = (state, joint, value) => act(state, "pose", { joint, value });

function build(state) {
  const steps = BODY_PARTS[state.selected].steps;
  for (let i = state.built; i < steps.length; i++) state = act(state, "build", { step: i });
  return state;
}
function fitted(state, index = state.count) {
  state = build(select(state, index));
  while (state.rotation) state = act(state, "rotate");
  return act(state, "place", { index, distance: 0 });
}

test("body sockets distinguish left and right; each of the six complete modules fits only its aligned target", () => {
  assert.deepEqual(BODY_PARTS.map(p => p.id), ["right-leg", "left-leg", "torso", "right-arm", "left-arm", "head"]);
  for (const limb of ["leg", "arm"]) {
    const [rx, ry, rz] = BODY_ANCHORS["right-" + limb], [lx, ly, lz] = BODY_ANCHORS["left-" + limb];
    assert.ok(rx < 0 && lx === -rx);
    assert.deepEqual([ry, rz], [ly, lz]);
  }
  let s = bodyInitialState();
  for (const [index, part] of BODY_PARTS.entries()) {
    assert.equal(part.steps.length, 4);
    s = select(s, index);
    const unfinished = act(s, "place", { index });
    assert.equal(unfinished.count, index);
    assert.equal(act(s, "rotate").rotation, part.initialRotation);
    s = build(s);
    assert.equal(s.built, 4);
    const wrongSocket = (index + 1) % BODY_PARTS.length;
    assert.equal(act(s, "place", { index: wrongSocket }).count, index);
    if (s.rotation) {
      assert.equal(act(s, "place", { index }).count, index);
      s = act(s, "rotate");
      assert.equal(s.rotation, 0);
    }
    for (const badDistance of [NaN, Infinity, -.01, BODY_SNAP_DISTANCE + .001]) {
      const failed = act(s, "place", { index, distance: badDistance });
      assert.equal(failed.count, index);
      assert.equal(failed.selected, index);
      assert.equal(failed.built, 4);
    }
    s = act(s, "place", { index, distance: BODY_SNAP_DISTANCE });
    assert.equal(s.count, index + 1);
    assert.equal(s.selected, null);
    assert.equal(s.built, 0);
    assert.equal(act(s, "place", { index }).count, s.count);
    assert.equal(select(s, index), s);
  }
  assert.equal(s.won, false);
  assert.deepEqual(s.pose, BODY_NEUTRAL);
});

test("previewing another module and retrying the wrong side do not lose completed subassembly work", () => {
  let s = select(bodyInitialState(), 1);
  s = act(s, "build", { step: 0 });
  s = act(s, "build", { step: 1 });
  assert.equal(act(s, "build", { step: 1 }), s);
  s = select(s, 0);
  s = act(s, "build", { step: 0 });
  assert.equal(select(s, 1).built, 2);
  s = build(select(s, 1));
  s = act(s, "rotate");
  s = act(s, "place", { index: 0, distance: 0 });
  assert.equal(s.count, 0);
  assert.match(s.hint, /kaki kanan/i);
  assert.equal(select(s, 0).built, 1);
  s = fitted(s, 0);
  s = select(s, 1);
  assert.equal(s.built, 4);
  assert.equal(s.rotation, 0);
  s = act(s, "place", { index: 1 });
  assert.equal(s.count, 2);
  for (const index of [NaN, .2, -2, 7]) assert.equal(select(s, index), s);
});

test("installed joints become available in order, stay within bounds, and return to neutral for assembly", () => {
  let s = bodyInitialState();
  for (let count = 0; count <= BODY_PARTS.length; count++) {
    for (const [key, { min, max, requires }] of Object.entries(BODY_JOINT_LIMITS)) {
      if (count < requires) assert.equal(pose(s, key, max), s);
      else {
        assert.equal(pose(s, key, 999).pose[key], max);
        assert.equal(pose(s, key, -999).pose[key], min);
        assert.equal(pose(s, key, Infinity), s);
      }
    }
    if (count < BODY_PARTS.length) s = fitted(s);
  }
  assert.equal(pose(s, "invalid", 7), s);
  let partial = act(s, "undo");
  partial = pose(partial, "torso", 25);
  assert.equal(partial.pose.torso, 25);
  assert.deepEqual(select(partial, partial.count).pose, BODY_NEUTRAL);
});

test("the greeting needs the correct arm and head after assembly, and still allows free movement afterwards", () => {
  let s = act(bodyInitialState(), "ready");
  assert.equal(s.count, BODY_PARTS.length);
  assert.deepEqual(s.buildProgress, [4,4,4,4,4,4]);
  assert.deepEqual(s.pose, BODY_NEUTRAL);
  assert.equal(s.won, false);

  s = pose(s, "leftArm", 100);
  s = pose(s, "head", 30);
  assert.equal(s.won, false);
  s = pose(s, "rightArm", BODY_GREETING.rightArm);
  assert.equal(s.won, false);
  s = pose(s, "head", -40);
  s = pose(s, "leftArm", BODY_GREETING.leftArm);
  assert.equal(s.won, false);
  s = pose(s, "head", BODY_GREETING.head);
  assert.equal(s.won, true);
  assert.equal(pose(s, "leftKnee", 21).pose.leftKnee, 21);
  assert.equal(act(s, "resetPose").won, true);
  assert.deepEqual(act(s, "resetPose").pose, BODY_NEUTRAL);

  const detached = act(s, "undo");
  assert.equal(detached.count, 5);
  assert.equal(detached.won, false);
  assert.equal(select(detached, 5).built, 4);
  assert.equal(fitted(detached).count, 6);
  assert.deepEqual(act(s, "restart"), bodyInitialState());
});
