import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { DEFAULT_JOINTS, HAND_PRESETS, HAND_WRIST_PIVOT } from '../lib/game.ts';
import { createRoboticHand } from '../lib/handModel.ts';
import { handArmClearance } from '../lib/wristClearance.ts';

// A solid cylinder inside the transverse pin of the original forearm GLB.
// A vertex inside it establishes real contact independent of the clearance proxies.
function pinPenetration(rig, groupName) {
  rig.group.updateMatrixWorld(true);
  const p=new Vector3();
  let deepest=-Infinity;
  rig.group.getObjectByName(groupName).traverse(node => {
    if (!node.isMesh) return;
    const positions=node.geometry.getAttribute('position');
    for (let i=0;i<positions.count;i++) {
      p.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);
      deepest=Math.max(deepest,Math.min(.077-Math.hypot(p.x,p.y),.078-Math.abs(p.z)));
    }
  });
  return deepest;
}

test('the open thumb clears the central pin while a closed thumb makes contact at the same compound tilt', t => {
  const {fingers,opposition}=HAND_PRESETS.open;
  const rig=createRoboticHand({angles:fingers,opposition});
  t.after(()=>rig.dispose());
  const pose={pitch:70,deviation:20,roll:345};
  rig.setWrist(pose);
  assert.ok(pinPenetration(rig,'ThumbCMC')<-.005);
  assert.ok(handArmClearance(DEFAULT_JOINTS,pose,HAND_WRIST_PIVOT,fingers,opposition,false)>0);
  const closed=HAND_PRESETS.grasp;
  rig.update(closed.fingers,closed.opposition);
  assert.ok(pinPenetration(rig,'ThumbCMC')>.002);
  assert.ok(handArmClearance(DEFAULT_JOINTS,pose,HAND_WRIST_PIVOT,closed.fingers,closed.opposition,false)<0);

  for (const preset of Object.values(HAND_PRESETS)) {
    for (let roll=0;roll<=360;roll+=2) {
      const clearance=handArmClearance(DEFAULT_JOINTS,{pitch:0,deviation:0,roll},HAND_WRIST_PIVOT,preset.fingers,preset.opposition,false);
      assert.ok(clearance>=0,'a clear neutral bearing must be able to complete its revolution');
    }
  }
});

test('an open palm can bend fully in either direction in front of the centered shaft', t => {
  const pose={pitch:75,deviation:0,roll:0};
  const rig=createRoboticHand({angles:HAND_PRESETS.open.fingers});
  t.after(()=>rig.dispose());
  rig.setWrist(pose);
  const check=(preset)=>handArmClearance(DEFAULT_JOINTS,pose,HAND_WRIST_PIVOT,preset.fingers,preset.opposition,false);
  assert.ok(pinPenetration(rig,'MiddleDIP')<0);
  assert.ok(check(HAND_PRESETS.open)>0);
  const extended={...pose,pitch:-65};
  rig.setWrist(extended);
  assert.ok(pinPenetration(rig,'MiddleDIP')<0);
  assert.ok(handArmClearance(DEFAULT_JOINTS,extended,HAND_WRIST_PIVOT,HAND_PRESETS.open.fingers)>0);
});
