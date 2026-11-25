import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HAND_PALM_OFFSET, HAND_PRESETS, HAND_WRIST_PIVOT, wristQuaternion } from '../lib/game.ts';
import { createRoboticHand } from '../lib/handModel.ts';

const open = HAND_PRESETS.open.fingers;
const palmOffset = new THREE.Vector3(...HAND_PALM_OFFSET);

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
          const local = p.clone().sub(palmOffset);
          if (local.x < .17 && local.y > -.35) assert.ok(local.z > -.045, 'palm clearance');
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
  assert.ok(point(rig, 'ThumbTip').sub(palmOffset).z > -.01);
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
  const center = point(rig,'GripCenter');
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

test('the forearm cradle, solid cuff, rotor and heel connect on one centerline', t => {
  const rig = setup(t);
  const mount = node(rig, 'WristMount');
  const cuff = node(rig, 'WristCuff');
  const rotor = node(rig, 'WristRotor');
  const heel = node(rig, 'PalmHeelCenter');
  rig.group.updateMatrixWorld(true);
  const bounds = group => {
    const box = new THREE.Box3();
    for (const mesh of group.children.filter(child => child.isMesh)) {
      mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    return box;
  };
  const fixed = bounds(mount), body = bounds(cuff);
  const center = box => box.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center(fixed).x) < 1e-6 && Math.abs(center(fixed).z) < 1e-6, 'cradle is balanced across the forearm');
  assert.ok(fixed.max.z > .090 && fixed.max.z < .110);
  assert.ok(Math.abs(center(body).x) < 1e-6 && Math.abs(center(body).z) < 1e-6, 'cylindrical cuff shares the axle midpoint');
  assert.ok(fixed.min.y < body.max.y && fixed.max.y > body.max.y, 'upper cradle reaches into the fixed housing');
  // The front faces must be visible from outside, including the closed shoulder above the spindle.
  const seat = cuff.getWorldPosition(new THREE.Vector3());
  for (const axis of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]]) {
    const normal = new THREE.Vector3(...axis);
    const origin = seat.clone().addScaledVector(normal,.18);
    if (axis[1]) origin.x += .02;
    const hit = new THREE.Raycaster(origin,normal.clone().negate()).intersectObject(cuff,true)[0];
    assert.ok(hit && hit.face.normal.dot(normal) > .95, 'cuff outer surface faces the viewer');
    if (axis[1]) assert.ok(hit.point.y > seat.y + .01, 'top shoulder is closed');
    else assert.ok(hit.point.clone().sub(seat).dot(normal) > .080, 'first hit is the outside of the cuff');
  }

  for (let roll = 0; roll <= 360; roll += 15) {
    rig.setWrist({ pitch: 0, deviation: 0, roll });
    rig.group.updateMatrixWorld(true);
    for (const group of [cuff, rotor, heel]) {
      const p = group.getWorldPosition(new THREE.Vector3());
      assert.ok(Math.hypot(p.x,p.z) < 1e-8, group.name + ' must not orbit around the forearm');
    }
    assert.ok(point(rig,'PalmHeelCenter').y < rotor.getWorldPosition(new THREE.Vector3()).y);
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
  const rotorMarker = new THREE.Vector3(0,.075,-.078);
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

test('palm heel and ball socket clear the rotary flange and fixed cuff at maximum tilt', t => {
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
  rig.group.updateMatrixWorld(true);
  const cuff = node(rig,'WristCuff');
  const skirt = samples(cuff).map(p => cuff.localToWorld(p).sub(pivot)).filter(p => {
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

test('universal-joint yokes, cross and palm never intersect across the full flexion and deviation range', t => {
  const rig = setup(t);
  const palmBody = node(rig, 'PalmBody');
  for (const pitch of [-65,-40,-20,0,20,40,60,75]) for (const deviation of [-30,-15,0,10,20]) {
    rig.setWrist({ pitch, deviation, roll: 0 });
    rig.group.updateMatrixWorld(true);
    const rotor = rigidTriangles(rig.rollPivot);
    const cross = rigidTriangles(rig.deviationPivot);
    // The axle pins legitimately pass through the bearing bores of both yokes.
    const offAxle = ({ points }, axis) => points.some(p => {
      const local = rig.deviationPivot.worldToLocal(p.clone());
      return Math.hypot(axis === 'z' ? local.x : local.z, local.y) > .0135;
    });
    const moving = [...rigidTriangles(rig.wristPivot), ...rigidTriangles(palmBody)];
    const hit = (a, b) => a.some(x => b.some(y => x.box.intersectsBox(y.box) &&
      (edgesCross(x.points, y.points) || edgesCross(y.points, x.points))));
    const label = ` at pitch=${pitch} deviation=${deviation}`;
    assert.ok(!hit(rotor.filter(tri => offAxle(tri, 'z')), moving), 'rotor yoke meets the palm side' + label);
    assert.ok(!hit(rotor.filter(tri => offAxle(tri, 'z')), cross.filter(tri => offAxle(tri, 'z'))), 'rotor yoke meets the cross' + label);
    assert.ok(!hit(cross.filter(tri => offAxle(tri, 'x')), moving.filter(tri => offAxle(tri, 'x'))), 'cross meets the palm yoke' + label);
  }
});

test('closing on the cube blends continuously from the free pose into the bracing pose', t => {
  const rig = setup(t);
  const tips = ['ThumbTip', 'IndexTip', 'MiddleTip', 'RingTip', 'LittleTip'];
  const sample = hold => {
    const { fingers, opposition } = HAND_PRESETS.grasp;
    rig.update(fingers, opposition, hold);
    rig.group.updateMatrixWorld(true);
    return tips.map(name => point(rig, name));
  };
  const free = sample(false), held = sample(true);
  sample(0).forEach((p, i) => assert.ok(p.distanceTo(free[i]) < 1e-9, 'hold 0 is the free pose'));
  sample(1).forEach((p, i) => assert.ok(p.distanceTo(held[i]) < 1e-9, 'hold 1 is the bracing pose'));
  assert.ok(free.some((p, i) => p.distanceTo(held[i]) > .01), 'the two poses differ, so a jump would be visible');
  let previous = free;
  const steps = 40;
  for (let k = 1; k <= steps; k++) {
    const now = sample(k / steps);
    now.forEach((p, i) => {
      const total = free[i].distanceTo(held[i]);
      assert.ok(p.distanceTo(previous[i]) < total / steps * 4 + .004, `${tips[i]} jumps at hold=${k / steps}`);
      assert.ok([p.x, p.y, p.z].every(Number.isFinite));
    });
    previous = now;
  }
  // Out-of-range values clamp instead of overshooting.
  sample(-3).forEach((p, i) => assert.ok(p.distanceTo(free[i]) < 1e-9));
  sample(7).forEach((p, i) => assert.ok(p.distanceTo(held[i]) < 1e-9));
});
