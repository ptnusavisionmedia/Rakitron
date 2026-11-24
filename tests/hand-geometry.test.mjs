import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HAND_PRESETS, HAND_WRIST_PIVOT, wristQuaternion } from '../lib/game.ts';
import { createRoboticHand } from '../lib/handModel.ts';

const open = HAND_PRESETS.open.fingers;

function setup(t) {
  const rig = createRoboticHand({ angles: open });
  t.after(() => rig.dispose());
  return rig;
}

function node(rig, name) {
  const joint = rig.group.getObjectByName(name);
  assert.ok(joint, name);
  return joint;
}

function point(rig, name) {
  return node(rig, name).getWorldPosition(new THREE.Vector3());
}

function apply(rig, preset, held = false) {
  const { fingers, opposition } = HAND_PRESETS[preset];
  rig.update(fingers, opposition, held);
  rig.group.updateMatrixWorld(true);
}

function minCenterlineDistance(a, b) {
  // Include both endpoints and the interior of each physical link.
  const segment = new THREE.Line3(b[0], b[1]);
  const p = new THREE.Vector3(), closest = new THREE.Vector3();
  let min = Infinity;
  for (let link = 1; link < a.length; link++) {
    for (let step = 0; step <= 8; step++) {
      p.lerpVectors(a[link-1], a[link], step/8);
      for (let j = 1; j < b.length; j++) {
        segment.set(b[j-1], b[j]).closestPointToPoint(p, true, closest);
        min = Math.min(min, p.distanceTo(closest));
      }
    }
  }
  return min;
}

function distalPad(rig, name) {
  const mesh = node(rig, name).children.find(child =>
    child.isMesh && child.material.color.getHexString() === '333b36');
  const position = mesh.geometry.getAttribute('position');
  const triangles = [];
  for (let i = 0; i < position.count; i += 3) {
    const vertices = [i, i+1, i+2].map(index =>
      new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld));
    triangles.push(new THREE.Triangle(...vertices));
  }
  return triangles;
}

test('thumb joints remain on their pins and clear the palm and neighboring digit across the controls', t => {
  const rig = setup(t);
  const thumb = ['ThumbCMC', 'ThumbMCP', 'ThumbIP', 'ThumbTip'];
  const index = ['IndexMCP', 'IndexPIP', 'IndexDIP', 'IndexTip'];
  for (let opposition = 0; opposition <= 90; opposition += 10) {
    for (let indexBend = 0; indexBend <= 90; indexBend += 10) {
      let previousTip = null;
      for (let bend = 0; bend <= 90; bend += 2) {
        rig.update({ ...open, thumb: bend, index: indexBend, middle: indexBend }, opposition);
        rig.group.updateMatrixWorld(true);
        const points = thumb.map(id => point(rig, id));
        const last = points[3];
        if (previousTip) assert.ok(last.distanceTo(previousTip) < .025, `continuous thumb sweep at opposition=${opposition}, index=${indexBend}, thumb=${bend}, jump=${last.distanceTo(previousTip)}`);
        previousTip = last;
        for (const joint of ['ThumbMCP', 'ThumbIP']) {
          const q = node(rig, joint).quaternion;
          assert.ok(Math.abs(q.y) < 1e-10 && Math.abs(q.z) < 1e-10, 'single-axis hinge');
        }
        for (const p of points.slice(1)) {
          if (p.x < .17 && p.y > -.35) assert.ok(p.z > -.045, 'palm clearance');
        }
        const finger = index.map(id => point(rig,id));
        assert.ok(minCenterlineDistance(points, finger) > .034, 'thumb crosses the index');
      }
    }
  }
});

test('point keeps the index extended and the folded thumb beside the middle finger', t => {
  const rig = setup(t);
  apply(rig, 'open');
  const extended = point(rig, 'IndexTip');
  const openThumb = point(rig, 'ThumbTip');
  apply(rig, 'point');
  const thumb = point(rig, 'ThumbTip');
  assert.ok(point(rig, 'IndexTip').distanceTo(extended) < 1e-8);
  assert.ok(thumb.x < openThumb.x - .14 && thumb.y > extended.y + .18);
  const sideOfMiddle = new THREE.Line3(point(rig,'MiddlePIP'), point(rig,'MiddleDIP'));
  const nearest = sideOfMiddle.closestPointToPoint(thumb,true,new THREE.Vector3());
  assert.ok(thumb.distanceTo(nearest) < .12);
  assert.ok(thumb.distanceTo(extended) > .25);
  apply(rig, 'grasp');
  assert.ok(point(rig, 'ThumbTip').z > -.01);
  assert.ok(point(rig, 'ThumbMCP').x > .20);
});

