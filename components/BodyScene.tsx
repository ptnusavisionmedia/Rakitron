"use client";

import { Component, useEffect, useLayoutEffect, useMemo, useRef, type Dispatch, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BODY_ANCHORS, BODY_PARTS, BODY_SNAP_DISTANCE, type BodyAction, type BodyGameState } from "../lib/bodyGame";
import { createBodyModel } from "../lib/bodyModel";
import WorkshopTable from "./WorkshopTable";

type V3 = [number, number, number];
type Pointer = ThreeEvent<PointerEvent>;
type View = "perspective" | "front" | "top";
export type BodySceneProps = {
  state: BodyGameState;
  dispatch: Dispatch<BodyAction>;
  view?: View;
  zoom?: number;
  cameraReset?: number;
  socketFocus?: number;
  onReady?: () => void;
  covered?: boolean;
};

const DEGREES = Math.PI / 180;
const JIG_TOP = .105;
const MIME = "application/x-rakitron-body";
const STAGING = [
  { x: -1.02, z: .74, yaw: -.13 }, { x: 1.02, z: .74, yaw: .13 },
  { x: -1.00, z: -.91, yaw: -.13 }, { x: -1.72, z: -.08, yaw: -.25 },
  { x: 1.72, z: -.08, yaw: .25 }, { x: .98, z: -.95, yaw: .10 },
];

function BodyLights() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = pmrem.fromScene(room, .04);
    const old = scene.environment;
    scene.environment = environment.texture;
    const oldIntensity = scene.environmentIntensity;
    scene.environmentIntensity = .65;
    room.dispose();
    pmrem.dispose();
    invalidate();
    return () => { scene.environment = old; scene.environmentIntensity = oldIntensity; environment.dispose(); };
  }, [gl, scene, invalidate]);
  return <>
    <hemisphereLight color="#f8f9f5" groundColor="#b2ad9e" intensity={.86} />
    <directionalLight position={[-3.8,6.2,4.5]} intensity={2.2} color="#ffede1" castShadow
      shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-near={.2} shadow-camera-far={14}
      shadow-camera-left={-3.1} shadow-camera-right={3.1} shadow-camera-top={3.1} shadow-camera-bottom={-3.1}
      shadow-bias={-.0004} shadow-normalBias={.009} />
    <directionalLight position={[3.1,3.4,-3.2]} intensity={1.7} color="#d3e5ff"/>
  </>;
}

// Fixed sole keys locate both legs while the rear support holds the pelvis for joint tests.
function AssemblyJig() {
  const jig = useMemo(() => {
    const group = new THREE.Group();
    group.name = "BodyJig";
    const steel = new THREE.MeshStandardMaterial({color:"#49514b",metalness:.64,roughness:.42});
    const plate = new THREE.MeshStandardMaterial({color:"#c3c4b6",metalness:.45,roughness:.52});
    const rubber = new THREE.MeshStandardMaterial({color:"#29332d",roughness:.78});
    const copper = new THREE.MeshStandardMaterial({color:"#bb693c",metalness:.62,roughness:.44});
    function box(at: V3, size: V3, radius: number, material: THREE.Material) {
      const box = new THREE.Mesh(new RoundedBoxGeometry(...size, 2, radius), material);
      box.position.set(...at);
      box.castShadow = box.receiveShadow = true;
      group.add(box);
    }
    box([0,.046,0], [1.15,.086,.84], .032, steel);
    box([0,.094,0], [1.11,.022,.80], .009, plate);
    box([0,.61,-.28], [.106,1.02,.09], .015, steel);
    box([0,.77,-.328], [.052,.67,.015], .006, plate);
    box([0,.64,-.28], [.134,.07,.12], .012, rubber);
    box([0,1.18,-.22], [.064,.25,.068], .01, plate);
    box([0,1.22,-.14], [.22,.042,.22], .011, rubber);
    for (const side of [-1,1]) {
      const footX = BODY_ANCHORS[side < 0 ? "right-leg" : "left-leg"][0];
      box([footX,JIG_TOP+.002,.025],[.235,.005,.36],.002,rubber);
      box([footX,JIG_TOP+.014,-.15],[.174,.027,.027],.006,steel);
      box([footX,JIG_TOP+.002,.245],[.115,.004,.012],.002,copper);
      for (const z of [-.32,.32]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(.017,.017,.012,6), steel);
        bolt.position.set(side*.475,JIG_TOP+.002,z);
        group.add(bolt);
      }
    }
    return {group, dispose() {
      group.traverse(node => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
      [steel,plate,rubber,copper].forEach(m => m.dispose());
    }};
  }, []);
  useEffect(() => () => jig.dispose(),[jig]);
  return <primitive object={jig.group} dispose={null}/>;
}

