"use client";

import { useMemo } from "react";
import * as THREE from "three";

const MAT_WIDTH = 7.8;
const MAT_DEPTH = 5;
const DESK_WIDTH = 9.2;
const DESK_DEPTH = 6.4;

function roundedShape(width: number, depth: number, radius: number) {
  const shape = new THREE.Shape();
  const x = width / 2;
  const y = depth / 2;
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  return shape;
}

function topSurface(width: number, depth: number, radius: number) {
  const geometry = new THREE.ShapeGeometry(roundedShape(width, depth, radius), 8);
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i += 1) {
    uv.setXY(i, positions.getX(i) / width + 0.5, positions.getY(i) / depth + 0.5);
  }
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function makeTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function matTexture() {
  const width = 1248;
  const height = 800;
  return makeTexture(width, height, (ctx) => {
    ctx.fillStyle = "#a6bc9e";
    ctx.fillRect(0, 0, width, height);
    const pad = 29;
    const step = 40;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, width - pad * 2, height - pad * 2);
    ctx.clip();
    for (let axis = 0; axis < 2; axis += 1) {
      const center = (axis === 0 ? width : height) / 2;
      const count = Math.ceil(center / step);
      for (let i = -count; i <= count; i += 1) {
        const pos = Math.round(center + i * step) + 0.5;
        ctx.strokeStyle = i % 4 === 0 ? "rgba(64,94,67,.37)" : "rgba(64,94,67,.22)";
        ctx.lineWidth = i % 4 === 0 ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(axis === 0 ? pos : pad, axis === 0 ? pad : pos);
        ctx.lineTo(axis === 0 ? pos : width - pad, axis === 0 ? height - pad : pos);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(69,101,77,.30)";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
    for (const x of [104, width - 104]) {
      for (const y of [80, height - 80]) {
        ctx.strokeStyle = "rgba(61,90,64,.45)";
        ctx.beginPath();
        ctx.moveTo(x - 8, y);
        ctx.lineTo(x + 8, y);
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x, y + 8);
        ctx.stroke();
      }
    }
  });
}

function birchTexture() {
  return makeTexture(1024, 512, (ctx) => {
    ctx.fillStyle = "#dec8a2";
    ctx.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 120; i += 1) {
      const y = (i * 79) % 512;
      const start = (i * 283) % 1080 - 110;
      const length = 45 + ((i * 53) % 390);
      ctx.beginPath();
      ctx.moveTo(start, y);
      ctx.bezierCurveTo(start + length * 0.3, y - 2, start + length * 0.72, y + 2, start + length, y);
      ctx.strokeStyle = i % 4 === 0 ? "rgba(110,79,45,.13)" : "rgba(255,246,213,.19)";
      ctx.lineWidth = 0.7 + (i % 3) * 0.2;
      ctx.stroke();
    }
  });
}

export default function WorkshopTable() {
  const surfaces = useMemo(() => ({
    desk: topSurface(DESK_WIDTH, DESK_DEPTH, 0.22),
    mat: topSurface(MAT_WIDTH, MAT_DEPTH, 0.14),
    deskShape: roundedShape(DESK_WIDTH, DESK_DEPTH, 0.22),
    matShape: roundedShape(MAT_WIDTH, MAT_DEPTH, 0.14),
    grain: birchTexture(),
    grid: matTexture(),
  }), []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.27} castShadow receiveShadow>
        <extrudeGeometry args={[surfaces.deskShape, { depth: 0.23, bevelEnabled: false, curveSegments: 8 }]} />
        <meshStandardMaterial color="#d2b994" roughness={0.82} />
      </mesh>
      <mesh geometry={surfaces.desk} position-y={-0.039} receiveShadow>
        <meshStandardMaterial color={surfaces.grain ? "#ffffff" : "#dec8a2"} map={surfaces.grain} roughness={0.83} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.038} castShadow receiveShadow>
        <extrudeGeometry args={[surfaces.matShape, { depth: 0.037, bevelEnabled: false, curveSegments: 8 }]} />
        <meshStandardMaterial color="#94aa8a" roughness={0.94} />
      </mesh>
      <mesh geometry={surfaces.mat} receiveShadow>
        <meshStandardMaterial color={surfaces.grid ? "#ffffff" : "#a6bc9e"} map={surfaces.grid} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.285} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#e8e1ce" roughness={1} />
      </mesh>
    </group>
  );
}

