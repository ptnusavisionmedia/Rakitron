export const fingers = [
  { key: "index", name: "Index", x: .122, y: -.326, splay: 6.5, width: .070, cubeLimit: .506, lengths: [.137,.101,.073] },
  { key: "middle", name: "Middle", x: .042, y: -.344, splay: 1.5, width: .074, cubeLimit: .443, lengths: [.146,.109,.081] },
  { key: "ring", name: "Ring", x: -.043, y: -.337, splay: -3, width: .069, cubeLimit: .503, lengths: [.140,.101,.075] },
  { key: "little", name: "Little", x: -.121, y: -.315, splay: -9, width: .060, cubeLimit: .690, lengths: [.111,.080,.062] },
] as const;
export const thumbLengths = [.121,.134,.108] as const;
const DEG = Math.PI / 180;
const normalizedAngle = (value: number) => Number.isFinite(value) ? Math.min(90,Math.max(0,value)) : 0;

export function getFingerHinges(data: (typeof fingers)[number], value: number, holding: boolean) {
  const command = normalizedAngle(value);
  // Approaching the thenar stop slows the last part of the index stroke.
  const stopped = data.key === "index" && command > 70 ? 70+8*(1-Math.exp(-(command-70)/8)) : command;
  const t = (holding ? command : stopped)/90;
  const flex = holding ? Math.min(t,data.cubeLimit) : Math.pow(t,1.4);
  return {
    splay: DEG*data.splay*(1-t*.76),
    mcp: -DEG*flex*(holding ? 6 : 72), pip: -DEG*flex*(holding ? 7 : 92), dip: -DEG*flex*(holding ? 10 : 61),
  };
}

export function getThumbHinges(thumb: number, opposed: number, holding: boolean) {
  const flexion = normalizedAngle(thumb)/90, opposition = normalizedAngle(opposed)/90;
  return {
    yaw: -DEG*(holding ? 81.53 : 10+30*opposition),
    abduction: DEG*(holding ? 63.81 : 36+34*opposition+7.5*flexion),
    pronation: DEG*(holding ? -50.09 : -34-33*opposition),
    mcp: -DEG*(holding ? 14.71 : 6+68.2*flexion),
    ip: -DEG*(holding ? 32.93 : 4+78.7*Math.sin(Math.PI*flexion/2)),
  };
}