function dockingPoint(index: number, torso=0) {
  const anchor = BODY_ANCHORS[BODY_PARTS[index].id];
  const point = new THREE.Vector3(...anchor);
  if (index < 2) point.y = 0;
  if (index >= 3 && torso) point.applyAxisAngle(UP, -torso * DEGREES);
  point.y += JIG_TOP;
  return point;
}
const UP = new THREE.Vector3(0,1,0);
const horizontal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
function activeSockets(step: number) {
  return step===0 ? [0,1] : step===3 ? [3,4] : step<6 ? [step] : [];
}

function Socket({index,current,handle,onPlace}: {index:number;current:boolean;handle:(node:THREE.Group|null)=>void;onPlace:()=>void}) {
  const ringRadius = index < 2 ? .145 : index === 2 ? .17 : .103;
  const color = current ? "#198263" : "#718978";
  const arm = index===3 || index===4;
  return <group name={"BodySocket-"+BODY_PARTS[index].id} ref={handle}
    onPointerDown={e => { if(e.button===0) e.stopPropagation(); }}
    onClick={e => { e.stopPropagation(); if(e.delta<5) onPlace(); }}
    rotation={arm ? [0,Math.PI/2,0] : [-Math.PI/2,0,0]}>
    <mesh position-z={.006} renderOrder={2}>
      <torusGeometry args={[ringRadius,.009,8,48]}/>
      <meshBasicMaterial color={color} transparent opacity={current ? .98 : .58} depthWrite={false} />
    </mesh>
    {current && <mesh position-z={.007}>
      <ringGeometry args={[ringRadius+.021,ringRadius+.026,48]}/>
      <meshBasicMaterial color="#59977e" side={THREE.DoubleSide} transparent opacity={.68} depthWrite={false}/>
    </mesh>}
    <mesh visible={false}>
      <sphereGeometry args={[ringRadius*1.25,12,10]}/>
      <meshBasicMaterial />
    </mesh>
  </group>;
}

