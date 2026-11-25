"use client";

// Ruang rakit: satu komponen tampil sendirian di meja putar. Bagian berikutnya menunggu di
// samping, dan anak menyeretnya sendiri ke bayangan tempatnya sampai "klik" terpasang.
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HAND_PRESETS, type RobotMode } from "../lib/game";
import { createRoboticHand } from "../lib/handModel";
import { BODY_MODEL_URL, BODY_PARTS } from "../lib/bodyGame";

type BenchMode = RobotMode | "body";

const NAMES = ["Base", "Shoulder", "UpperArm", "Elbow", "Forearm", "Gripper"] as const;
// Sama dengan urutan di meja utama: rangka, poros dan bantalan, pelindung, lalu baut dan penanda.
const LAYER: Record<string, number> = { frame: 0, deep: 0, silver: 1, bright: 1, bore: 1, porcelain: 2, shell: 2 };
const SETTLE_SECONDS = .6;

type Piece = { mesh: THREE.Mesh; target: THREE.Mesh; layer: number; home: THREE.Vector3; real: THREE.Material | THREE.Material[] };
export type BenchControl = { yaw: number; rotating: boolean; grabbing: boolean };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Melewati sasaran sedikit lalu kembali, seperti bagian yang "klik" masuk.
const settle = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

