"use client";

import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Game } from "../lib/useGame";
import { SNAP_DISTANCE, TRAY } from "../lib/game";
import { PLACE_LAND, createBus, type Bus } from "../lib/gameEvents";
import RoboticHand from "./RoboticHand";
import { Effects, useFx } from "./Effects";
import { noteMotion, prefersReducedMotion, setSceneVisible, shadowsNeedUpdate, useIdleInvalidate } from "./idle";
import WorkshopTable from "./WorkshopTable";
import { ReceiverTray, Ring, WoodenCube } from "./SceneObjects";

type V3 = [number, number, number];
type View = "perspective" | "front" | "top";
type Inspection = number | "hand" | null;
export type WorkshopSceneProps = {
  game: Game;
  view?: View;
  cameraReset?: number;
  socketFocus?: number;
  zoom?: number;
  bus?: Bus;
  onReady?: () => void;
};
type Pointer = ThreeEvent<PointerEvent>;
// Local to the wrist gimbal, between the rotary bearing and the extended fingertips.
const HAND_INSPECTION_CENTER: V3 = [0,-.16,0];
const CAMERA = { position:[4.4,3.5,5.75] as V3, fov:34, near:.075, far:65 };
const RENDERER = { antialias:true, alpha:false, powerPreference:"high-performance" as const,
  toneMapping:THREE.ACESFilmicToneMapping, toneMappingExposure:.95 };
const SHADOWS = {type:THREE.PCFSoftShadowMap};
const NAMES = ["Base","Shoulder","UpperArm","Elbow","Forearm","Gripper"] as const;
const D = Math.PI / 180;
// The hand docks upward into the central wrist seat. The gripper enters along the boom.
function gripperApproachAngle(game: Game) {
  return game.robotMode === "gripper" ? game.joints.shoulder + game.joints.elbow : null;
}
function insertionAxis(index:number, toolApproachAngle:number|null) {
  if (index < 2) return new THREE.Vector3(0,1,0);
  if (index === 5) return toolApproachAngle === null ? new THREE.Vector3(0,-1,0) :
    new THREE.Vector3(Math.cos(toolApproachAngle*D),Math.sin(toolApproachAngle*D),0);
  return new THREE.Vector3(0,0,1);
}

function handApproachDistance(hand: THREE.Object3D, maximum: number) {
  hand.updateWorldMatrix(true,true);
  const bottom = new THREE.Box3().setFromObject(hand).min.y;
  return Math.min(maximum,Math.max(0,bottom - .015));
}

const DIRECTIONS = {
  perspective: new THREE.Vector3(4.4,3.25,5.75).normalize(),
  front: new THREE.Vector3(.35,1.35,7.5).normalize(),
  top: new THREE.Vector3(.003,1,.003).normalize(),
};

// Slots run along the edges of the cutting mat, leaving both mission targets free.
const LOOSE: {pos:V3; rot:V3}[] = [
  {pos:[-1.54,.018,-.54],rot:[0,.2,0]},
  {pos:[-1.35,.022,-1.47],rot:[0,.5,0]},
  {pos:[.00,.15,-1.52],rot:[Math.PI/2,-.12,.29]},
  {pos:[1.77,.19,-1.39],rot:[Math.PI/2,0,.24]},
  {pos:[1.60,.14,-.85],rot:[Math.PI/2,0,-.85]},
  {pos:[2.42,.22,.1],rot:[-.5,.35,-Math.PI/2]},
];
const HAND_SLOT = { pos: [2.16,.113,.12] as V3, rot: [-Math.PI/2,0,.34] as V3 };

function StudioLights() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(gl);
    const target = generator.fromScene(room,.06);
    const old = scene.environment;
    scene.environment = target.texture;
    scene.environmentIntensity = .36;
    invalidate();
    return () => {
      scene.environment = old;
      target.dispose(); room.dispose(); generator.dispose();
    };
  },[gl,scene,invalidate]);
  return <>
    <hemisphereLight color="#fff7e7" groundColor="#a0b49c" intensity={1.13} />
    <directionalLight position={[-3.9,7.0,3.6]} intensity={2.33} color="#fff2da"
      castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}
      shadow-camera-near={.1} shadow-camera-far={18}
      shadow-camera-left={-4.5} shadow-camera-right={4.5} shadow-camera-top={4.5} shadow-camera-bottom={-4.5}
      shadow-bias={-.00035} shadow-normalBias={.012} shadow-radius={3} />
    <directionalLight position={[4.5,3.4,-5]} intensity={.93} color="#f6f7ef" />
  </>;
}

