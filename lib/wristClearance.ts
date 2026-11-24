import type { FingerAngles, Joints, Vec3, WristAngles } from "./game";
import { fingers, getFingerHinges, getThumbHinges, HAND_PALM_OFFSET, thumbLengths } from "./handKinematics.ts";

type Bounds = readonly [number, number, number, number, number, number];
type Capsule = { from: Vec3; to: Vec3; radius: number };
const degrees = Math.PI / 180;

// Socket-relative extents of the cross pin, the narrowing nose of the boom and its body.
const forearm: Bounds[] = [
  [-.081,-.080,-.090, .079,.080,.090],
  [-.22,-.070,-.123, -.045,.076,.123],
  [-.89,-.128,-.133, -.22,.128,.133],
  [-1.17,-.145,-.144, -.89,.145,.144],
];
const carrierBridge: Bounds = [-.044,-.104,-.092, .044,-.079,.092];
const palm: Capsule[] = [
  { from: [-.133,-.247,-.203], to: [.137,-.247,-.203], radius: .034 },
  { from: [-.117,-.271,-.154], to: [.118,-.271,-.154], radius: .063 },
  { from: [-.116,-.314,-.162], to: [.119,-.314,-.162], radius: .050 },
  { from: [0,-.229,-.151], to: [.122,-.231,-.118], radius: .037 },
  { from: [.134,-.221,-.083], to: [.153,-.211,-.064], radius: .039 },
];
const open: FingerAngles = { thumb: 0, index: 0, middle: 0, ring: 0, little: 0 };

function gap(value: number, min: number, max: number) {
  return value < min ? value-min : value > max ? value-max : 0;
}

// Squared distance to a box is convex along a phalanx. Only overlapping
// broad-phase bounds need a distance calculation near the rounded end of a link.
function clearanceToSection(a: Vec3, b: Vec3, radius: number, box: Bounds) {
  for (let i=0;i<3;i++) {
    if (Math.max(a[i],b[i])+radius < box[i] || Math.min(a[i],b[i])-radius > box[i+3]) return Infinity;
  }
  const dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2];
  let lo=0, hi=1;
  for (let step=0;step<12;step++) {
    const t=(lo+hi)/2;
    const x=gap(a[0]+dx*t,box[0],box[3]);
    const y=gap(a[1]+dy*t,box[1],box[4]);
    const z=gap(a[2]+dz*t,box[2],box[5]);
    if (x*dx+y*dy+z*dz > 0) hi=t;
    else lo=t;
  }
  const t=(lo+hi)/2;
  return Math.hypot(gap(a[0]+dx*t,box[0],box[3]),gap(a[1]+dy*t,box[1],box[4]),
    gap(a[2]+dz*t,box[2],box[5]))-radius;
}

// The wrist carrier stays vertical as the boom tilts. Its round lower face sits
// directly under the pin; an axis-aligned square would catch fingers at empty corners.
function cuffClearance(a: Vec3, b: Vec3, linkRadius: number, pivotY: number) {
  const bottom = pivotY + .082, top = pivotY + .105, radius = .086;
  if (Math.max(a[1],b[1])+linkRadius < bottom || Math.min(a[1],b[1])-linkRadius > top) return Infinity;
  const dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2];
  let low=0, high=1;
  for (let i=0;i<12;i++) {
    const t=(low+high)/2;
    const x=a[0]+dx*t, y=a[1]+dy*t, z=a[2]+dz*t;
    const radial=Math.hypot(x,z);
    const slope=(radial>radius ? (1-radius/radial)*(x*dx+z*dz) : 0) + gap(y,bottom,top)*dy;
    if (slope>0) high=t;
    else low=t;
  }
  const t=(low+high)/2;
  return Math.hypot(Math.max(0,Math.hypot(a[0]+dx*t,a[2]+dz*t)-radius),gap(a[1]+dy*t,bottom,top))-linkRadius;
}