function Subject({ mode, index, built, control, onBuild }: {
  mode: BenchMode; index: number; built: number; control: { current: BenchControl }; onBuild: () => void;
}) {
  const asset = useLoader(GLTFLoader, mode === "body" ? BODY_MODEL_URL : "/models/rakitron-arm.glb");
  const { camera, size } = useThree();
  // Ukuran area pegang di layar dan jarak tempat tunggu, dihitung dari bentuk komponen.
  const shape = useRef({ wide: 1, tall: 1, reach: 1 });
  const turntable = useRef<THREE.Group>(null);
  const previous = useRef(built);
  // Posisi bagian berikutnya relatif terhadap tempat pasangnya, dalam ruang dunia.
  const offset = useRef(new THREE.Vector3());
  const tray = useRef(new THREE.Vector3());
  const state = useRef<"tray" | "drag" | "return">("tray");
  const dropped = useRef<THREE.Vector3 | null>(null);
  const settling = useRef<{ layer: number; from: THREE.Vector3; t: number } | null>(null);
  const grip = useRef({ plane: new THREE.Plane(), anchor: new THREE.Vector3(), x: 0, y: 0 });
  const proxy = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const view = useMemo(() => new THREE.Vector3(), []);
  const scratch = useMemo(() => ({ turn: new THREE.Quaternion(), local: new THREE.Vector3(), hit: new THREE.Vector3() }), []);

  const subject = useMemo(() => {
    const holder = new THREE.Group();
    const pieces: Piece[] = [];
    const hand = index === 5 && mode === "hand" ? createRoboticHand({ angles: HAND_PRESETS.open.fingers }) : null;
    const add = (mesh: THREE.Mesh, layer: number) => pieces.push({ mesh, target: mesh, layer, home: mesh.position.clone(), real: mesh.material });
    let object: THREE.Object3D;
    if (hand) {
      object = hand.group;
      for (const { mesh, stage } of hand.pieces()) add(mesh, stage);
    } else {
      const source = asset.scene.getObjectByName(mode === "body" ? BODY_PARTS[index].id : NAMES[index]);
      object = source ? source.clone(true) : new THREE.Group();
      object.position.set(0, 0, 0); object.quaternion.identity(); object.scale.set(1, 1, 1);
      object.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const name = Array.isArray(o.material) ? o.material[0]?.name : o.material.name;
        add(o, mode === "body" ? o.userData.assemblyStage : LAYER[name] ?? 3);
      });
    }
    holder.add(object);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const extent = box.getSize(new THREE.Vector3());
    const radius = Math.max(.2, extent.length() / 2);
    // Komponen berputar di meja, jadi lebarnya dihitung sebagai jari-jari mendatar terbesar.
    const span = Math.max(.1, Math.hypot(extent.x, extent.z) / 2), rise = Math.max(.05, extent.y / 2);
    object.position.sub(box.getCenter(new THREE.Vector3()));
    // Setiap bagian punya bayangan di tempat pasangnya, sebagai sasaran untuk diseret.
    const faint = new THREE.MeshBasicMaterial({ color: "#5b8f7a", transparent: true, opacity: .07, depthWrite: false });
    const goal = new THREE.MeshBasicMaterial({ color: "#2f9d74", transparent: true, opacity: .3, depthWrite: false });
    for (const piece of pieces) {
      piece.target = new THREE.Mesh(piece.mesh.geometry, faint);
      piece.target.position.copy(piece.home);
      piece.target.quaternion.copy(piece.mesh.quaternion);
      piece.target.scale.copy(piece.mesh.scale);
      piece.target.raycast = () => {};
      piece.mesh.parent!.add(piece.target);
    }
    const layers = Math.max(...pieces.map(piece => piece.layer)) + 1;
    return { holder, pieces, radius, span, rise, faint, goal, layers, dispose() { faint.dispose(); goal.dispose(); hand?.dispose(); } };
  }, [asset, mode, index]);

  useEffect(() => () => subject.dispose(), [subject]);

  // Bagian yang menunggu ditaruh di samping komponen yang ringkas, atau di atas komponen yang
  // panjang, supaya keduanya tidak pernah bertumpuk. Kamera lalu membingkai keduanya.
  useLayoutEffect(() => {
    const direction = new THREE.Vector3(.5, .42, .76).normalize();
    const wide = subject.span;
    const tall = subject.rise * Math.hypot(direction.x, direction.z) + subject.span * direction.y;
    const aspect = Math.max(.5, size.width / Math.max(1, size.height));
    const gap = .3 * Math.max(wide, tall);
    const half = Math.tan((camera as THREE.PerspectiveCamera).fov * Math.PI / 360);
    // Jarak kamera yang dibutuhkan bila bagian menunggu di samping, atau di atas.
    const beside = Math.max((2 * wide + gap / 2) * 1.22 / aspect, tall * 1.5);
    const above = Math.max((2 * tall + gap / 2) * 1.18, wide * 1.15 / aspect);
    const sideways = beside <= above * 1.1;
    const reach = sideways ? 2 * wide + gap : 2 * tall + gap;
    camera.position.copy(direction).multiplyScalar((sideways ? beside : above) / half);
    camera.lookAt(0, 0, 0);
    const axis = sideways ? new THREE.Vector3(-1, 0, 0).applyQuaternion(camera.quaternion)
      : new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(axis, reach / 2);
    tray.current.copy(axis).multiplyScalar(reach);
    shape.current = { wide, tall, reach };
    // Bagian yang sedang menunggu ikut pindah ketika ukuran layar berubah.
    if (state.current !== "drag") offset.current.copy(tray.current);
  }, [camera, subject, size.width, size.height]);

  const place = (piece: Piece, world: THREE.Vector3) => {
    piece.mesh.parent!.getWorldQuaternion(scratch.turn).invert();
    piece.mesh.position.copy(piece.home).add(scratch.local.copy(world).applyQuaternion(scratch.turn));
  };

  useLayoutEffect(() => {
    const added = built === previous.current + 1 ? built - 1 : null;
    previous.current = built;
    for (const piece of subject.pieces) {
      piece.mesh.material = piece.real;
      piece.mesh.visible = piece.layer <= built;
      piece.mesh.position.copy(piece.home);
      piece.target.visible = piece.layer >= built;
      piece.target.material = piece.layer === built ? subject.goal : subject.faint;
    }
    // Bagian yang baru dipasang meluncur dari tempat dilepas (atau dari samping bila lewat tombol).
    const from = dropped.current ?? tray.current.clone();
    dropped.current = null;
    settling.current = added !== null && !reducedMotion() ? { layer: added, from, t: 0 } : null;
    state.current = "tray";
    control.current.grabbing = false;
    // Bagian berikutnya masuk dari luar layar ke tempat tunggunya.
    offset.current.copy(tray.current);
    if (added !== null && !reducedMotion()) offset.current.multiplyScalar(1.7);
  }, [subject, built, control]);

  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, .05);
    const calm = reducedMotion();
    if (turntable.current) {
      if (!control.current.rotating && !control.current.grabbing && !calm) control.current.yaw += step * .22;
      turntable.current.rotation.y = control.current.yaw;
      turntable.current.updateMatrixWorld(true);
    }
    subject.goal.opacity = calm ? .3 : .24 + .14 * Math.sin(clock.elapsedTime * 4.5);
    // Area pegang dan lingkaran penanda mengikuti bagian yang menunggu, menghadap kamera.
    const waiting = built < subject.layers;
    camera.getWorldDirection(view);
    const { wide, tall } = shape.current;
    if (proxy.current) {
      proxy.current.visible = waiting;
      proxy.current.position.copy(offset.current);
      proxy.current.quaternion.copy(camera.quaternion);
      proxy.current.scale.set(wide * 1.2, Math.max(tall, wide * .3) * 1.2, 1);
    }
    if (halo.current) {
      halo.current.visible = waiting;
      halo.current.position.copy(offset.current).addScaledVector(view, subject.radius * 1.1);
      halo.current.quaternion.copy(camera.quaternion);
      halo.current.scale.set(wide * 1.2, Math.max(tall, wide * .3) * 1.2, 1);
      const material = halo.current.material as THREE.MeshBasicMaterial;
      material.opacity = state.current === "drag" ? .2 : calm ? .12 : .1 + .05 * Math.sin(clock.elapsedTime * 3);
    }
    if (state.current !== "drag") {
      // Kembali ke tempat tunggu dengan halus.
      const ease = calm ? 1 : 1 - Math.exp(-step * 9);
      offset.current.lerp(tray.current, ease);
    }
    const flight = settling.current;
    if (flight) flight.t = Math.min(1, flight.t + step / SETTLE_SECONDS);
    for (const piece of subject.pieces) {
      if (piece.layer === built) place(piece, offset.current);
      else if (flight && piece.layer === flight.layer) {
        place(piece, scratch.hit.copy(flight.from).multiplyScalar(1 - settle(flight.t)));
      }
    }
    if (flight && flight.t >= 1) {
      for (const piece of subject.pieces) if (piece.layer === flight.layer) piece.mesh.position.copy(piece.home);
      settling.current = null;
    }
  });

  // Bagian kecil sulit disentuh tepat, jadi yang dipegang adalah area bulat besar di sekelilingnya.
  const down = (event: ThreeEvent<PointerEvent>) => {
    if (built >= subject.layers) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    const normal = camera.getWorldDirection(new THREE.Vector3());
    grip.current.plane.setFromNormalAndCoplanarPoint(normal, offset.current);
    const hit = event.ray.intersectPlane(grip.current.plane, scratch.hit) ?? event.point;
    grip.current.anchor.copy(hit).sub(offset.current);
    grip.current.x = event.nativeEvent.clientX; grip.current.y = event.nativeEvent.clientY;
    state.current = "drag";
    control.current.grabbing = true;
  };
  const move = (event: ThreeEvent<PointerEvent>) => {
    if (state.current !== "drag") return;
    event.stopPropagation();
    if (event.ray.intersectPlane(grip.current.plane, scratch.hit)) offset.current.copy(scratch.hit).sub(grip.current.anchor);
  };
  const up = (event: ThreeEvent<PointerEvent>) => {
    if (state.current !== "drag") return;
    event.stopPropagation();
    (event.target as Element).releasePointerCapture(event.pointerId);
    control.current.grabbing = false;
    const tapped = Math.hypot(event.nativeEvent.clientX - grip.current.x, event.nativeEvent.clientY - grip.current.y) < 8;
    // Ketukan singkat, atau dilepas cukup dekat dengan bayangannya: bagian terpasang.
    // Kalau belum, bagian kembali ke tempat tunggu.
    if (tapped || offset.current.length() < shape.current.reach * .55) {
      dropped.current = offset.current.clone();
      state.current = "tray";
      onBuild();
    } else state.current = "return";
  };

  return <>
    <group ref={turntable}><primitive object={subject.holder} dispose={null} /></group>
    <mesh ref={halo} renderOrder={-1} raycast={() => null}>
      <circleGeometry args={[1, 56]} />
      <meshBasicMaterial color="#ff713d" transparent opacity={.1} depthWrite={false} />
    </mesh>
    <mesh ref={proxy} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onPointerOver={() => { document.body.style.cursor = "grab"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      <circleGeometry args={[1, 40]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  </>;
}

export default function ComponentBench({ mode, index, built, onBuild }: { mode: BenchMode; index: number; built: number; onBuild: () => void }) {
  const control = useRef<BenchControl>({ yaw: -.5, rotating: false, grabbing: false });
  const last = useRef(0);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  return <div className="bench-canvas"
    onPointerDown={event => {
      // Menyeret bagian ditangani di dalam adegan; menyeret latar memutar komponen.
      if (control.current.grabbing) return;
      control.current.rotating = true; last.current = event.clientX;
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => { if (!control.current.rotating) return; control.current.yaw += (event.clientX - last.current) * .011; last.current = event.clientX; }}
    onPointerUp={() => { control.current.rotating = false; }} onPointerCancel={() => { control.current.rotating = false; }}>
    <Canvas camera={{ fov: 30, near: .02, far: 40 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={.85} />
      <hemisphereLight args={["#ffffff", "#93a48f", .9]} />
      <directionalLight position={[2.5, 4, 3]} intensity={2.3} />
      <directionalLight position={[-3, 1.5, -2]} intensity={.9} />
      <Suspense fallback={null}>
        <Subject key={mode + index} mode={mode} index={index} built={built} control={control} onBuild={onBuild} />
      </Suspense>
    </Canvas>
  </div>;
}