function CameraRig({ view, reset, zoom, lock, focus, socket, wrist, controls, inspecting, complete, toolApproachAngle }: { view: View; reset: number; zoom: number; lock: RefObject<boolean>; focus:number; socket:RefObject<THREE.Group|null>; wrist:RefObject<THREE.Group|null>; controls:RefObject<OrbitControls|null>; inspecting:Inspection; complete:boolean; toolApproachAngle:number|null }) {
  const { camera, gl, size, invalidate } = useThree();
  const lastZoom = useRef(zoom);
  const previousReset = useRef(reset);
  const palmCenter = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    const c = new OrbitControls(camera,gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = .11;
    c.enablePan = false;
    c.rotateSpeed = .70;
    c.zoomSpeed = .8;
    c.minDistance = 2.2;
    c.maxDistance = 19;
    c.minPolarAngle = .017;
    c.maxPolarAngle = Math.PI*.485;
    c.mouseButtons = {LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};
    c.touches = {ONE: THREE.TOUCH.ROTATE,TWO: THREE.TOUCH.DOLLY_PAN};
    const refresh = () => invalidate();
    c.addEventListener("change",refresh);
    controls.current = c;
    return () => { c.removeEventListener("change",refresh); c.dispose(); controls.current = null; };
  },[camera,gl,controls,invalidate]);
  useLayoutEffect(() => {
    const c = controls.current;
    if (!c || inspecting!==null || !(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = size.width / Math.max(size.height,1);
    const distance = Math.max(6.0, 6.65 / (2*Math.tan(camera.fov*D/2)*aspect));
    const center = view === "top" ? new THREE.Vector3(.10,0,.02) : new THREE.Vector3(.09,.34,.11);
    // Clear residual orbital inertia before applying a named view.
    c.enableDamping = false;
    c.update();
    if (reset !== previousReset.current) { previousReset.current = reset; lastZoom.current = zoom; }
    c.target.copy(center);
    camera.position.copy(center).addScaledVector(DIRECTIONS[view],distance);
    camera.lookAt(center); c.update(); c.enableDamping = true;
  },[camera,size.width,size.height,view,reset,inspecting,complete]); // A separate effect handles incremental zoom.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const delta = zoom - lastZoom.current;
    lastZoom.current = zoom;
    if (!delta) return;
    const offset = camera.position.clone().sub(c.target);
    const distance = THREE.MathUtils.clamp(offset.length()*Math.pow(.84,delta),c.minDistance,c.maxDistance);
    camera.position.copy(c.target).add(offset.setLength(distance));
    c.update();
  },[camera,zoom]);
  useEffect(() => {
    const c = controls.current;
    if (!c || !socket.current || typeof inspecting !== "number") return;
    const local = socket.current.getWorldQuaternion(new THREE.Quaternion());
    const axis = insertionAxis(inspecting,toolApproachAngle).applyQuaternion(local).normalize();
    const center = socket.current.getWorldPosition(new THREE.Vector3()).addScaledVector(axis,.36);
    const handSocket = inspecting === 5 && toolApproachAngle === null;
    const direction = inspecting < 2 ? new THREE.Vector3(.68,.84,1).normalize() :
      (handSocket ? new THREE.Vector3(.34,.03,-1) : new THREE.Vector3(.76,.30,.78))
        .applyQuaternion(local).add(new THREE.Vector3(0,.53,0)).normalize();
    const distance = Math.max(3.45,2.3/Math.max(.58,size.width/size.height));
    c.target.copy(center);
    camera.position.copy(center).addScaledVector(direction,distance);
    camera.lookAt(center); c.update();
  },[camera,focus,socket,inspecting,toolApproachAngle,size.width,size.height]);
  useEffect(() => {
    const c = controls.current;
    if (!c || inspecting !== "hand" || !wrist.current) return;
    const center = wrist.current.localToWorld(palmCenter.fromArray(HAND_INSPECTION_CENTER));
    const direction = new THREE.Vector3(.36,.15,-1).transformDirection(wrist.current.matrixWorld);
    const distance = Math.max(c.minDistance, 2.0 / Math.max(.25,size.width/size.height));
    c.enableDamping = false;
    c.update();
    c.target.copy(center);
    camera.position.copy(center).addScaledVector(direction,distance);
    camera.lookAt(center);
    c.update();
    c.enableDamping = true;
    invalidate();
  },[camera,controls,focus,inspecting,invalidate,palmCenter,size.width,size.height,wrist]);
  useFrame(() => {
    const c = controls.current;
    if (!c || lock.current) return;
    if (inspecting === "hand" && wrist.current) {
      // Follow the palm center while preserving the camera's world-space viewing direction.
      const target = wrist.current.localToWorld(palmCenter.fromArray(HAND_INSPECTION_CENTER));
      camera.position.sub(c.target).add(target);
      c.target.copy(target);
    }
    c.update();
  });
  return null;
}