function links(angles: FingerAngles, opposition: number, holding: boolean) {
  const result = [...palm];
  for (const finger of fingers) {
    const h=getFingerHinges(finger,angles[finger.key],holding);
    const joints=[h.mcp,h.mcp+h.pip,h.mcp+h.pip+h.dip];
    let from: Vec3=[finger.x,finger.y,-.208];
    for (const [i,bend] of joints.entries()) {
      const length=finger.lengths[i], along=length*Math.cos(bend);
      const to: Vec3=[from[0]+along*Math.sin(h.splay),from[1]-along*Math.cos(h.splay),from[2]-length*Math.sin(bend)];
      result.push({from,to,radius:finger.width*[.58,.505,.445][i]});
      from=to;
    }
  }
  const h=getThumbHinges(angles.thumb,opposition,holding);
  const yawC=Math.cos(h.yaw), yawS=Math.sin(h.yaw), abdC=Math.cos(h.abduction), abdS=Math.sin(h.abduction);
  const pronC=Math.cos(h.pronation), pronS=Math.sin(h.pronation);
  // The CMC may abduct up to another 30 degrees to clear a neighboring curled digit.
  // Sample the span on bent gestures; an open hand and a supported grasp have a fixed saddle.
  const offsets=(!holding && (angles.thumb>25 || angles.index>25)) ? [0,15*degrees,30*degrees] : [0];
  for (const extra of offsets) {
    const extraC=Math.cos(extra), extraS=Math.sin(extra);
    let from: Vec3=[.153,-.211,-.064];
    for (const [i,bend] of [0,h.mcp,h.mcp+h.ip].entries()) {
      const length=thumbLengths[i], y=-length*Math.cos(bend), z=-length*Math.sin(bend);
      const x1=pronS*z, z1=pronC*z;
      const x2=abdC*x1-abdS*y, y2=abdS*x1+abdC*y;
      const x3=yawC*x2+yawS*z1, z3=-yawS*x2+yawC*z1;
      const to: Vec3=[from[0]+extraC*x3-extraS*y2,from[1]+extraS*x3+extraC*y2,from[2]+z3];
      result.push({from,to,radius:[.045,.045,.039][i]});
      from=to;
    }
  }
  return result;
}

export function handArmClearance(joints: Joints, wrist: WristAngles, pivot: Vec3,
  angles: FingerAngles=open, opposition=0, holding=false): number {
  const angle=(joints.shoulder+joints.elbow)*degrees;
  const alongX=Math.cos(angle), alongY=Math.sin(angle);
  const cy=Math.cos(wrist.roll*degrees), sy=Math.sin(wrist.roll*degrees);
  const cz=Math.cos(wrist.deviation*degrees), sz=Math.sin(wrist.deviation*degrees);
  const cx=Math.cos(wrist.pitch*degrees), sx=Math.sin(wrist.pitch*degrees);
  // Both links share base yaw. Transform each hand point about the real bearing
  // into the forearm's local frame to test its position against the boom.
  function inSocket(point: Vec3): Vec3 {
    const x=point[0]+HAND_PALM_OFFSET[0]-pivot[0];
    const y=point[1]+HAND_PALM_OFFSET[1]-pivot[1];
    const z=point[2]+HAND_PALM_OFFSET[2]-pivot[2];
    const y1=cx*y+sx*z, z1=-sx*y+cx*z;
    const x2=cz*x-sz*y1, y2=sz*x+cz*y1;
    const px=pivot[0]+cy*x2+sy*z1, py=pivot[1]+y2;
    return [px,py,pivot[2]-sy*x2+cy*z1];
  }
  function inBoom([x,y,z]: Vec3): Vec3 {
    return [alongX*x+alongY*y,-alongY*x+alongX*y,z];
  }
  let nearest=Infinity;
  for (const link of links(angles,opposition,holding)) {
    const socketA=inSocket(link.from), socketB=inSocket(link.to);
    nearest=Math.min(nearest,cuffClearance(socketA,socketB,link.radius,pivot[1]),
      clearanceToSection(socketA,socketB,link.radius,carrierBridge));
    const a=inBoom(socketA), b=inBoom(socketB);
    for (const box of forearm) nearest=Math.min(nearest,clearanceToSection(a,b,link.radius,box));
  }
  return nearest;
}
