import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { FingerAngles } from "./game";

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
const fingers = [
  { key: "index", name: "Index", x: .122, y: -.326, splay: 6.5, width: .070, lengths: [.137,.101,.073] },
  { key: "middle", name: "Middle", x: .042, y: -.344, splay: 1.5, width: .074, lengths: [.146,.109,.081] },
  { key: "ring", name: "Ring", x: -.043, y: -.337, splay: -3, width: .069, lengths: [.140,.101,.075] },
  { key: "little", name: "Little", x: -.121, y: -.315, splay: -9, width: .060, lengths: [.111,.080,.062] },
] as const;
const thumbLengths = [.145,.160,.132];
const clampAngle = (value: number) => THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 90);

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

  pin(group,"frame",[0,.003,0],.089,.218,"z");
  for (const side of [-1,1]) {
    pin(group,"accent",[0,.003,side*.109],.079,.018,"z");
    pin(group,"metal",[0,.003,side*.121],.053,.014,"z");
    pin(group,"inset",[0,.003,side*.130],.023,.004,"z",true);
  }
  const wrist = shield(group,"frame",[0,-.075,-.064],.155,.185,.133);
  wrist.rotation.x = .68;
  shield(group,"casing",[0,-.107,-.111],.184,.085,.123);
  mesh(group,shape([
    [-.106,-.102],[.087,-.102],[.141,-.130],[.176,-.191],[.167,-.282],[.148,-.331],
    [.072,-.354],[-.046,-.358],[-.138,-.339],[-.174,-.304],[-.18,-.225],[-.161,-.155],
  ],.087,.009),"frame",[0,0,-.152]);
  // Split dorsal armor and a recessed center spine leave the knuckle bearings exposed.
  mesh(group,shape([
    [-.105,-.119],[-.014,-.113],[-.014,-.262],[-.052,-.299],[-.141,-.302],
    [-.158,-.278],[-.164,-.205],[-.145,-.154],
  ],.020,.006),"armor",[0,0,-.207]);
  mesh(group,shape([
    [.003,-.115],[.080,-.118],[.125,-.139],[.150,-.184],[.153,-.254],
    [.132,-.294],[.054,-.302],[.003,-.260],
  ],.020,.006),"armor",[0,0,-.207]);
  shield(group,"accent",[-.005,-.199,-.210],.011,.119,.010);
  for (const x of [-.127,.119]) {
    pin(group,"metal",[x,-.174,-.223],.015,.008,"z");
    pin(group,"inset",[x,-.174,-.229],.006,.003,"z",true);
  }
  for (const x of [-.086,.081]) {
    const slot = shield(group,"inset",[x,-.275,-.225],.047,.007,.003);
    slot.rotation.z = x > 0 ? .22 : -.22;
  }
  // The palmar pads form separate thenar and hypothenar contact surfaces.
  mesh(group,shape([
    [-.139,-.167],[-.099,-.144],[-.054,-.170],[-.033,-.231],[-.068,-.282],
    [-.128,-.285],[-.153,-.249],
  ],.017,.008),"rubber",[0,0,-.093]);
  mesh(group,shape([
    [.067,-.147],[.123,-.151],[.152,-.196],[.127,-.246],[.074,-.278],
    [.026,-.248],[.029,-.190],
  ],.022,.008),"rubber",[0,0,-.091]);
  for (const data of fingers) {
    shield(group,"casing",[data.x,data.y+.039,-.193],data.width*.90,.058,.047);
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
    const finger = joint(group, data.name, [data.x,data.y,-.208]);
    const mcp = joint(finger, data.name+"MCP");
    const pip = joint(mcp, data.name+"PIP", [0,-data.lengths[0],0]);
    const dip = joint(pip, data.name+"DIP", [0,-data.lengths[1],0]);
    phalanx(mcp,data.width,data.lengths[0],false,true);
    phalanx(pip,data.width*.87,data.lengths[1],false,false);
    phalanx(dip,data.width*.76,data.lengths[2],true,false);
    return {data,finger,mcp,pip,dip};
  });

  const thumb = joint(group,"Thumb",[.145,-.196,-.081]);
  const cmc = joint(thumb,"ThumbCMC");
  const thumbMcp = joint(cmc,"ThumbMCP",[0,-thumbLengths[0],0]);
  const ip = joint(thumbMcp,"ThumbIP",[0,-thumbLengths[1],0]);
  const thumbJoints = [cmc,thumbMcp,ip];
  phalanx(cmc,.087,thumbLengths[0],false,true);
  phalanx(thumbMcp,.080,thumbLengths[1],false,true);
  phalanx(ip,.072,thumbLengths[2],true,false);
  joint(group,"GripCenter",[0,-.54,0]);

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

  const absolute = new THREE.Quaternion();
  const previous = new THREE.Quaternion();
  const direction = new THREE.Vector3();
  const elevation = [57,38,26];
  const azimuth = [8,9,11];
  const gripElevation = [65,50,49];
  const gripAzimuth = [67,114,157];
  const curlElevation = [2,33,57];
  const opposeAzimuth = [76,92,105];
  const curlAzimuth = [11,43,94];
  // Opposed thumb directions are calibrated against the index pad for a precision pinch.
  const pinchElevation = [61.34,67.86,56.57];
  const pinchAzimuth = [30.07,112.35,231.91];
  const foldedElevation = [63.23,82.14,84.87];
  const foldedAzimuth = [70.35,176.36,229.51];
  function update(values: HandAngles, thumbOpposition = 0, carriesCube = false) {
    for (const {data,finger,mcp,pip,dip} of digits) {
      const t = clampAngle(values[data.key])/90;
      finger.rotation.z = DEG*data.splay*(1-t*.76);
      // Extended fingers brace the flat side of the cube; free fingers can fold to the palm.
      const flex = carriesCube ? t : Math.pow(t,1.4);
      mcp.rotation.x = -DEG*flex*(carriesCube ? 6 : 72);
      pip.rotation.x = -DEG*flex*(carriesCube ? 7 : 92);
      dip.rotation.x = -DEG*flex*(carriesCube ? 10 : 61);
    }
    const t = clampAngle(values.thumb)/90;
    const opposing = Math.min(1,clampAngle(thumbOpposition)/88);
    const pinchFlex = 66/90;
    const toPinch = Math.min(1,t/pinchFlex);
    const toFist = Math.max(0,(t-pinchFlex)/(1-pinchFlex));
    const lerp = THREE.MathUtils.lerp;
    previous.identity();
    for (let i=0;i<thumbJoints.length;i++) {
      const pinchedTilt = lerp(elevation[i],pinchElevation[i],toPinch);
      const pinchedAim = lerp(azimuth[i]+opposeAzimuth[i],pinchAzimuth[i],toPinch);
      const opposedTilt = lerp(pinchedTilt,foldedElevation[i],toFist);
      const opposedAim = lerp(pinchedAim,foldedAzimuth[i],toFist);
      const tilt = DEG*(carriesCube ? gripElevation[i] : lerp(elevation[i]+t*curlElevation[i],opposedTilt,opposing));
      const tangent = DEG*(carriesCube ? gripAzimuth[i] : lerp(azimuth[i]+t*curlAzimuth[i],opposedAim,opposing));
      direction.set(Math.sin(tilt)*Math.cos(tangent),-Math.cos(tilt),Math.sin(tilt)*Math.sin(tangent));
      absolute.setFromUnitVectors(DOWN,direction);
      thumbJoints[i].quaternion.copy(previous).invert().multiply(absolute);
      previous.copy(absolute);
    }
  }
  update(angles,opposition,holding);
  return {
    group, update,
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