type ModelStyle = "real" | "selected" | "active" | "blueprint" | "socket-preview";
// Lapisan sub-rakitan mengikuti bahan: rangka, poros dan bantalan, pelindung, lalu baut dan penanda.
const LAYER: Record<string, number> = { frame: 0, deep: 0, silver: 1, bright: 1, bore: 1, porcelain: 2, shell: 2 };
function Model({ source, style="real", gap, layers }: { source: THREE.Object3D; style?: ModelStyle; gap?: number; layers?: number }) {
  const invalidate = useThree(s => s.invalidate);
  const { node, materials, outlines, finished, pending } = useMemo(() => {
    const node = source.clone(true);
    node.position.set(0,0,0); node.quaternion.identity(); node.scale.set(1,1,1); node.updateMatrix();
    const materials: THREE.Material[] = [];
    const outlines: THREE.BufferGeometry[] = [];
    const ghost = style === "blueprint" || style === "socket-preview";
    const ghostMaterial = ghost ? new THREE.MeshBasicMaterial({
      color: style === "blueprint" ? "#758c83" : "#65ab89",
      transparent:true, opacity: style === "blueprint" ? .07 : .14, depthWrite:false,
      polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1,
    }) : null;
    const edgeMaterial = ghost ? new THREE.LineBasicMaterial({
      color: style === "blueprint" ? "#59736b" : "#449573",
      transparent:true, opacity: style === "blueprint" ? .10 : .25, depthWrite:false,
    }) : null;
    if (ghostMaterial) materials.push(ghostMaterial);
    if (edgeMaterial) materials.push(edgeMaterial);
    const shapes: THREE.Mesh[] = [];
    node.traverse(o => { if (o instanceof THREE.Mesh) shapes.push(o); });
    for (const mesh of shapes) {
      const name = Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material.name;
      mesh.userData.layer = LAYER[name] ?? 3;
    }
    const pending = new THREE.MeshBasicMaterial({ color:"#5b8f7a", transparent:true, opacity:.11, depthWrite:false });
    materials.push(pending);
    const replacements = new Map<THREE.Material,THREE.Material>();
    const tint = (mat:THREE.Material) => {
      if (replacements.has(mat)) return replacements.get(mat)!;
      const modified = mat.clone();
      if (modified instanceof THREE.MeshStandardMaterial) {
        modified.emissive.set(style==="active" ? "#ea6e32" : "#38aa84");
        modified.emissiveIntensity = style==="active" ? .24 : .17;
      }
      replacements.set(mat,modified); materials.push(modified);
      return modified;
    };
    for (const mesh of shapes) {
      mesh.castShadow = !ghost; mesh.receiveShadow = !ghost;
      if (ghostMaterial && edgeMaterial) {
        mesh.material = ghostMaterial;
        mesh.geometry.computeBoundingBox();
        const dimension = mesh.geometry.boundingBox?.getSize(new THREE.Vector3()).length() || 0;
        if (style !== "blueprint" && dimension > .30) {
          const geom = new THREE.EdgesGeometry(mesh.geometry,68);
          outlines.push(geom);
          const lines = new THREE.LineSegments(geom,edgeMaterial);
          lines.raycast = () => {};
          mesh.add(lines);
        }
        mesh.raycast = () => {};
      } else if (style !== "real") {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
      }
    }
    const finished = new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();
    for (const mesh of shapes) finished.set(mesh,mesh.material);
    return {node,materials,outlines,finished,pending};
  },[source,style]);
  useLayoutEffect(() => {
    for (const [mesh,material] of finished) {
      const shown = layers === undefined || mesh.userData.layer < layers;
      mesh.material = shown ? material : pending;
      if (style === "real" || style === "selected" || style === "active") mesh.castShadow = shown;
    }
    invalidate();
  },[finished,pending,layers,style,invalidate]);
  useEffect(() => () => { materials.forEach(m => m.dispose()); outlines.forEach(g => g.dispose()); },[materials,outlines]);
  const shownGap = useRef<number | null>(null);
  const setJaws = (value: number) => {
    const left = node.getObjectByName("JawLeft"), right = node.getObjectByName("JawRight");
    if (left) left.position.z = value/2 + .065;
    if (right) right.position.z = -(value/2 + .065);
  };
  useLayoutEffect(() => {
    if (gap === undefined) return;
    // Tampilan pertama dan pengguna yang mengurangi gerak langsung ke posisi akhir.
    if (shownGap.current === null || prefersReducedMotion()) { shownGap.current = gap; setJaws(gap); }
    invalidate();
  },[node,gap,invalidate]);
  useFrame((_,dt) => {
    if (gap === undefined || shownGap.current === null || shownGap.current === gap) return;
    noteMotion();
    const travel = .42 * Math.min(dt,.05);
    const delta = gap - shownGap.current;
    shownGap.current = Math.abs(delta) <= travel ? gap : shownGap.current + Math.sign(delta) * travel;
    setJaws(shownGap.current);
    invalidate();
  });
  return <primitive object={node} dispose={null} />;
}

