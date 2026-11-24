"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TRAY, type Vec3 } from "../lib/game";
import type { Bus, GameEvent } from "../lib/gameEvents";
import { prefersReducedMotion } from "./idle";

export type FxKind = "sparkle" | "pop" | "confetti" | "dust" | "tink";
export type FxApi = { burst(kind: FxKind, pos: Vec3 | THREE.Vector3, delay?: number): void };
export const FxContext = createContext<FxApi | null>(null);
export const useFx = () => useContext(FxContext);


const MAX = 420;
const RINGS = 4;
const VERT = `
attribute float aSize; attribute float aAlpha; attribute float aShape; attribute vec3 aColor;
varying float vAlpha; varying float vShape; varying vec3 vColor; uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aSize * uScale / -mv.z);
  vAlpha = aAlpha; vShape = aShape; vColor = aColor;
}`;
const FRAG = `
varying float vAlpha; varying float vShape; varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord - 0.5; float a = 1.0;
  if (vShape < 0.5) { float d = length(p); if (d > 0.5) discard; a = smoothstep(0.5, 0.12, d); }
  else if (vShape > 1.5) { float s = sqrt(abs(p.x)) + sqrt(abs(p.y)); if (s > 0.82) discard; a = smoothstep(0.82, 0.25, s); }
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

const WARM = ["#ffb347", "#ff713d", "#ffe27a", "#ffffff"];
const PARTY = ["#ff713d", "#ffd23f", "#3fb8af", "#7a9cff", "#ff7eb6", "#8ddb6b", "#ffffff"];
const DUST = ["#d8cdb8", "#c4b9a3", "#e6dfd0"];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

type Spec = {
  n: number; colors: string[]; speed: number; up?: number; life: [number, number]; size: [number, number];
  gravity: number; drag?: number; shape: number[]; flat?: boolean; spread?: number;
};
const SPECS: Record<FxKind, Spec> = {
  sparkle: { n: 22, colors: WARM, speed: 1.5, up: .6, life: [.5, .9], size: [.05, .1], gravity: 1.4, drag: 1.6, shape: [2, 2, 0] },
  pop: { n: 28, colors: WARM, speed: 2.1, up: .4, life: [.45, .85], size: [.04, .095], gravity: 2.6, drag: 1.8, shape: [2, 0, 0] },
  confetti: { n: 110, colors: PARTY, speed: 2.4, up: 3.6, life: [1.3, 2.3], size: [.045, .085], gravity: 4.4, drag: .9, shape: [1, 1, 2], spread: .9 },
  dust: { n: 12, colors: DUST, speed: .7, up: .15, life: [.35, .6], size: [.07, .13], gravity: -.3, drag: 3, shape: [0], flat: true },
  tink: { n: 9, colors: ["#ffffff", "#ffe27a"], speed: .9, up: .2, life: [.3, .5], size: [.04, .07], gravity: .4, drag: 2, shape: [2] },
};

type Pending = { at: number; kind: FxKind; pos: THREE.Vector3 };

export function Effects({ bus, slotPos, children }: { bus: Bus; slotPos: (index: number) => Vec3; children?: ReactNode }) {
  const { gl, camera, invalidate } = useThree();
  const state = useMemo(() => ({
    pos: new Float32Array(MAX * 3), vel: new Float32Array(MAX * 3),
    life: new Float32Array(MAX), maxLife: new Float32Array(MAX), size0: new Float32Array(MAX),
    gravity: new Float32Array(MAX), drag: new Float32Array(MAX),
    size: new Float32Array(MAX), alpha: new Float32Array(MAX), shape: new Float32Array(MAX), color: new Float32Array(MAX * 3),
    pending: [] as Pending[],
    rings: Array.from({ length: RINGS }, () => ({ t: 1, color: new THREE.Color() })),
    nextRing: 0, cursor: 0, scale: 1, active: false,
  }), []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(state.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(state.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(state.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aShape", new THREE.BufferAttribute(state.shape, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(state.color, 3));
    return g;
  }, [state]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 1 } },
  }), []);
  const ringGeometry = useMemo(() => new THREE.RingGeometry(.86, 1, 48), []);
  const ringMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const tmp = useMemo(() => new THREE.Color(), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); ringGeometry.dispose(); }, [geometry, material, ringGeometry]);

  const api = useMemo<FxApi>(() => {
    function spawn(kind: FxKind, at: THREE.Vector3) {
      const spec = SPECS[kind];
      for (let k = 0; k < spec.n; k++) {
        let i = -1;
        for (let tries = 0; tries < MAX; tries++) {
          const c = (state.cursor + tries) % MAX;
          if (state.life[c] <= 0) { i = c; break; }
        }
        if (i < 0) i = state.cursor;
        state.cursor = (i + 1) % MAX;
        const angle = rand(0, Math.PI * 2);
        const lift = spec.flat ? rand(-.05, .25) : rand(-.5, 1);
        const flat = Math.sqrt(Math.max(0, 1 - lift * lift));
        const speed = spec.speed * rand(.45, 1);
        const spread = spec.spread ?? 1;
        state.pos.set([at.x + rand(-.04, .04), at.y + rand(-.02, .06), at.z + rand(-.04, .04)], i * 3);
        state.vel.set([Math.cos(angle) * flat * speed * spread, lift * speed + (spec.up ?? 0) * rand(.5, 1), Math.sin(angle) * flat * speed * spread], i * 3);
        state.life[i] = state.maxLife[i] = rand(...spec.life);
        state.size0[i] = rand(...spec.size);
        state.gravity[i] = spec.gravity; state.drag[i] = spec.drag ?? 1;
        state.shape[i] = pick(spec.shape);
        tmp.setHex(parseInt(pick(spec.colors).slice(1), 16), THREE.LinearSRGBColorSpace);
        state.color.set([tmp.r, tmp.g, tmp.b], i * 3);
      }
      if (kind === "pop" || kind === "confetti") {
        const ring = state.rings[state.nextRing];
        state.nextRing = (state.nextRing + 1) % RINGS;
        ring.t = 0;
        ringMeshes.current[state.rings.indexOf(ring)]?.position.copy(at);
        ring.color.set(kind === "pop" ? "#ffb347" : "#ffe27a");
      }
    }
    return {
      burst(kind, pos, delay = 0) {
        if (prefersReducedMotion()) return;
        const where = Array.isArray(pos) ? new THREE.Vector3(...pos) : pos.clone();
        if (delay > 0) state.pending.push({ at: delay, kind, pos: where }); else spawn(kind, where);
        invalidate();
      },
    };
  }, [state, tmp, invalidate]);

  useEffect(() => bus.on((event: GameEvent) => {
    switch (event.type) {
      case "select": {
        const [x, y, z] = slotPos(event.index);
        api.burst("tink", [x, y + .25, z]);
        break;
      }
      case "magnet": api.burst("tink", event.pos); break;
      case "grab": api.burst("sparkle", event.pos); break;
      case "land": api.burst("dust", [event.pos[0], Math.max(.02, event.pos[1] - .12), event.pos[2]]); break;
      case "win": api.burst("confetti", [TRAY.x, .5, TRAY.z]); api.burst("sparkle", [TRAY.x, .35, TRAY.z], .12); break;
    }
  }), [bus, api, slotPos]);

  useFrame((_, rawDt) => {
    // Tanpa partikel atau gelombang aktif tidak ada yang dihitung atau diunggah ke GPU.
    if (!state.pending.length && !state.active && state.rings.every(ring => ring.t >= 1)) return;
    const dt = Math.min(rawDt, .05);
    state.scale = gl.domElement.height / (2 * Math.tan((((camera as THREE.PerspectiveCamera).fov ?? 34) * Math.PI) / 360));
    material.uniforms.uScale.value = state.scale;
    for (let q = state.pending.length - 1; q >= 0; q--) {
      const item = state.pending[q];
      item.at -= dt;
      if (item.at <= 0) { state.pending.splice(q, 1); api.burst(item.kind, item.pos); }
    }
    let alive = state.pending.length > 0;
    for (let i = 0; i < MAX; i++) {
      if (state.life[i] <= 0) { state.alpha[i] = 0; continue; }
      state.life[i] -= dt;
      alive = true;
      if (state.life[i] <= 0) state.alpha[i] = 0;
      const f = Math.max(0, state.life[i] / state.maxLife[i]);
      const damp = Math.max(0, 1 - state.drag[i] * dt);
      const v = i * 3;
      state.vel[v] *= damp; state.vel[v + 2] *= damp;
      state.vel[v + 1] = state.vel[v + 1] * damp - state.gravity[i] * dt;
      state.pos[v] += state.vel[v] * dt; state.pos[v + 1] += state.vel[v + 1] * dt; state.pos[v + 2] += state.vel[v + 2] * dt;
      if (state.pos[v + 1] < .02 && state.gravity[i] > 0) { state.pos[v + 1] = .02; state.vel[v + 1] *= -.25; }
      state.alpha[i] = Math.min(1, f * 2.4);
      state.size[i] = state.size0[i] * (f < .25 ? .4 + f * 2.4 : 1);
    }
    state.rings.forEach((ring, index) => {
      const mesh = ringMeshes.current[index];
      if (!mesh) return;
      if (ring.t >= 1) { mesh.visible = false; return; }
      ring.t = Math.min(1, ring.t + dt / .55);
      alive = true;
      const e = 1 - Math.pow(1 - ring.t, 3);
      mesh.visible = true;
      mesh.quaternion.copy(camera.quaternion);
      mesh.scale.setScalar(.12 + e * .62);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.copy(ring.color); material.opacity = (1 - ring.t) * .85;
    });
    (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aShape as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    state.active = alive;
    if (alive) invalidate();
  });

  return <FxContext.Provider value={api}>
    {children}
    <points geometry={geometry} material={material} frustumCulled={false} renderOrder={5} raycast={() => null} />
    {Array.from({ length: RINGS }, (_, i) => <mesh key={i} ref={el => { ringMeshes.current[i] = el; }} geometry={ringGeometry}
      visible={false} renderOrder={4} raycast={() => null}>
      <meshBasicMaterial transparent depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
    </mesh>)}
  </FxContext.Provider>;
}
