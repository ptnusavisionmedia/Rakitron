import assert from "node:assert/strict";
import test from "node:test";
import { Vector3, Box3, Quaternion } from "three";
import { BODY_ANCHORS, BODY_NEUTRAL } from "../lib/bodyGame.ts";
import { createBodyModel } from "../lib/bodyModel.ts";

const point=(model,name)=>model.group.getObjectByName(name).getWorldPosition(new Vector3());
function set(model,changes={}) {
  model.setPose({...BODY_NEUTRAL,...changes});
  model.group.updateMatrixWorld(true);
}
function close(a,b,epsilon=1e-7) { assert.ok(a.distanceTo(b)<epsilon, `${a.toArray()} and ${b.toArray()}`); }

test("the six anatomical modules expose four real assembly layers each and dock at their matching connectors", t=>{
  const model=createBodyModel(); t.after(()=>model.dispose()); set(model);
  assert.equal(model.group.children.length,6);
  for(const [id,module] of Object.entries(model.parts)) {
    assert.equal(module.name,id);
    close(module.position,new Vector3(...BODY_ANCHORS[id]));
    const stages=new Set();
    module.traverse(node=>{
      if(!node.isMesh) return;
      stages.add(node.userData.assemblyStage);
      assert.ok(node.geometry.getAttribute("position").count>0);
    });
    assert.deepEqual([...stages].sort(),[0,1,2,3]);
  }
  const bounds=new Box3().setFromObject(model.group,true);
  assert.ok(bounds.min.y>=-1e-4 && bounds.min.y<.003);
  assert.ok(bounds.max.y>2.4 && bounds.max.y<2.6);
  assert.ok(point(model,"OpticalAxis").z>0);
  for(const side of ["Right","Left"]) {
    const tips=["Thumb","Index","Middle","Ring","Little"].map(name=>point(model,side+name+"Tip"));
    for(const [i,tip] of tips.entries()) {
      for(const prev of tips.slice(0,i)) assert.ok(tip.distanceTo(prev)>.017);
    }
  }
});

test("lifting the right hand leaves the left hand at rest; head and shoulders follow the torso", t=>{
  const model=createBodyModel(); t.after(()=>model.dispose()); set(model);
  const head=point(model,"OpticalAxis"), right=point(model,"RightMiddleTip"), left=point(model,"LeftMiddleTip");
  assert.ok(right.x<0 && left.x>0);
  set(model,{rightArm:100,head:55});
  assert.ok(point(model,"RightMiddleTip").y>point(model,"RightShoulder").y+.3);
  close(point(model,"LeftMiddleTip"),left);
  assert.ok(point(model,"OpticalAxis").x<head.x-.07);
  set(model,{torso:25});
  const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-25*Math.PI/180);
  close(point(model,"LeftMiddleTip"),left.clone().applyQuaternion(yaw));
  close(point(model,"RightMiddleTip"),right.clone().applyQuaternion(yaw));
  close(point(model,"OpticalAxis"),head.clone().applyQuaternion(yaw));
  set(model); close(point(model,"RightMiddleTip"),right);
});

test("knees flex independently, keep the sole level, and lower the torso when both legs bend", t=>{
  const model=createBodyModel(); t.after(()=>model.dispose()); set(model);
  const start=point(model,"OpticalAxis");
  for(const [rightKnee,leftKnee] of [[35,0],[0,35],[35,35],[10,25]]) {
    set(model,{rightKnee,leftKnee});
    const right=point(model,"RightSole"), left=point(model,"LeftSole");
    assert.ok(Math.min(left.y,right.y)>-.00001 && Math.min(left.y,right.y)<.00001);
    if(rightKnee>leftKnee) assert.ok(right.y>left.y+.015);
    if(leftKnee>rightKnee) assert.ok(left.y>right.y+.012);
    for(const side of ["Right","Left"]) {
      const normal=new Vector3(0,1,0).applyQuaternion(model.joints[side+"Ankle"].getWorldQuaternion(new Quaternion()));
      close(normal,new Vector3(0,1,0));
    }
    if(rightKnee===35 && leftKnee===35) assert.ok(point(model,"OpticalAxis").y<start.y-.035);
  }
});