test('the opposed rubber tips meet in a precision pinch', t => {
  const rig = setup(t);
  apply(rig, 'pinch');
  assert.ok(point(rig,'ThumbTip').distanceTo(point(rig,'IndexTip')) < .047);
  const indexPad = distalPad(rig, 'IndexDIP');
  const thumbPad = distalPad(rig, 'ThumbIP');
  const closest = new THREE.Vector3();
  const contact = thumbPad.some(triangle => [triangle.a, triangle.b, triangle.c].some(p =>
    indexPad.some(surface => surface.closestPointToPoint(p, closest).distanceTo(p) < .001)));
  assert.ok(contact, 'rubber pad surfaces should meet');
});

test('cube contact stops each supporting finger at the surface in both holds', t => {
  const rig = setup(t);
  const center = new THREE.Vector3(0,-.54,0);
  const v = new THREE.Vector3();
  for (const pose of ['grasp', 'pinch']) {
    apply(rig, pose, true);
    for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
      let min = Infinity;
      node(rig, finger).traverse(mesh => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.getAttribute('position');
        for (let i=0; i<positions.count; i++) {
          v.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).sub(center);
          const separation = Math.max(Math.abs(v.x),Math.abs(v.y),Math.abs(v.z))-.15;
          min = Math.min(min,separation);
        }
      });
      assert.ok(min > -.004, finger + ' passes through cube in ' + pose);
      if (pose === 'grasp' || finger === 'Thumb' || finger === 'Index') assert.ok(min < .003);
    }
  }
});

test('rotor, cross and palm use their own axes throughout a complete revolution', t => {
  const rig = setup(t);
  apply(rig, 'point');
  const mount = node(rig, 'WristMount');
  const socket = mount.matrixWorld.clone();
  const pivot = new THREE.Vector3(...HAND_WRIST_PIVOT);
  const thumb = point(rig,'ThumbTip').sub(pivot);
  const neutralGrip = point(rig,'GripCenter').sub(pivot);
  assert.equal(rig.rollPivot.parent, mount);
  assert.equal(rig.deviationPivot.parent, rig.rollPivot);
  assert.equal(rig.wristPivot.parent, rig.deviationPivot);
  const distal = new THREE.Vector3(0,-1,0);
  const rotorMarker = new THREE.Vector3(0,.076,-.070);
  const up = new THREE.Vector3(0,1,0);
  for (const pitch of [-65,0,75]) for (const deviation of [-30,0,20]) {
    for (let roll=-360; roll<=720; roll+=30) {
      const angles = { pitch, deviation, roll };
      rig.setWrist(angles);
      rig.group.updateMatrixWorld(true);
      const q = new THREE.Quaternion(...wristQuaternion(angles));
      assert.ok(socket.equals(mount.matrixWorld));
      assert.ok(rig.wristPivot.getWorldPosition(new THREE.Vector3()).distanceTo(pivot) < 1e-9);
      const marker = rig.rollPivot.localToWorld(rotorMarker.clone());
      assert.ok(marker.distanceTo(rotorMarker.clone().applyAxisAngle(up,roll*Math.PI/180).add(pivot)) < 1e-9);
      const direction = distal.clone().transformDirection(rig.wristPivot.matrixWorld);
      assert.ok(direction.distanceTo(distal.clone().applyQuaternion(q)) < 1e-9);
      assert.ok(point(rig,'GripCenter').distanceTo(neutralGrip.clone().applyQuaternion(q).add(pivot)) < 1e-9);
      assert.ok(point(rig,'ThumbTip').distanceTo(thumb.clone().applyQuaternion(q).add(pivot)) < 1e-9);
    }
  }
});

