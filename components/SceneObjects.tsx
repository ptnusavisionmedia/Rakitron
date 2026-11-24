"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

function roundedPath(path: THREE.Path | THREE.Shape, w: number, d: number, r: number) {
  const x = w / 2, z = d / 2;
  path.moveTo(-x + r, -z);
  path.lineTo(x - r, -z);
  path.quadraticCurveTo(x, -z, x, -z + r);
  path.lineTo(x, z - r);
  path.quadraticCurveTo(x, z, x - r, z);
  path.lineTo(-x + r, z);
  path.quadraticCurveTo(-x, z, -x, z - r);
  path.lineTo(-x, -z + r);
  path.quadraticCurveTo(-x, -z, -x + r, -z);
}

function horizontalMolding(width: number, depth: number, height: number, hole?: number) {
  const shape = new THREE.Shape();
  roundedPath(shape, width, depth, .10);
  if (hole) {
    const inner = new THREE.Path();
    roundedPath(inner, width - hole * 2, depth - hole * 2, .06);
    shape.holes.push(inner);
  }
  const result = new THREE.ExtrudeGeometry(shape, {
    depth: height, bevelEnabled: true, bevelSegments: 2,
    bevelSize: .009, bevelThickness: .009, curveSegments: 7,
    steps: 1,
  });
  return result.rotateX(-Math.PI / 2);
}

type TraySpec = { x: number; z: number; y: number; width: number; depth: number; yaw: number };

export function ReceiverTray({ tray }: { tray: TraySpec }) {
  const [base, rim] = useMemo(() => [
    horizontalMolding(tray.width + .14, tray.depth + .14, .05),
    horizontalMolding(tray.width + .14, tray.depth + .14, .065, .065),
  ], [tray.width, tray.depth]);
  useEffect(() => () => { base.dispose(); rim.dispose(); }, [base, rim]);
  const line = .022;
  return <group position={[tray.x, tray.y, tray.z]} rotation-y={tray.yaw * Math.PI / 180}>
    <mesh geometry={base} position-y={-.055} castShadow receiveShadow>
      <meshStandardMaterial color="#7297b6" roughness={.66} />
    </mesh>
    <mesh geometry={rim} castShadow receiveShadow>
      <meshStandardMaterial color="#4a799e" roughness={.47} />
    </mesh>
    {[-1,1].flatMap(x => [-1,1].map(z => {
      const px = x * tray.width * .27, pz = z * tray.depth * .25;
      return <group key={x + ":" + z}>
        <mesh position={[px - x*.045,.013,pz]}><boxGeometry args={[.10,.003,line]} /><meshStandardMaterial color="#d9e7e8" /></mesh>
        <mesh position={[px,.013,pz - z*.045]}><boxGeometry args={[line,.003,.10]} /><meshStandardMaterial color="#d9e7e8" /></mesh>
      </group>;
    }))}
  </group>;
}

export function WoodenCube({ position, yaw }: { position: [number,number,number]; yaw: number }) {
  const geo = useMemo(() => new RoundedBoxGeometry(.30,.30,.30,3,.021),[]);
  useEffect(() => () => geo.dispose(),[geo]);
  return <group position={position} rotation-y={yaw * Math.PI / 180}>
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#e8aa21" roughness={.71} />
    </mesh>
    {[[-.064,-.064],[.064,.064]].map(([x,z]) =>
      <mesh key={x} position={[x,.1505,z]} rotation-x={-Math.PI/2}>
        <circleGeometry args={[.016,12]} /><meshStandardMaterial color="#cb951e" />
      </mesh>)}
  </group>;
}

export function Ring({ radius, thickness=.014, color, opacity=1 }: { radius: number; thickness?: number; color: string; opacity?: number }) {
  return <mesh rotation-x={-Math.PI / 2}>
    <ringGeometry args={[radius-thickness/2,radius+thickness/2,64]} />
    <meshBasicMaterial color={color} transparent={opacity<1} opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
  </mesh>;
}