function PartModel({ index, source, game, style, attached = false, wristRef, layers }: {
  index: number; source: THREE.Object3D; game: Game; style: ModelStyle; attached?: boolean;
  wristRef?: RefObject<THREE.Group|null>; layers?: number;
}) {
  if (index === 5 && game.robotMode === "hand") {
    return <RoboticHand angles={game.fingers} opposition={game.opposition}
      wrist={attached ? game.wrist : undefined}
      wristRef={attached ? wristRef : undefined} holding={attached && game.cube.mode === "held"}
      preview={style === "blueprint" || style === "socket-preview"}
      highlighted={style === "selected" || style === "active"} stage={layers} />;
  }
  return <Model source={source} style={style} gap={index === 5 ? game.gap : undefined} layers={layers} />;
}

const SETTLE = .8;
// Komponen meluncur ke soket, menumbuk (bunyi "klik" dan percikan), lalu bergetar sebentar.
function SeatedPart({ children, index, toolApproachAngle }: { children:ReactNode; index:number; toolApproachAngle:number|null }) {
  const ref = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const landed = useRef(false);
  const travel = useRef(.62);
  const handSocket = index === 5 && toolApproachAngle === null;
  const fx = useFx();
  const world = useMemo(() => new THREE.Vector3(),[]);
  const invalidate = useThree(s => s.invalidate);
  useLayoutEffect(() => {
    if (prefersReducedMotion()) { elapsed.current = SETTLE; landed.current = true; }
    else {
      if (handSocket && ref.current && elapsed.current === 0) {
        ref.current.position.set(0,0,0);
        travel.current = handApproachDistance(ref.current,.62);
        ref.current.position.y = -travel.current;
      }
      invalidate();
    }
  },[handSocket,invalidate]);
  useFrame((_,dt) => {
    const group = ref.current;
    if (!group || elapsed.current >= SETTLE) return;
    noteMotion();
    elapsed.current = Math.min(SETTLE,elapsed.current + Math.min(dt,.04));
    const t = elapsed.current;
    const approach = Math.min(1,t / PLACE_LAND);
    group.position.copy(insertionAxis(index,toolApproachAngle)).multiplyScalar(travel.current * (1 - approach * approach));
    const after = Math.max(0,t - PLACE_LAND);
    const scale = t < PLACE_LAND ? 1 + .07 * (1 - approach) : 1 + .12 * Math.exp(-9 * after) * Math.cos(26 * after);
    group.scale.setScalar(handSocket || t >= SETTLE ? 1 : scale);
    if (t >= PLACE_LAND && !landed.current) {
      landed.current = true;
      group.getWorldPosition(world);
      fx?.burst("pop",world);
      if (index === 5) { fx?.burst("sparkle",world,.05); fx?.burst("confetti",world,.3); }
    }
    invalidate();
  });
  return <group ref={ref}>{children}</group>;
}
function Locator({ active, onClick, index, toolApproachAngle }: { active: boolean; onClick: (e:ThreeEvent<MouseEvent>)=>void; index:number; toolApproachAngle:number|null }) {
  const marker = useRef<THREE.Group>(null);
  const arrow = useRef<THREE.Group>(null);
  const pulse = useRef(0);
  const clock = useRef(0);
  const invalidate = useThree(s => s.invalidate);
  const idle = useIdleInvalidate();
  const axis = useMemo(() => insertionAxis(index,toolApproachAngle),[index,toolApproachAngle]);
  const aim = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.clone().negate()),[axis]);
  useLayoutEffect(() => {
    pulse.current = active && !prefersReducedMotion() ? .58 : 0;
    marker.current?.scale.setScalar(1);
    invalidate();
  },[active,invalidate]);
  // Cincin bernapas dan panah memantul agar anak tahu ke mana komponen harus dibawa.
  useFrame((_,dt) => {
    if (prefersReducedMotion()) return;
    const step = Math.min(dt,.1);
    clock.current += step;
    pulse.current = Math.max(0,pulse.current - step);
    if (marker.current) {
      const press = pulse.current > 0 ? Math.sin(Math.PI*pulse.current/.58)*.12 : 0;
      marker.current.scale.setScalar(1 + press + Math.sin(clock.current*3.2)*.045);
    }
    arrow.current?.position.copy(axis).multiplyScalar(.5 + (Math.sin(clock.current*5)+1)*.05);
    idle();
  });
  return <group onClick={onClick} userData={{ assemblySocket: true }}>
    <group ref={marker}>
      {[0, Math.PI/2].map(tilt => <mesh key={tilt} rotation-x={tilt} renderOrder={2}>
        <torusGeometry args={[.185,.008,5,40]} />
        <meshBasicMaterial color={active ? "#188665" : "#d9792f"} transparent opacity={.85} depthTest={false} depthWrite={false} />
      </mesh>)}
      <mesh position-y={.185} renderOrder={2}><sphereGeometry args={[.028,8,6]} /><meshBasicMaterial color="#ffab54" transparent depthTest={false} depthWrite={false} /></mesh>
    </group>
    <group ref={arrow} position={axis.clone().multiplyScalar(.5)} quaternion={aim}>
      <mesh renderOrder={3}><coneGeometry args={[.075,.17,14]} /><meshBasicMaterial color="#ff713d" depthTest={false} depthWrite={false} /></mesh>
      <mesh position-y={.15} renderOrder={3}><cylinderGeometry args={[.026,.026,.16,10]} /><meshBasicMaterial color="#ff713d" depthTest={false} depthWrite={false} /></mesh>
    </group>
    <mesh><sphereGeometry args={[.255,12,8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} /></mesh>
  </group>;
}