test('heel and pitch lugs clear the rotating flange and stationary bearing at maximum tilt', t => {
  const rig = setup(t);
  const pivot = new THREE.Vector3(...HAND_WRIST_PIVOT);
  const samples = group => {
    const points = [];
    for (const mesh of group.children.filter(child => child.isMesh)) {
      const attr = mesh.geometry.getAttribute('position');
      for (let i=0; i<attr.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(attr,i));
    }
    return points;
  };
  const skirt = samples(node(rig,'WristMount')).map(p => p.sub(pivot)).filter(p => {
    const r = Math.hypot(p.x,p.z);
    return r > .073 && r < .088;
  });
  const flange = samples(rig.rollPivot).filter(p => p.y > .035 && Math.hypot(p.x,p.z) > .060);
  const skirtBase = Math.min(...skirt.map(p => p.y));
  const flangeBase = Math.min(...flange.map(p => p.y));
  assert.ok(Number.isFinite(skirtBase) && Number.isFinite(flangeBase));
  for (const part of [rig.wristPivot,node(rig,'PalmBody')]) {
    const verts = samples(part);
    const current = new THREE.Vector3();
    for (const pitch of [-65,-45,0,45,65,75]) for (const deviation of [-30,0,20]) {
      rig.setWrist({pitch,deviation,roll:45});
      rig.group.updateMatrixWorld(true);
      for (const v of verts) {
        current.copy(v).applyMatrix4(part.matrixWorld).sub(pivot);
        const radius = Math.hypot(current.x,current.z);
        if (radius > .048 && radius < .085) assert.ok(current.y < skirtBase, part.name+' touched fixed housing');
        if (radius > .022 && radius < .070) assert.ok(current.y < flangeBase, part.name+' touched rotor flange');
      }
    }
  }
});

function rigidTriangles(group) {
  const triangles = [];
  for (const mesh of group.children.filter(child => child.isMesh)) {
    const position = mesh.geometry.getAttribute('position');
    for (let i=0; i<position.count; i+=3) {
      const points = [i,i+1,i+2].map(k =>
        new THREE.Vector3().fromBufferAttribute(position,k).applyMatrix4(mesh.matrixWorld));
      triangles.push({ points, box: new THREE.Box3().setFromPoints(points) });
    }
  }
  return triangles;
}

function edgesCross(a, b) {
  const ray = new THREE.Ray(), intersection = new THREE.Vector3();
  for (let i=0; i<3; i++) {
    ray.origin.copy(a[i]);
    ray.direction.subVectors(a[(i+1)%3], a[i]);
    const length = ray.direction.length();
    if (!length) continue;
    ray.direction.divideScalar(length);
    if (ray.intersectTriangle(...b, false, intersection) && intersection.distanceTo(ray.origin) <= length) return true;
  }
  return false;
}

test('a fully bent index cannot enter the thumb saddle, including the last part of the slider', t => {
  const rig = setup(t);
  let previous = null;
  for (const bend of [70,78,82,86,90]) {
    rig.update({ ...open, index: bend },0);
    rig.group.updateMatrixWorld(true);
    const saddle = rigidTriangles(node(rig,'ThumbCMC'));
    const fingertip = rigidTriangles(node(rig,'IndexDIP'));
    assert.ok(!saddle.some(a => fingertip.some(b => a.box.intersectsBox(b.box) &&
      (edgesCross(a.points,b.points) || edgesCross(b.points,a.points)))), 'rigid parts intersect at '+bend);
    const next = point(rig,'IndexTip');
    if (previous) assert.ok(next.distanceTo(previous) > .0001, 'the index slider should continue to move');
    previous = next;
  }
});

test('moving a neighboring index or the opposition slider cannot flip a bent thumb', t => {
  const rig = setup(t);
  for (const moving of ['index','opposition']) {
    for (const fixed of [0,20,40,60,80,90]) {
      let previous = null;
      for (let value=0; value<=90; value+=2) {
        const index = moving === 'index' ? value : fixed;
        const opposition = moving === 'opposition' ? value : fixed;
        rig.update({ ...open, thumb: 90, index, middle: index },opposition);
        const next = point(rig, 'ThumbTip');
        if (previous) assert.ok(next.distanceTo(previous) < .025);
        previous = next;
      }
    }
  }
});
