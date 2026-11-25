import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { BODY_NEUTRAL } from "../lib/bodyGame.ts";
import { createBodyModel } from "../lib/bodyModel.ts";

test("relaxed humanoid arms reach the thigh and the two five-fingered hands mirror one another", t => {
  const model = createBodyModel();
  t.after(() => model.dispose());
  model.setPose(BODY_NEUTRAL);
  model.group.updateMatrixWorld(true);
  const point = name => model.group.getObjectByName(name).getWorldPosition(new Vector3());

  for (const side of ["Left", "Right"]) {
    const at = name => point(side + name);
    const hip = at("Hip"), knee = at("Knee"), wrist = at("Wrist");
    const thumb = at("ThumbTip"), index = at("IndexTip"), middle = at("MiddleTip");
    const ring = at("RingTip"), little = at("LittleTip");
    const thighLength = hip.y - knee.y;
    const reach = (hip.y - middle.y) / thighLength;
    assert.ok(reach > .32 && reach < .70, side + " hand should rest partway down the thigh");
    assert.ok(thumb.distanceTo(index) < thumb.distanceTo(little), side + " thumb should oppose the index");
    assert.ok(wrist.distanceTo(middle) > wrist.distanceTo(index));
    assert.ok(wrist.distanceTo(middle) > wrist.distanceTo(ring));
    assert.ok(wrist.distanceTo(little) < wrist.distanceTo(index));
  }

  for (const finger of ["Thumb", "Index", "Middle", "Ring", "Little"]) {
    const left = point("Left" + finger + "Tip");
    left.x = -left.x;
    assert.ok(left.distanceTo(point("Right" + finger + "Tip")) < 1e-5, finger + " should mirror across the body");
  }
});

test("the greeting presents the active palm to the front while the resting palm faces the thigh", t => {
  const model = createBodyModel();
  t.after(() => model.dispose());
  const palm = side => new Vector3(0, 0, -1).transformDirection(model.joints[side + "Wrist"].matrixWorld);

  for (const [moving, resting, restingInward] of [["Right", "Left", -1], ["Left", "Right", 1]]) {
    model.setPose({ ...BODY_NEUTRAL, [moving === "Right" ? "rightArm" : "leftArm"]: 85 });
    model.group.updateMatrixWorld(true);
    assert.ok(palm(moving).z > .9, moving + " raised palm should face forward");
    assert.ok(palm(resting).x * restingInward > .7, resting + " relaxed palm should face inward");
  }
});