// Komponen berikutnya berdenyut pelan dan lingkaran jingga di lantai ikut berkedip.
function Pulse({ children, active }: { children:ReactNode; active:boolean }) {
  const ref = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const idle = useIdleInvalidate();
  useFrame((_,dt) => {
    if (!ref.current || !active || prefersReducedMotion()) return;
    clock.current += Math.min(dt,.1);
    ref.current.scale.setScalar(1 + Math.sin(clock.current*4)*.035);
    idle();
  });
  return <group ref={ref}>{children}</group>;
}
function PulseRing({ radius, color }: { radius:number; color:string }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const clock = useRef(0);
  const idle = useIdleInvalidate();
  useFrame((_,dt) => {
    if (!material.current || prefersReducedMotion()) return;
    clock.current += Math.min(dt,.1);
    material.current.opacity = .35 + (Math.sin(clock.current*4)+1)*.28;
    idle();
  });
  return <mesh rotation-x={-Math.PI/2}>
    <ringGeometry args={[radius-.012,radius+.012,64]} />
    <meshBasicMaterial ref={material} color={color} transparent opacity={.6} depthWrite={false} side={THREE.DoubleSide} />
  </mesh>;
}

function Robot({ models, stand, game, socket, wrist }: {
  models: THREE.Object3D[];
  stand: THREE.Object3D;
  game: Game;
  socket: RefObject<THREE.Group|null>;
  wrist: RefObject<THREE.Group|null>;
}) {
  const { count,selected,joints,highlight } = game;
  const showBlueprint = selected === null && count < 6;
  const content = (i:number) => {
    const built = i < count;
    const current = i === count;
    const h = (["yaw","shoulder","shoulder","elbow","elbow","grip"] as const)[i];
    const active = h === highlight || (i === 5 && game.robotMode === "hand" && highlight === "wrist");
    const style:ModelStyle = built ? (active ? "active" : "real") :
      selected === i && current ? "socket-preview" : "blueprint";
    const model = <PartModel index={i} source={models[i]} style={style} game={game} attached={built} wristRef={wrist}/>;
    return <>
      {built ? <SeatedPart index={i} toolApproachAngle={gripperApproachAngle(game)}>{model}</SeatedPart> :
        (current && (showBlueprint || selected===i)) && model}
      {current && <group ref={socket}>
        <Locator active={selected===i} index={i} toolApproachAngle={gripperApproachAngle(game)} onClick={e => {
          e.stopPropagation();
          if (e.delta > 4) return;
          if (selected === i) game.place(0,i);
          else game.select(i);
        }} />
      </group>}
    </>;
  };
  return <>
    <Model source={stand} />
    <group position-y={.16} rotation-y={joints.yaw*D}>
      {content(0)}
      <group position-y={.22}>
        {content(1)}
        <group position-y={.40} rotation-z={joints.shoulder*D}>
          {content(2)}
          <group position-x={1.35}>
            <group rotation-z={joints.elbow*D}>
              {content(3)}
              {content(4)}
              <group name="HandMount" position-x={1.10} rotation-z={-(joints.elbow+joints.shoulder)*D}>
                {content(5)}
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  </>;
}