type CameraProps = Pick<BodySceneProps,"view"|"zoom"|"cameraReset"|"socketFocus"> & {
  controls: React.RefObject<OrbitControls|null>; count: number; complete: boolean; optics: THREE.Object3D;
};
function CameraControls({controls,view="perspective",zoom=0,cameraReset=0,socketFocus=0,count,complete,optics}:CameraProps) {
  const { camera, gl, size, invalidate } = useThree();
  const lastZoom = useRef(zoom);
  const lastFocus = useRef(socketFocus);
  const lastReset = useRef(cameraReset);
  useLayoutEffect(() => {
    const orbit = new OrbitControls(camera,gl.domElement);
    orbit.enablePan = false;
    orbit.enableDamping = false;
    orbit.minDistance = .95;
    orbit.maxDistance = 15;
    orbit.minPolarAngle = .025;
    orbit.maxPolarAngle = Math.PI*.485;
    orbit.rotateSpeed = .76;
    const refresh=() => invalidate();
    orbit.addEventListener("change",refresh);
    controls.current = orbit;
    return () => { orbit.removeEventListener("change",refresh); orbit.dispose(); controls.current=null; };
  },[camera,gl,controls,invalidate]);
  useLayoutEffect(() => {
    const orbit = controls.current;
    if (!orbit || !(camera instanceof THREE.PerspectiveCamera)) return;
    if (lastReset.current !== cameraReset) { lastReset.current=cameraReset; lastZoom.current=zoom; }
    const aspect = size.width / Math.max(1,size.height);
    const top = view==="top";
    const halfHeight = top ? (complete ? 1.06 : 1.45) : (complete ? 1.43 : 1.54);
    const halfWidth = complete ? .98 : 2.00;
    const distance = Math.max(halfHeight, halfWidth/aspect) / Math.tan(camera.fov*DEGREES/2) + (complete ? .29 : .47);
    const dir = (top ? new THREE.Vector3(.015,1,.017) : view==="front" ? new THREE.Vector3(0,.12,1) :
      new THREE.Vector3(.37,complete ? .20 : .43,1)).normalize();
    orbit.target.set(0,top ? .65 : complete ? 1.36 : 1.13,0);
    camera.position.copy(orbit.target).addScaledVector(dir,distance);
    orbit.update(); invalidate();
  },[camera,controls,size.width,size.height,view,cameraReset,complete,invalidate]);
  useLayoutEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const change = zoom-lastZoom.current; lastZoom.current=zoom;
    if (!change) return;
    const dir = camera.position.clone().sub(orbit.target);
    camera.position.copy(orbit.target).add(dir.setLength(THREE.MathUtils.clamp(dir.length()*Math.pow(.83,change),orbit.minDistance,orbit.maxDistance)));
    orbit.update(); invalidate();
  },[zoom,camera,controls,invalidate]);
  useLayoutEffect(() => {
    if (lastFocus.current===socketFocus) return;
    lastFocus.current=socketFocus;
    const orbit = controls.current;
    if (!orbit || !(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = size.width / Math.max(1, size.height);
    const target = complete ? optics.getWorldPosition(new THREE.Vector3()) : dockingPoint(count);
    const dir = new THREE.Vector3(count===3 ? -.74 : .60,.48,1);
    if (complete) {
      optics.getWorldDirection(dir);
      target.addScaledVector(dir, -.07);
      target.y -= .018;
      dir.applyAxisAngle(UP, .24);
      dir.y += .09;
    }
    dir.normalize();
    const distance = complete ? Math.max(1.02, .8 / aspect) : Math.max(2.6, 2.1 / aspect);
    orbit.target.copy(target);
    camera.position.copy(target).addScaledVector(dir,distance);
    orbit.update(); invalidate();
  },[socketFocus,count,complete,camera,controls,invalidate,size.width,size.height,optics]);
  return null;
}

type Drag = {
  id: number; index: number; x: number; y: number; moved: boolean;
  capture: Element; plane: THREE.Plane; offset: THREE.Vector3;
};

function Bench({state,dispatch,view,zoom,cameraReset,socketFocus,onReady,covered=false}:BodySceneProps) {
  const {camera,gl,invalidate} = useThree();
  const [rig, ghostMaterial] = useMemo(() => [createBodyModel(),
    new THREE.MeshBasicMaterial({color:"#3b967a",transparent:true,opacity:.115,depthWrite:false})] as const,[]);
  const modules = useMemo(() => BODY_PARTS.map(({id},i) => {
    const source = rig.parts[id];
    const dock = dockingPoint(i); dock.y -= JIG_TOP;
    const centerOffset = dock.clone().negate();
    const slot = STAGING[i];
    const localBox = new THREE.Box3().setFromObject(source,true).translate(centerOffset);
    // Keep the module face-up and centered on its tray as the child turns it.
    const positions = [0,90,180,270].map(angle => {
      const rotation = new THREE.Quaternion().setFromAxisAngle(UP,slot.yaw+angle*DEGREES).multiply(horizontal);
      const box = localBox.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
      const center = box.getCenter(new THREE.Vector3());
      return { rotation, stage: new THREE.Vector3(slot.x-center.x,.018-box.min.y,slot.z-center.z) };
    });
    // Loose modules stay at rest while the joints on the partially assembled robot move.
    const loose = source.clone(true);
    const ghost = source.clone(true);
    ghost.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material=ghostMaterial;
      object.castShadow=false;
      object.receiveShadow=false;
    });
    return { source, loose, ghost, positions, centerOffset };
  }),[rig,ghostMaterial]);
  useEffect(() => () => { rig.dispose(); ghostMaterial.dispose(); },[rig,ghostMaterial]);
  const latest = useRef(state); latest.current=state;
  const outer = useRef<(THREE.Group|null)[]>([]);
  const controls = useRef<OrbitControls|null>(null);
  const socketNodes = useRef<(THREE.Group|null)[]>([]);
  const ghostNode = useRef<THREE.Group|null>(null);
  const previousCount = useRef(state.count);
  const gesture = useRef<Drag|null>(null);
  const landing = useRef<{index:number; t:number; start:THREE.Vector3; end:THREE.Vector3}|null>(null);

  function rest(index: number) {
    const part = outer.current[index];
    if (!part) return;
    const s = latest.current;
    if (index<s.count) {
      part.position.copy(dockingPoint(index));
      part.quaternion.identity();
    } else {
      const turn = s.selected===index ? s.rotation/90 : 0;
      const { stage, rotation } = modules[index].positions[turn];
      part.position.copy(stage);
      part.quaternion.copy(rotation);
    }
  }

  useLayoutEffect(() => {
    const added = state.count===previousCount.current+1 ? previousCount.current : null;
    previousCount.current=state.count;
    for (let i=0;i<modules.length;i++) if (gesture.current?.index!==i) rest(i);
    if (added!==null && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const end=dockingPoint(added);
      const direction=added===3 ? new THREE.Vector3(-.24,0,0) :
        added===4 ? new THREE.Vector3(.24,0,0) : new THREE.Vector3(0,.22,0);
      landing.current={index:added,t:0,start:end.clone().add(direction),end};
      outer.current[added]?.position.copy(landing.current.start);
    } else if (landing.current && landing.current.index>=state.count) landing.current=null;
    invalidate();
  },[state.count,state.rotation,state.selected,modules,invalidate]);
  function liveSocket(index:number) {
    const at=dockingPoint(index,latest.current.pose.torso);
    // The planted leg lowers the pelvis when both knees bend (computed by the rig).
    if (index>=2) at.y+=rig.joints.HeadMount.position.y;
    return at;
  }
  useLayoutEffect(() => {
    rig.setPose(state.pose);
    socketNodes.current.forEach((node,i) => {
      if (!node) return;
      node.position.copy(liveSocket(i));
      if (i===3 || i===4) node.rotation.y=Math.PI/2 - state.pose.torso*DEGREES;
    });
    if (ghostNode.current) {
      ghostNode.current.position.copy(liveSocket(state.count));
      ghostNode.current.rotation.y=state.count>=3 ? -state.pose.torso*DEGREES : 0;
    }
    invalidate();
  },[rig,state.pose,state.count,invalidate]);
  useEffect(() => { onReady?.(); },[onReady]);
  useFrame((_,dt) => {
    const motion=landing.current;
    if (!motion) return;
    motion.t=Math.min(1,motion.t+Math.min(.1,dt)/.27);
    const t=1-Math.pow(1-motion.t,3);
    outer.current[motion.index]?.position.lerpVectors(motion.start,motion.end,t);
    if (motion.t===1) landing.current=null;
    else invalidate();
  });

  function finishDrag() {
    const drag=gesture.current;
    if (!drag) return;
    gesture.current=null;
    if (controls.current) controls.current.enabled=true;
    if (gl.domElement.hasPointerCapture(drag.id)) drag.capture.releasePointerCapture(drag.id);
    gl.domElement.style.cursor="";
    rest(drag.index); invalidate();
  }
  useEffect(() => {
    const el=gl.domElement;
    const cancel=(e:PointerEvent) => { if (gesture.current?.id===e.pointerId) finishDrag(); };
    el.addEventListener("pointercancel",cancel); el.addEventListener("lostpointercapture",cancel);
    window.addEventListener("blur",finishDrag);
    return () => {
      el.removeEventListener("pointercancel",cancel); el.removeEventListener("lostpointercapture",cancel);
      window.removeEventListener("blur",finishDrag); finishDrag();
    };
  },[gl,modules,invalidate]);
  useLayoutEffect(() => {
    if (gesture.current && (gesture.current.index<state.count || gesture.current.index!==state.selected)) finishDrag();
  },[state.count,state.selected]);

  useLayoutEffect(() => {
    if (covered) finishDrag();
    else invalidate();
  },[covered,invalidate]);

  function begin(index:number,e:Pointer) {
    if (e.button!==0 || index<state.count || gesture.current) return;
    e.stopPropagation();
    if (state.selected!==index || state.built<4) {
      dispatch({type:"select",index});
      return;
    }
    const anchor=liveSocket(state.count);
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),anchor);
    const point=e.ray.intersectPlane(plane,new THREE.Vector3());
    const part=outer.current[index];
    const eye=camera.getWorldPosition(new THREE.Vector3());
    if (!point || !part) return;
    const handle=new THREE.Ray(eye,part.position.clone().sub(eye).normalize()).intersectPlane(plane,new THREE.Vector3());
    if (!handle) return;
    const capture=e.target as Element;
    capture.setPointerCapture(e.pointerId);
    if (controls.current) controls.current.enabled=false;
    gl.domElement.style.cursor="grabbing";
    gesture.current={id:e.pointerId,index,x:e.clientX,y:e.clientY,moved:false,capture,plane,offset:handle.sub(point)};
  }
  function placeAtRay(index:number,ray:THREE.Ray,plane:THREE.Plane,offset:THREE.Vector3) {
    const s=latest.current;
    const pointer=ray.intersectPlane(plane,new THREE.Vector3());
    const part=outer.current[index];
    if (!part || !pointer || s.count===6) return {socket:s.count,distance:Infinity};
    const origin=pointer.clone().add(offset);
    const candidates=activeSockets(s.count);
    let socket=candidates[0], distance=Infinity;
    for (const candidate of candidates) {
      const at=liveSocket(candidate);
      const gap=Math.min(at.distanceTo(origin),ray.distanceToPoint(at));
      if (gap<distance) { socket=candidate; distance=gap; }
    }
    part.position.copy(distance<=BODY_SNAP_DISTANCE ? liveSocket(socket) : origin);
    part.rotation.set(0,s.rotation*DEGREES,0);
    invalidate();
    return {socket,distance};
  }
  function move(e:Pointer) {
    const g=gesture.current;
    if (!g || e.pointerId!==g.id) return;
    e.stopPropagation();
    if (!g.moved && Math.hypot(e.clientX-g.x,e.clientY-g.y)<5) return;
    g.moved=true;
    placeAtRay(g.index,e.ray,g.plane,g.offset);
  }
  function end(e:Pointer) {
    const g=gesture.current;
    if (!g || e.pointerId!==g.id) return;
    e.stopPropagation();
    const moved=g.moved || Math.hypot(e.clientX-g.x,e.clientY-g.y)>=5;
    const drop=moved ? placeAtRay(g.index,e.ray,g.plane,g.offset) : null;
    finishDrag();
    if (drop) dispatch({type:"place",index:drop.socket,distance:drop.distance});
  }
  useEffect(() => {
    const el=gl.domElement;
    const raycast=new THREE.Raycaster();
    let held:number|null=null;
    function restore() {
      if (held!==null) { rest(held); held=null; invalidate(); }
    }
    function project(e:DragEvent,index:number) {
      const s=latest.current, rect=el.getBoundingClientRect();
      const ndc=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
      raycast.setFromCamera(ndc,camera);
      const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),liveSocket(s.count));
      held=index;
      return placeAtRay(index,raycast.ray,plane,new THREE.Vector3());
    }
    function over(e:DragEvent) {
      if (!e.dataTransfer?.types.includes(MIME)) return;
      e.preventDefault(); e.dataTransfer.dropEffect="move";
      const s=latest.current;
      if (s.count<6 && s.selected!==null && s.built===4) project(e,s.selected);
    }
    function drop(e:DragEvent) {
      if (!e.dataTransfer?.types.includes(MIME)) return;
      e.preventDefault();
      const text=e.dataTransfer.getData(MIME), index=Number(text), s=latest.current;
      if (text.trim()==="" || !Number.isInteger(index) || index<0 || index>=6 || s.count===6) { restore(); return; }
      if (s.selected!==index) dispatch({type:"select",index});
      else {
        const at=project(e,index);
        dispatch({type:"place",index:at.socket,distance:at.distance});
      }
      restore();
    }
    el.addEventListener("dragover",over); el.addEventListener("drop",drop);
    el.addEventListener("dragleave",restore); window.addEventListener("dragend",restore);
    return () => {
      el.removeEventListener("dragover",over); el.removeEventListener("drop",drop);
      el.removeEventListener("dragleave",restore); window.removeEventListener("dragend",restore); restore();
    };
  },[camera,gl,dispatch,modules,invalidate]);

  const next=BODY_PARTS[state.count];
  const sockets=activeSockets(state.count);
  const needsPick=state.selected===null && next;
  function mountAt(index:number) {
    if (state.selected===null) dispatch({type:"select",index});
    else dispatch({type:"place",index,distance:0});
  }
  return <>
    <color attach="background" args={["#e8ece3"]}/>
    <BodyLights/>
    <CameraControls controls={controls} view={view} zoom={zoom} cameraReset={cameraReset}
      socketFocus={socketFocus} count={state.count} complete={!next}
      optics={rig.optics}/>
    <WorkshopTable/>
    <AssemblyJig/>
    {BODY_PARTS.map(({id},i) => {
      const loose=i>=state.count;
      return <group key={id} name={"BodyModule-"+id} ref={el=>{outer.current[i]=el;}}
        onPointerDown={loose ? e=>begin(i,e) : undefined}
        onPointerMove={loose ? move : undefined} onPointerUp={loose ? end : undefined}
        onPointerOver={loose ? ()=>{ if(!gesture.current) gl.domElement.style.cursor="grab"; } : undefined}
        onPointerOut={loose ? ()=>{ if(!gesture.current) gl.domElement.style.cursor=""; } : undefined}>
        <group position={modules[i].centerOffset}><primitive object={loose ? modules[i].loose : modules[i].source} dispose={null}/></group>
      </group>;
    })}
    {needsPick && <mesh position={[STAGING[state.count].x,.009,STAGING[state.count].z]} rotation-x={-Math.PI/2}>
      <ringGeometry args={[.34,.353,48]}/><meshBasicMaterial color="#bd642f" transparent opacity={.74} depthWrite={false}/>
    </mesh>}
    {next && <group name="BodyGhost" ref={ghostNode}
      onClick={e=>{ e.stopPropagation(); if(e.delta<5) mountAt(state.count); }}>
      <group position={modules[state.count].centerOffset}>
        <primitive object={modules[state.count].ghost} dispose={null}/>
      </group>
    </group>}
    {sockets.map(i=><Socket key={i} index={i} handle={node=>{socketNodes.current[i]=node;}} current={i===state.count} onPlace={()=>mountAt(i)}/>)}
  </>;
}

function MissingScene() {
  return <div className="scene-loading" role="status">Tampilan 3D belum tersedia. Kontrol perakitan tetap dapat digunakan.</div>;
}
class BodySceneBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() { return this.state.failed ? <MissingScene/> : this.props.children; }
}
export default function BodyScene(props:BodySceneProps) {
  return <div style={{position:"absolute",inset:0,touchAction:"none"}} aria-label="Meja perakitan robot seluruh tubuh tiga dimensi">
    <BodySceneBoundary>
      <Canvas frameloop={props.covered ? "never" : "demand"} dpr={[1,1.5]} camera={{position:[3,3,5],fov:33,near:.05,far:48}}
        gl={{antialias:true,alpha:false,powerPreference:"high-performance",toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:.97}}
        shadows={{type:THREE.PCFSoftShadowMap}} fallback={<MissingScene/>} style={{touchAction:"none"}}>
        <Bench {...props}/>
      </Canvas>
    </BodySceneBoundary>
  </div>;
}
