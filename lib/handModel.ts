import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { fingers, getFingerHinges, getThumbHinges, thumbLengths } from "./handKinematics.ts";
import { HAND_PALM_OFFSET, HAND_WRIST_PIVOT, type FingerAngles, type WristAngles } from "./game.ts";

export type HandAngles = FingerAngles;
type Point = [number, number, number];
type Profile = [number, number][];
export type HandModelProps = {
  angles: HandAngles;
  opposition?: number;
  preview?: boolean;
  highlighted?: boolean;
  holding?: boolean;
};

const DEG = Math.PI / 180;
const DOWN = new THREE.Vector3(0, -1, 0);
/** All dimensions use the arm's model units. Local +Z faces the palm. */
export function createRoboticHand({angles, opposition = 0, preview = false, highlighted = false, holding = false}: HandModelProps) {
  const group = new THREE.Group();
  group.name = "RoboticHand";
  const standard = (color: string, metalness: number, roughness: number) => new THREE.MeshStandardMaterial({
    color, metalness, roughness,
    emissive: highlighted ? "#196544" : "#000000",
    emissiveIntensity: highlighted ? .19 : 0,
  });
  const palette = {
    armor: standard("#f0eadb", .12, .36),
    casing: standard("#cbc9bd", .24, .44),
    frame: standard("#37413d", .55, .36),
    metal: standard("#adb7b0", .73, .30),
    accent: standard("#ed783c", .27, .37),
    rubber: standard("#333b36", .02, .83),
    inset: standard("#1e2925", .25, .53),
  };
  type Finish = keyof typeof palette;
  const ghost = new THREE.MeshBasicMaterial({color: "#6eac91", transparent: true, opacity: .19, depthWrite: false});
  const originals = new Set<THREE.BufferGeometry>();
  const baked = new Set<THREE.BufferGeometry>();
  function track(geometry: THREE.BufferGeometry) {
    originals.add(geometry);
    return geometry;
  }
  function joint(parent: THREE.Group, name: string, at: Point = [0,0,0]) {
    const child = new THREE.Group();
    child.name = name;
    child.position.set(...at);
    parent.add(child);
    return child;
  }
  function shape(points: Profile, thickness: number, bevel = .003) {
    const outline = new THREE.Shape();
    outline.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) outline.lineTo(...points[i]);
    outline.closePath();
    const geom = new THREE.ExtrudeGeometry(outline, {
      depth: thickness, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel,
      bevelSegments: 2, curveSegments: 3, steps: 1,
    });
    geom.translate(0,0,-thickness/2);
    return track(geom);
  }
  const barrel = track(new THREE.CylinderGeometry(1,1,1,20));
  const hex = track(new THREE.CylinderGeometry(1,1,1,6));
  // One chamfered panel profile is used for the three sizes of phalanges.
  const panel = shape([
    [-.38,.5],[.38,.5],[.50,.37],[.45,-.28],[.29,-.5],[-.29,-.5],[-.45,-.28],[-.50,.37],
  ],.84,.07);
  function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, finish: Finish, at: Point, scale: Point = [1,1,1]) {
    const item = new THREE.Mesh(geometry, preview ? ghost : palette[finish]);
    item.position.set(...at);
    item.scale.set(...scale);
    parent.add(item);
    return item;
  }
  function shield(parent: THREE.Group, finish: Finish, at: Point, w: number, h: number, d: number) {
    return mesh(parent, panel, finish, at, [w,h,d]);
  }
  function pin(parent: THREE.Group, finish: Finish, at: Point, r: number, length: number, axis: "x" | "z", screw = false) {
    const p = mesh(parent, screw ? hex : barrel, finish, at, [r,length,r]);
    if (axis === "x") p.rotation.z = Math.PI/2;
    else p.rotation.x = Math.PI/2;
  }

  // Both carrier cheeks pick up the same through axle. Their lower bridge and
  // cartridge are centered on the forearm, with the palm heel directly below.
  const mount = joint(group,"WristMount");
  const [pivotX,pivotY,pivotZ] = HAND_WRIST_PIVOT;
  const rollPivot = joint(mount,"WristRotor",[pivotX,pivotY,pivotZ]);
  const deviationPivot = joint(rollPivot,"WristGimbal");
  const wristPivot = joint(deviationPivot,"WristArticulation");
  const [palmX,palmY,palmZ] = HAND_PALM_OFFSET;
  const palm = joint(wristPivot,"PalmBody",[palmX-pivotX,palmY-pivotY,palmZ-pivotZ]);
  joint(wristPivot,"PalmHeelCenter",[0,-.061,0]);

  function turned(parent: THREE.Group, finish: Finish, at: Point, section: Profile) {
    const contour = section.map(([r,y]) => new THREE.Vector2(r,y));
    // An outward-facing closed lathe has its outside wall running toward +Y.
    if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
    mesh(parent,track(new THREE.LatheGeometry(contour,48)),finish,at);
  }

  const halfCheek: Profile = [[.028,.077],[.053,.065],[.074,.041],[.082,.012],
    [.081,-.020],[.071,-.045],[.048,-.074],[.042,-.098],[.031,-.104]];
  const cheekOutline: Profile = [...halfCheek,...halfCheek.slice().reverse().map(([x,y]): [number,number] => [-x,y])];
  pin(mount,"metal",[0,0,0],.035,.188,"z");
  for (const side of [-1,1]) {
    mesh(mount,shape(cheekOutline,.011,.003),"casing",[0,0,side*.091]);
    pin(mount,"frame",[0,0,side*.098],.043,.004,"z");
    pin(mount,"metal",[0,0,side*.101],.034,.004,"z");
    pin(mount,"inset",[0,0,side*.104],.010,.002,"z",true);
  }
  // This bridge spans BOTH cheeks underneath the forearm output bearing.
  mesh(mount,shape([[-.041,-.085],[-.030,-.081],[.030,-.081],[.041,-.085],
    [.041,-.097],[.034,-.101],[-.034,-.101],[-.041,-.097]],.177,.003),"casing",[0,0,0]);

  const cuff = joint(mount,"WristCuff",[pivotX,pivotY+.089,pivotZ]);
  // Solid housing with a closed upper face and a narrow spindle running fit.
  turned(cuff,"casing",[0,0,0],[[.001,.016],[.072,.016],[.080,.013],[.086,.007],
    [.086,-.001],[.082,-.005],[.048,-.005],[.046,.003],[.001,.003],[.001,.016]]);
  turned(cuff,"frame",[0,0,0],[[.047,-.007],[.079,-.007],[.082,-.004],[.082,-.002],
    [.078,.001],[.047,.001],[.047,-.007]]);
  turned(rollPivot,"metal",[0,0,0],[[.034,.070],[.071,.070],[.078,.074],[.078,.078],
    [.074,.080],[.045,.080],[.045,.092],[.034,.092],[.034,.070]]);
  shield(rollPivot,"accent",[0,.075,-.078],.013,.004,.002);
  // A sealed rotary spindle feeds the gimbal core. The lower ball socket is
  // part of the palm and pivots on the same point as both tilt axes.
  turned(rollPivot,"frame",[0,0,0],[[.001,.032],[.035,.032],[.037,.037],[.038,.050],
    [.047,.062],[.063,.069],[.063,.073],[.001,.073],[.001,.032]]);
  mesh(deviationPivot,track(new THREE.SphereGeometry(.051,32,22)),"metal",[0,0,0]);
  turned(wristPivot,"frame",[0,0,0],[[.027,-.045],[.039,-.034],[.048,-.022],[.053,-.006],
    [.053,.003],[.056,.004],[.060,-.001],[.059,-.014],[.052,-.033],[.042,-.044],
    [.030,-.052],[.024,-.050],[.027,-.045]]);
  for (const side of [-1,1]) {
    pin(wristPivot,"casing",[side*.057,-.009,0],.016,.006,"x");
    pin(wristPivot,"inset",[side*.061,-.009,0],.006,.002,"x",true);
  }
  mesh(wristPivot,shape([[-.031,-.042],[.031,-.042],[.042,-.053],[.072,-.059],
    [.079,-.069],[.074,-.081],[-.074,-.081],[-.079,-.069],[-.072,-.059],[-.042,-.053]],.061,.004),
    "frame",[0,0,0]);
  mesh(palm,shape([
    [-.060,-.212],[.060,-.212],[.120,-.213],[.161,-.231],[.167,-.282],[.148,-.331],
    [.072,-.354],[-.046,-.358],[-.138,-.339],[-.174,-.304],[-.172,-.251],[-.141,-.223],
  ],.087,.009),"frame",[0,0,-.152]);
  // Split dorsal armor and a recessed center spine leave the knuckle bearings exposed.
  mesh(palm,shape([
    [-.103,-.223],[-.014,-.214],[-.014,-.262],[-.052,-.299],[-.141,-.302],
    [-.158,-.278],[-.153,-.244],[-.135,-.230],
  ],.020,.006),"armor",[0,0,-.207]);
  mesh(palm,shape([
    [.003,-.213],[.073,-.213],[.111,-.223],[.144,-.238],[.153,-.254],
    [.132,-.294],[.054,-.302],[.003,-.260],
  ],.020,.006),"armor",[0,0,-.207]);
  shield(palm,"accent",[-.005,-.240,-.210],.008,.047,.007);
  for (const x of [-.127,.119]) {
    pin(palm,"metal",[x,-.251,-.223],.015,.008,"z");
    pin(palm,"inset",[x,-.251,-.229],.006,.003,"z",true);
  }
  for (const x of [-.086,.081]) {
    const slot = shield(palm,"inset",[x,-.275,-.225],.047,.007,.003);
    slot.rotation.z = x > 0 ? .22 : -.22;
  }
  // The palmar pads form separate thenar and hypothenar contact surfaces.
  mesh(palm,shape([
    [-.139,-.242],[-.099,-.229],[-.054,-.230],[-.033,-.244],[-.068,-.282],
    [-.128,-.285],[-.153,-.259],
  ],.017,.006),"rubber",[0,0,-.102]);
  mesh(palm,shape([
    [.067,-.225],[.119,-.228],[.148,-.239],[.127,-.253],[.074,-.278],
    [.026,-.248],[.029,-.225],
  ],.022,.006),"rubber",[0,0,-.102]);
  for (const data of fingers) {
    shield(palm,"casing",[data.x,data.y+.039,-.193],data.width*.90,.058,.047);
  }

  function phalanx(parent: THREE.Group, width: number, length: number, distal: boolean, accentPin: boolean) {
    const depth = width*.83;
    const radius = width*.43;
    pin(parent,"frame",[0,0,0],radius,width*1.02,"x");
    for (const side of [-1,1]) {
      pin(parent,accentPin ? "accent" : "metal",[side*width*.49,0,0],radius*.81,width*.13,"x");
      pin(parent,"inset",[side*width*.565,0,0],radius*.36,width*.035,"x",true);
    }
    shield(parent,"frame",[0,-length*.53,0],width*.84,length*.91,depth*.92);
    shield(parent,"armor",[0,-length*.51,-depth*.31],width*.87,length*.71,depth*.49);
    shield(parent,"rubber",[0,-length*(distal ? .60 : .53),depth*.36],width*.78,length*(distal ? .79 : .68),depth*.46);
    if (distal) {
      shield(parent,"rubber",[0,-length*.87,.003],width*.73,length*.29,depth*.78);
    }
  }

  const digits = fingers.map(data => {
    const finger = joint(palm, data.name, [data.x,data.y,-.208]);
    const mcp = joint(finger, data.name+"MCP");
    const pip = joint(mcp, data.name+"PIP", [0,-data.lengths[0],0]);
    const dip = joint(pip, data.name+"DIP", [0,-data.lengths[1],0]);
    phalanx(mcp,data.width,data.lengths[0],false,true);
    phalanx(pip,data.width*.87,data.lengths[1],false,false);
    phalanx(dip,data.width*.76,data.lengths[2],true,false);
    joint(dip,data.name+"Tip",[0,-data.lengths[2],0]);
    joint(dip,data.name+"Pad",[0,-data.lengths[2]+.015,data.width*.76*.83*.59]);
    return {data,finger,mcp,pip,dip,hinges:[mcp,pip,dip]};
  });

  // A raised boss ties the thumb socket into the radial edge of the backplate.
  mesh(palm,shape([[.087,-.226],[.119,-.205],[.141,-.196],[.153,-.200],
    [.163,-.215],[.153,-.234],[.121,-.245],[.097,-.241]],.032,.0035),"frame",[0,0,-.092]);
  const thumb = joint(palm,"Thumb",[.153,-.211,-.064]);
  const cmc = joint(thumb,"ThumbCMC");
  const thumbMcp = joint(cmc,"ThumbMCP",[0,-thumbLengths[0],0]);
  const ip = joint(thumbMcp,"ThumbIP",[0,-thumbLengths[1],0]);
  const thumbJoints = [cmc,thumbMcp,ip];
  // A short metacarpal yoke seats the saddle into the radial edge of the palm.
  mesh(thumb,track(new THREE.SphereGeometry(.039,16,12)),"frame",[0,0,0]);
  shield(cmc,"casing",[.010,-.065,0],.080,.105,.058);
  pin(cmc,"accent",[.044,0,0],.035,.015,"x");
  pin(cmc,"metal",[.053,0,0],.023,.006,"x");
  phalanx(thumbMcp,.080,thumbLengths[1],false,true);
  phalanx(ip,.072,thumbLengths[2],true,false);
  // The thumb has a wider, rounded contact pad for fingertip-to-fingertip opposition.
  mesh(ip,track(new THREE.SphereGeometry(1,18,12)),"rubber",[0,-.101,.010],[.032,.026,.024]);
  joint(ip,"ThumbTip",[0,-thumbLengths[2],0]);
  joint(ip,"ThumbPad",[0,-thumbLengths[2]+.015,.019]);
  joint(palm,"GripCenter",[0,-.54,0]);

  // Merge rigid pieces per joint and finish, leaving only the articulated groups movable.
  // The table shadow map cannot resolve the clearances between the cuff and spindle.
  // Keep their projected shadows and use material lighting on these small surfaces.
  const wristHardware = new Set([mount,cuff,rollPivot,deviationPivot,wristPivot]);
  const assemblies: THREE.Group[] = [];
  group.traverse(o => { if (o instanceof THREE.Group) assemblies.push(o); });
  for (const assembly of assemblies) {
    const byMaterial = new Map<THREE.Material,THREE.BufferGeometry[]>();
    for (const piece of [...assembly.children]) {
      if (!(piece instanceof THREE.Mesh)) continue;
      piece.updateMatrix();
      const g = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
      g.applyMatrix4(piece.matrix);
      g.deleteAttribute("uv");
      const list = byMaterial.get(piece.material) ?? [];
      list.push(g);
      byMaterial.set(piece.material,list);
      assembly.remove(piece);
    }
    for (const [material,pieces] of byMaterial) {
      const geometry = mergeGeometries(pieces)!;
      pieces.forEach(p => p.dispose());
      baked.add(geometry);
      const shell = new THREE.Mesh(geometry,material);
      shell.castShadow = !preview;
      shell.receiveShadow = !preview && !wristHardware.has(assembly);
      if (preview) shell.raycast = () => {};
      assembly.add(shell);
    }
  }
  originals.forEach(g => g.dispose());

  const yawAxis = new THREE.Vector3(0,1,0);
  const outwardAxis = new THREE.Vector3(0,0,1);
  const cmcOrientation = new THREE.Quaternion(), turn = new THREE.Quaternion();
  const chainRotation = new THREE.Quaternion();
  const chain = () => Array.from({length:4}, () => new THREE.Vector3());
  const thumbPoints = chain();
  const neighborPoints = digits.slice(0,2).map(chain);
  const probe = new THREE.Vector3();
  const edge = new THREE.Vector3();

  function jointPositions(origin: THREE.Group, hinges: THREE.Group[], lengths: readonly number[], points: THREE.Vector3[]) {
    points[0].copy(origin.position);
    chainRotation.copy(origin.quaternion);
    for (let i=0; i<hinges.length; i++) {
      chainRotation.multiply(hinges[i].quaternion);
      points[i+1].copy(DOWN).applyQuaternion(chainRotation).multiplyScalar(lengths[i]).add(points[i]);
    }
  }

  function setAbduction(extra: number) {
    cmc.quaternion.setFromAxisAngle(outwardAxis,extra*DEG).multiply(cmcOrientation);
  }

  // Keep the thumb on the radial side of nearby index/middle links. A smooth
  // parabolic envelope stays continuous even as a fingertip crosses in projection.
  function touchesNeighbor() {
    jointPositions(thumb,thumbJoints,thumbLengths,thumbPoints);
    for (let i=0;i<3;i++) {
      for (let step = i === 0 ? 3 : 0; step <= 8; step++) {
        probe.lerpVectors(thumbPoints[i],thumbPoints[i+1],step/8);
        for (const points of neighborPoints) {
          for (let j=0;j<3;j++) {
            const start = points[j];
            const radius = i===2 && j===2 ? .034 : .049;
            edge.subVectors(points[j+1],start);
            const dy = probe.y-start.y, dz = probe.z-start.z;
            const span = .12*edge.y*edge.y+edge.z*edge.z;
            const along = THREE.MathUtils.clamp((.12*dy*edge.y+dz*edge.z+radius*edge.x)/Math.max(span,1e-12),0,1);
            const y = dy-along*edge.y, z = dz-along*edge.z;
            const limit = start.x+along*edge.x+radius-(.12*y*y+z*z)/(2*radius);
            if (probe.x<limit) return true;
          }
        }
      }
    }
    return false;
  }

  function update(values: HandAngles, thumbOpposition = 0, carriesCube = false) {
    for (const {data,finger,mcp,pip,dip} of digits) {
      const angles = getFingerHinges(data,values[data.key],carriesCube);
      finger.rotation.z = angles.splay;
      mcp.rotation.x = angles.mcp;
      pip.rotation.x = angles.pip;
      dip.rotation.x = angles.dip;
    }
    const thumbAngles = getThumbHinges(values.thumb,thumbOpposition,carriesCube);
    cmcOrientation.setFromAxisAngle(yawAxis,thumbAngles.yaw)
      .multiply(turn.setFromAxisAngle(outwardAxis,thumbAngles.abduction))
      .multiply(turn.setFromAxisAngle(yawAxis,thumbAngles.pronation));
    thumbMcp.rotation.x = thumbAngles.mcp;
    ip.rotation.x = thumbAngles.ip;
    setAbduction(0);

    if (!carriesCube) {
      for (const [i,points] of neighborPoints.entries()) {
        const digit = digits[i];
        jointPositions(digit.finger,digit.hinges,digit.data.lengths,points);
      }
      if (touchesNeighbor()) {
        // Let the saddle open just enough to accommodate the other digits.
        let blocked = 0, clear = 30;
        for (let step=0; step<10; step++) {
          const angle = (blocked+clear)/2;
          setAbduction(angle);
          if (touchesNeighbor()) blocked=angle;
          else clear=angle;
        }
        setAbduction(clear);
      }
    }
  }
  update(angles,opposition,holding);
  return {
    group, rollPivot, deviationPivot, wristPivot, update,
    setWrist({roll,deviation,pitch}: WristAngles) {
      rollPivot.rotation.y = roll*DEG;
      deviationPivot.rotation.z = deviation*DEG;
      wristPivot.rotation.x = -pitch*DEG;
    },
    setHighlighted(enabled: boolean) {
      for (const material of Object.values(palette)) {
        material.emissive.set(enabled ? "#196544" : "#000000");
        material.emissiveIntensity = enabled ? .19 : 0;
      }
    },
    dispose() {
      baked.forEach(g => g.dispose());
      Object.values(palette).forEach(material => material.dispose());
      ghost.dispose();
    },
  };
}