type Gesture = {
  index:number; pointerId:number; startX:number; startY:number; dragging:boolean;
  capture: Element; plane: THREE.Plane; offset: THREE.Vector3; snapped: boolean;
};
function LooseParts({ models,game,socket,lock,controls,inspecting,bus }: {
  bus:Bus; models:THREE.Object3D[]; game:Game; socket:RefObject<THREE.Group|null>; lock:RefObject<boolean>; controls:RefObject<OrbitControls|null>; inspecting:number|null;
}) {
  const { camera,gl,invalidate } = useThree();
  const slotFor = useCallback((i:number) => i === 5 && game.robotMode === "hand" ? HAND_SLOT : LOOSE[i], [game.robotMode]);
  const holdCamera = useCallback((held:boolean) => {
    lock.current = held;
    if (controls.current) {
      controls.current.enableRotate = !held;
      controls.current.enableZoom = !held;
    }
    invalidate();
  },[controls,lock,invalidate]);
  const gesture = useRef<Gesture|null>(null);
  const slots = useRef<(THREE.Group|null)[]>([]);
  const last = useRef(game); last.current = game;
  const rest = useCallback((index:number, node:THREE.Group) => {
    if (inspecting === index && socket.current) {
      socket.current.getWorldQuaternion(node.quaternion);
      socket.current.getWorldPosition(node.position);
      const toolAngle = gripperApproachAngle(last.current);
      const axis = insertionAxis(index,toolAngle).applyQuaternion(node.quaternion);
      const handSocket = index === 5 && toolAngle === null;
      const travel = handSocket ? handApproachDistance(node,.76) : index < 2 ? .48 : .76;
      node.position.addScaledVector(axis,travel);
    } else {
      const slot = slotFor(index);
      node.position.set(...slot.pos); node.rotation.set(...slot.rot);
    }
  },[inspecting,socket,slotFor]);
  useLayoutEffect(() => {
    slots.current.forEach((obj,i) => { if (obj && gesture.current?.index!==i) rest(i,obj); });
    invalidate();
  },[rest,invalidate,game.count,game.joints,game.selected]);
  const finishGesture = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    const obj = slots.current[g.index];
    if (obj) rest(g.index,obj);
    gl.domElement.style.cursor = "";
    holdCamera(false);
    if (gl.domElement.hasPointerCapture(g.pointerId) && g.capture.hasPointerCapture(g.pointerId)) {
      g.capture.releasePointerCapture(g.pointerId);
    }
  },[gl,holdCamera,rest]);
  useLayoutEffect(() => {
    if (gesture.current && gesture.current.index !== game.count) finishGesture();
  },[game.count,finishGesture]);
  useEffect(() => {
    const el = gl.domElement;
    const cancelPointer = (event:PointerEvent) => {
      if (gesture.current?.pointerId === event.pointerId) finishGesture();
    };
    el.addEventListener("pointercancel",cancelPointer);
    el.addEventListener("lostpointercapture",cancelPointer);
    window.addEventListener("blur",finishGesture);
    return () => {
      el.removeEventListener("pointercancel",cancelPointer);
      el.removeEventListener("lostpointercapture",cancelPointer);
      window.removeEventListener("blur",finishGesture);
      finishGesture();
    };
  },[gl,finishGesture]);
  useEffect(() => {
    const el = gl.domElement;
    const mime = "application/x-rakitron-part";
    const ray = new THREE.Raycaster();
    const normal = new THREE.Vector3(), anchor = new THREE.Vector3(), point = new THREE.Vector3();
    const uv = new THREE.Vector2(), plane = new THREE.Plane();
    let moved:number|null = null;
    let snapped = false;
    function project(event:DragEvent) {
      if (!socket.current) return false;
      const bounds = el.getBoundingClientRect();
      uv.set((event.clientX-bounds.left)/bounds.width*2-1, 1-(event.clientY-bounds.top)/bounds.height*2);
      camera.getWorldDirection(normal); socket.current.getWorldPosition(anchor);
      plane.setFromNormalAndCoplanarPoint(normal,anchor);
      ray.setFromCamera(uv,camera);
      return Boolean(ray.ray.intersectPlane(plane,point));
    }
    function restore() {
      if (moved !== null) {
        const part = slots.current[moved];
        if (part) rest(moved,part);
      }
      moved = null; snapped = false;
      invalidate();
    }
    function over(event:DragEvent) {
      if (!event.dataTransfer?.types.includes(mime)) return;
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
      const index = last.current.selected;
      if (index===null || !project(event) || !socket.current) return;
      const part = slots.current[index];
      if (!part) return;
      moved = index;
      noteMotion();
      const near = point.distanceTo(anchor) <= SNAP_DISTANCE;
      if (near && !snapped) bus.emit({ type:"magnet", pos:[anchor.x,anchor.y,anchor.z] });
      snapped = near;
      part.position.copy(near ? anchor : point);
      socket.current.getWorldQuaternion(part.quaternion);
      invalidate();
    }
    function drop(event:DragEvent) {
      if (!event.dataTransfer?.types.includes(mime)) return;
      event.preventDefault();
      const text = event.dataTransfer.getData(mime);
      const index = Number(text);
      const distance = project(event) ? point.distanceTo(anchor) : Infinity;
      restore();
      if (text && Number.isInteger(index)) last.current.place(distance,index);
    }
    el.addEventListener("dragover",over);
    el.addEventListener("drop",drop);
    el.addEventListener("dragleave",restore);
    window.addEventListener("dragend",restore);
    return () => {
      el.removeEventListener("dragover",over); el.removeEventListener("drop",drop);
      el.removeEventListener("dragleave",restore); window.removeEventListener("dragend",restore); restore();
    };
  },[gl,camera,socket,invalidate,rest,bus]);
  const begin = (i:number,e:Pointer) => {
    if (e.button!==0 || gesture.current || !socket.current || i!==game.count) return;
    if (e.intersections.some(hit => hit.eventObject.userData.assemblySocket)) return;
    e.stopPropagation();
    const obj = slots.current[i];
    if (!obj) return;
    const anchor = socket.current.getWorldPosition(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),anchor);
    const point = e.ray.intersectPlane(plane,new THREE.Vector3());
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const fromAnchor = new THREE.Ray(origin,obj.position.clone().sub(origin).normalize()).intersectPlane(plane,new THREE.Vector3());
    if (!point || !fromAnchor) return;
    const capture = e.target as Element | null;
    if (!capture) return;
    capture.setPointerCapture(e.pointerId);
    holdCamera(true);
    gesture.current = {
      index:i,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,dragging:false,
      capture,plane,offset:fromAnchor.sub(point),snapped:false,
    };
    if (game.selected!==i) game.select(i);
  };
  // Either the pointer or the part's input pivot may be aligned with the socket.
  // Long links can be grabbed anywhere along their length.
  const dragPosition = (g:Gesture,ray:THREE.Ray) => {
    noteMotion();
    const target = socket.current;
    const part = slots.current[g.index];
    if (!part || !target) return Infinity;
    const pointer = ray.intersectPlane(g.plane,new THREE.Vector3());
    if (!pointer) return Infinity;
    const anchor = target.getWorldPosition(new THREE.Vector3());
    part.position.copy(pointer).add(g.offset);
    const distance = Math.min(pointer.distanceTo(anchor),part.position.distanceTo(anchor));
    const near = distance <= SNAP_DISTANCE;
    if (near) part.position.copy(anchor);
    if (near && !g.snapped) bus.emit({ type:"magnet", pos:[anchor.x,anchor.y,anchor.z] });
    g.snapped = near;
    target.getWorldQuaternion(part.quaternion);
    return distance;
  };
  const move = (e:Pointer) => {
    const g = gesture.current;
    if (!g || g.pointerId!==e.pointerId || !socket.current) return;
    e.stopPropagation();
    if (!g.dragging && Math.hypot(e.clientX-g.startX,e.clientY-g.startY)<5) return;
    g.dragging = true;
    dragPosition(g,e.ray);
    invalidate();
  };
  const end = (e:Pointer) => {
    const g = gesture.current;
    if (!g || g.pointerId!==e.pointerId) return;
    e.stopPropagation();
    const dragged = g.dragging || Math.hypot(e.clientX-g.startX,e.clientY-g.startY) >= 5;
    const distance = dragged ? dragPosition(g,e.ray) : Infinity;
    finishGesture();
    if (dragged) last.current.place(distance,g.index);
  };
  return <>{models.map((model,i) => {
    if (i<game.count) return null;
    const selected = game.selected === i;
    const slot = slotFor(i);
    return <group key={NAMES[i]}>
      {selected && inspecting!==i && <group position={[slot.pos[0],.013,slot.pos[2]]}>
        <Ring radius={.28} thickness={.018} color="#38876c" opacity={.88} />
      </group>}
      {!selected && i===game.count && inspecting!==i && <group position={[slot.pos[0],.013,slot.pos[2]]}>
        <PulseRing radius={.3} color="#ff713d" />
      </group>}
      <group ref={el => { slots.current[i]=el; }} position={slot.pos} rotation={slot.rot}
        onPointerDown={i===game.count ? e => begin(i,e) : undefined}
        onPointerMove={i===game.count ? move : undefined}
        onPointerUp={i===game.count ? end : undefined}
        onPointerOver={i===game.count ? () => { gl.domElement.style.cursor="grab"; } : undefined}
        onPointerOut={i===game.count ? () => { gl.domElement.style.cursor=""; } : undefined}>
        <group rotation={selected ? (i < 2 || (i===5 && game.robotMode === "hand") ? [0,game.rotation*D,0] : i===5 ? [game.rotation*D,0,0] : [0,0,game.rotation*D]) : [0,0,0]}>
          <Pulse active={i===game.count && !selected}><PartModel index={i} source={model} game={game} style={selected ? "selected" : "real"} layers={selected ? game.built : undefined}/></Pulse>
        </group>
      </group>
    </group>;
  })}</>;
}

