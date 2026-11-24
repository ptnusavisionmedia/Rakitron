"use client";

// Ruang rakit: satu komponen tampil sendirian di meja putar, dan setiap bagiannya
// terbang masuk ke tempatnya ketika anak memasangnya.
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HAND_PRESETS, type RobotMode } from "../lib/game";
import { createRoboticHand } from "../lib/handModel";

const NAMES = ["Base", "Shoulder", "UpperArm", "Elbow", "Forearm", "Gripper"] as const;
// Sama dengan urutan di meja utama: rangka, poros dan bantalan, pelindung, lalu baut dan penanda.
const LAYER: Record<string, number> = { frame: 0, deep: 0, silver: 1, bright: 1, bore: 1, porcelain: 2, shell: 2 };
const FLY_SECONDS = .75;

type Piece = { mesh: THREE.Mesh; layer: number; home: THREE.Vector3; from: THREE.Vector3; real: THREE.Material | THREE.Material[] };
type Drag = { yaw: number; held: boolean };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Melewati sasaran sedikit lalu kembali, seperti bagian yang "klik" masuk.
const settle = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

function Subject({ mode, index, built, drag }: { mode: RobotMode; index: number; built: number; drag: { current: Drag } }) {
  const asset = useLoader(GLTFLoader, "/models/rakitron-arm.glb");
  const { camera } = useThree();
  const turntable = useRef<THREE.Group>(null);
  const flying = useRef<{ layer: number; t: number } | null>(null);
  const previous = useRef(built);

  const subject = useMemo(() => {
    const holder = new THREE.Group();
    const pieces: Piece[] = [];
    const hand = index === 5 && mode === "hand" ? createRoboticHand({ angles: HAND_PRESETS.open.fingers }) : null;
    let object: THREE.Object3D;
    if (hand) {
      object = hand.group;
      for (const { mesh, stage } of hand.pieces()) pieces.push({ mesh, layer: stage, home: mesh.position.clone(), from: new THREE.Vector3(), real: mesh.material });
    } else {
      const source = asset.scene.getObjectByName(NAMES[index]);
      object = source ? source.clone(true) : new THREE.Group();
      object.position.set(0, 0, 0); object.quaternion.identity(); object.scale.set(1, 1, 1);
      object.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const name = Array.isArray(o.material) ? o.material[0]?.name : o.material.name;
        pieces.push({ mesh: o, layer: LAYER[name] ?? 3, home: o.position.clone(), from: new THREE.Vector3(), real: o.material });
      });
    }
    holder.add(object);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(.2, box.getSize(new THREE.Vector3()).length() / 2);
    object.position.sub(center);
    holder.updateMatrixWorld(true);
    // Setiap bagian datang dari arah luar tempatnya, sedikit dari atas.
    const middle = new THREE.Vector3(), turn = new THREE.Quaternion();
    for (const piece of pieces) {
      piece.mesh.geometry.computeBoundingBox();
      piece.mesh.geometry.boundingBox!.getCenter(middle).applyMatrix4(piece.mesh.matrixWorld);
      const outward = middle.lengthSq() > 1e-6 ? middle.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const offset = outward.multiplyScalar(radius * .75).add(new THREE.Vector3(0, radius * .55, 0));
      piece.mesh.parent!.getWorldQuaternion(turn).invert();
      piece.from.copy(offset.applyQuaternion(turn));
    }
    const ghost = new THREE.MeshBasicMaterial({ color: "#5b8f7a", transparent: true, opacity: .1, depthWrite: false });
    return { holder, pieces, radius, ghost, dispose() { ghost.dispose(); hand?.dispose(); } };
  }, [asset, mode, index]);

  useEffect(() => () => subject.dispose(), [subject]);

  useLayoutEffect(() => {
    const distance = subject.radius / Math.sin((camera as THREE.PerspectiveCamera).fov * Math.PI / 360) * 1.12;
    camera.position.set(distance * .55, distance * .42, distance * .72);
    camera.lookAt(0, 0, 0);
  }, [camera, subject]);

  useLayoutEffect(() => {
    const added = built === previous.current + 1 ? built - 1 : null;
    previous.current = built;
    for (const piece of subject.pieces) {
      piece.mesh.material = piece.layer < built ? piece.real : subject.ghost;
      piece.mesh.position.copy(piece.home);
      if (piece.layer === added && !reducedMotion()) piece.mesh.position.add(piece.from);
    }
    flying.current = added !== null && !reducedMotion() ? { layer: added, t: 0 } : null;
  }, [subject, built]);

  useFrame((_, dt) => {
    const step = Math.min(dt, .05);
    if (turntable.current) {
      if (!drag.current.held && !reducedMotion()) drag.current.yaw += step * .32;
      turntable.current.rotation.y = drag.current.yaw;
    }
    const flight = flying.current;
    if (!flight) return;
    flight.t = Math.min(1, flight.t + step / FLY_SECONDS);
    const remaining = 1 - settle(flight.t);
    for (const piece of subject.pieces) {
      if (piece.layer === flight.layer) piece.mesh.position.copy(piece.home).addScaledVector(piece.from, remaining);
    }
    if (flight.t >= 1) flying.current = null;
  });

  return <group ref={turntable}><primitive object={subject.holder} dispose={null} /></group>;
}

export default function ComponentBench({ mode, index, built }: { mode: RobotMode; index: number; built: number }) {
  const drag = useRef<Drag>({ yaw: -.5, held: false });
  const last = useRef(0);
  return <div className="bench-canvas"
    onPointerDown={event => { drag.current.held = true; last.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (!drag.current.held) return; drag.current.yaw += (event.clientX - last.current) * .011; last.current = event.clientX; }}
    onPointerUp={() => { drag.current.held = false; }} onPointerCancel={() => { drag.current.held = false; }}>
    <Canvas camera={{ fov: 30, near: .02, far: 30 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={.85} />
      <hemisphereLight args={["#ffffff", "#93a48f", .9]} />
      <directionalLight position={[2.5, 4, 3]} intensity={2.3} />
      <directionalLight position={[-3, 1.5, -2]} intensity={.9} />
      <Suspense fallback={null}>
        <Subject key={mode + index} mode={mode} index={index} built={built} drag={drag} />
      </Suspense>
    </Canvas>
  </div>;
}
