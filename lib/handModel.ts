import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { fingers, getFingerHinges, getThumbHinges, thumbLengths } from "./handKinematics.ts";
import { HAND_WRIST_PIVOT, type FingerAngles, type WristAngles } from "./game.ts";

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

  // A through-pin fixes the carrier to the forearm's transverse output boss.
  // The bearing sits on its outboard cheek, directly over the middle of the palm.
  const mount = joint(group,"WristMount");
  const [pivotX,pivotY,pivotZ] = HAND_WRIST_PIVOT;
  const rollPivot = joint(mount,"WristRotor",[pivotX,pivotY,pivotZ]);
  const deviationPivot = joint(rollPivot,"WristGimbal");
  const wristPivot = joint(deviationPivot,"WristArticulation");
  const palm = joint(wristPivot,"PalmBody",[-pivotX,-pivotY,-pivotZ]);
  function turned(parent: THREE.Group, finish: Finish, at: Point, section: Profile) {
    const contour = section.map(([r,y]) => new THREE.Vector2(r,y));
    mesh(parent,track(new THREE.LatheGeometry(contour,48)),finish,at);
  }

  pin(mount,"metal",[0,0,0],.048,.201,"z");
  pin(mount,"frame",[0,0,.092],.071,.014,"z");
  pin(mount,"casing",[0,0,.103],.054,.010,"z");
  pin(mount,"inset",[0,0,.111],.020,.007,"z",true);
  mesh(mount,shape([
    [-.069,.015],[-.057,.047],[-.035,.065],[.006,.069],[.041,.057],
    [.063,.029],[.068,-.006],[.064,-.048],[.049,-.071],
    [-.049,-.071],[-.065,-.040],
  ],.026,.005),"frame",[0,0,-.105]);
  pin(mount,"casing",[0,0,-.122],.054,.011,"z");
  pin(mount,"metal",[0,0,-.131],.033,.009,"z");
  pin(mount,"inset",[0,0,-.137],.013,.005,"z",true);

  // Hollow machined profiles leave a running clearance between the housing and spindle.
  const bearingRise = .020;
  const axis: Point = [pivotX,pivotY+bearingRise,pivotZ];
  const spindle: Point = [0,bearingRise,0];
  turned(mount,"frame",axis,[[.048,.066],[.080,.066],[.085,.071],[.085,.091],[.076,.100],[.047,.100],[.045,.096],[.045,.069],[.048,.066]]);
  turned(mount,"armor",axis,[[.077,.076],[.085,.076],[.086,.079],[.086,.088],[.082,.093],[.077,.093],[.077,.076]]);
  turned(mount,"rubber",axis,[[.048,.062],[.078,.062],[.081,.065],[.081,.067],[.048,.067],[.048,.062]]);
  turned(rollPivot,"metal",spindle,[[.022,.050],[.063,.050],[.070,.054],[.070,.059],[.044,.059],[.044,.089],[.023,.089],[.022,.050]]);
  turned(rollPivot,"frame",spindle,[[.022,.044],[.060,.044],[.064,.047],[.064,.051],[.022,.051],[.022,.044]]);
  // The orange index on the spindle passes the fixed witness mark once per revolution.
  shield(mount,"inset",[pivotX,pivotY+bearingRise+.083,pivotZ-.086],.008,.013,.002);
  shield(rollPivot,"accent",[0,bearingRise+.056,-.070],.017,.008,.003);

  // The rotor fork carries the lateral axis. The cross carries the pitch axle through
  // the pair of cheeks on the palm. The three axes intersect at the bearing centerline.
  const forkEar: Profile = [[-.027,.068],[.027,.068],[.020,.016],[.018,-.006],
    [.010,-.017],[-.007,-.019],[-.019,-.008],[-.020,.013]];
  for (const side of [-1,1]) {
    mesh(rollPivot,shape(forkEar,.012,.0025),"frame",[0,0,side*.047]);
    pin(rollPivot,"metal",[0,0,side*.054],.016,.006,"z");
    pin(rollPivot,"inset",[0,0,side*.058],.007,.0025,"z",true);
  }
  mesh(deviationPivot,track(new THREE.SphereGeometry(.023,20,12)),"metal",[0,0,0]);
  pin(deviationPivot,"metal",[0,0,0],.011,.092,"z");
  pin(deviationPivot,"frame",[0,0,0],.015,.113,"x");
  const lug: Profile = [[-.016,.009],[-.007,.018],[.006,.019],[.017,.010],
    [.017,-.022],[.026,-.056],[-.023,-.056],[-.015,-.023]];
  for (const side of [-1,1]) {
    const cheek = mesh(wristPivot,shape(lug,.012,.0025),"casing",[side*.055,0,0]);
    cheek.rotation.y = Math.PI/2;
    pin(wristPivot,"metal",[side*.062,0,0],.015,.006,"x");
    pin(wristPivot,"inset",[side*.066,0,0],.007,.003,"x",true);
  }
  mesh(wristPivot,shape([[-.060,-.044],[.060,-.044],[.076,-.060],[.082,-.085],[-.077,-.085],[-.074,-.062]],.052,.004),
    "frame",[0,0,-.004]);
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
      shell.castShadow = shell.receiveShadow = !preview;
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