function Workbench({ game,view="perspective",cameraReset=0,socketFocus=0,zoom=0,bus:given,onReady }: WorkshopSceneProps) {
  const bus = useMemo(() => given ?? createBus(),[given]);
  useLayoutEffect(() => { noteMotion(); }); // setiap perubahan status (sendi, kubus jatuh, pilihan) menggerakkan bayangan
  const asset = useLoader(GLTFLoader,"/models/rakitron-arm.glb");
  const models = useMemo(() => NAMES.map(name => {
    const part = asset.scene.getObjectByName(name);
    if (!part) throw new Error("Missing robot component " + name);
    return part;
  }),[asset]);
  const stand = useMemo(() => asset.scene.getObjectByName("Stand"),[asset]);
  const slotPos = useCallback((i:number) => (i === 5 && game.robotMode === "hand" ? HAND_SLOT : LOOSE[i]).pos,[game.robotMode]);
  const socket = useRef<THREE.Group|null>(null);
  const wrist = useRef<THREE.Group|null>(null);
  const lock = useRef(false);
  const controls = useRef<OrbitControls|null>(null);
  const [inspecting,setInspecting] = useState<Inspection>(null);
  const previousFocus = useRef(socketFocus);
  const completeHand = game.robotMode === "hand" && game.count === NAMES.length;
  useLayoutEffect(() => { setInspecting(null); },[cameraReset,view]);
  useLayoutEffect(() => { setInspecting(completeHand ? "hand" : null); },[game.count,game.robotMode,completeHand]);
  useLayoutEffect(() => {
    if (previousFocus.current===socketFocus) return;
    previousFocus.current = socketFocus;
    if (game.count < NAMES.length) setInspecting(game.count);
    else if (completeHand) setInspecting("hand");
  },[socketFocus,game.count,completeHand]);
  const activeInspection = inspecting===game.count || (inspecting==="hand" && completeHand) ? inspecting : null;
  useEffect(() => { onReady?.(); },[onReady]);
  if (!stand) throw new Error("Missing robot stand");
  return <>
    <color attach="background" args={["#e8ece3"]} />
    <StudioLights />
    <CameraRig view={view} reset={cameraReset} zoom={zoom} lock={lock} focus={socketFocus} socket={socket} wrist={wrist} controls={controls} inspecting={activeInspection} complete={game.count===6} toolApproachAngle={gripperApproachAngle(game)} />
    <WorkshopTable />
    <Effects bus={bus} slotPos={slotPos}>
      <Robot stand={stand} models={models} game={game} socket={socket} wrist={wrist} />
      <LooseParts key={game.robotMode} bus={bus} models={models} game={game} socket={socket} lock={lock} controls={controls} inspecting={typeof activeInspection === "number" ? activeInspection : null} />
    </Effects>
    <ReceiverTray tray={TRAY} />
    <group name="MissionCube" position={game.cube.position} quaternion={game.cube.orientation}>
      <WoodenCube position={[0,0,0]} yaw={0} />
    </group>
  </>;
}

function Unavailable({ retry }: { retry?:()=>void }) {
  return <div role="status" style={{height:"100%",minHeight:200,display:"grid",alignContent:"center",justifyItems:"center",textAlign:"center",gap:12,padding:24,color:"#314537",background:"#e7ece2"}}>
    <strong>Tampilan 3D belum tersedia</strong>
    <span>Coba aktifkan akselerasi grafis di browser, lalu muat ulang bengkel.</span>
    {retry && <button type="button" onClick={retry}>Muat ulang bengkel</button>}
  </div>;
}

class SceneBoundary extends Component<{children:ReactNode; retry:()=>void},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() { return this.state.failed ? <Unavailable retry={this.props.retry}/> : this.props.children; }
}

// Resolusi turun bertahap (1.6 -> 1.25 -> 1) bila pengiriman frame terus lambat, agar gerakan tetap mulus.
const DPR_LEVELS = [1.6,1.25,1];
function AdaptiveQuality({ onSlow }: { onSlow:()=>void }) {
  const sample = useRef({ n:0, total:0, strikes:0, warm:0 });
  // Prioritas 1 mengambil alih render sehingga biaya satu frame dapat diukur.
  useFrame(({ gl,scene,camera }) => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = shadowsNeedUpdate();
    const start = performance.now();
    gl.render(scene,camera);
    const s = sample.current;
    if (s.warm < 45) { s.warm++; return; } // compile shader dan unggah tekstur tidak dihitung
    s.total += performance.now() - start;
    if (++s.n < 30) return;
    s.strikes = s.total / s.n > 13 ? s.strikes + 1 : 0;
    s.n = 0; s.total = 0;
    if (s.strikes >= 2) { s.strikes = 0; onSlow(); }
  },1);
  return null;
}

export default function WorkshopScene(props:WorkshopSceneProps) {
  const [version,setVersion] = useState(0);
  const [level,setLevel] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  // Adegan yang tergulir keluar layar berhenti menggambar sama sekali.
  useEffect(() => {
    const node = wrapper.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setSceneVisible(entry.isIntersecting));
    observer.observe(node);
    return () => { observer.disconnect(); setSceneVisible(true); };
  },[]);
  const slower = useCallback(() => setLevel(l => Math.min(DPR_LEVELS.length-1,l+1)),[]);
  return <div ref={wrapper} style={{position:"absolute",inset:0,touchAction:"none"}} aria-label="Meja perakitan lengan robot tiga dimensi">
    <SceneBoundary key={version} retry={() => setVersion(x => x+1)}>
      <Canvas frameloop="demand" shadows={SHADOWS} dpr={Math.min(DPR_LEVELS[level],typeof window === "undefined" ? 1 : window.devicePixelRatio)}
        gl={RENDERER} camera={CAMERA}
        fallback={<Unavailable />} style={{width:"100%",height:"100%",touchAction:"none"}}>
        <AdaptiveQuality onSlow={slower} />
        <Suspense fallback={null}><Workbench {...props} /></Suspense>
      </Canvas>
    </SceneBoundary>
  </div>;
}




