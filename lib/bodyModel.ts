import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BODY_ANCHORS, type BodyPartId, type BodyPose } from "./bodyGame.ts";

type Point = [number, number, number];
type Outline = [number, number][];
type Section = [number, number, number, number?];
type Stage = 0 | 1 | 2 | 3;
const RAD = Math.PI / 180;
const neutral: BodyPose = { rightArm: 0, leftArm: 0, head: 0, rightKnee: 0, leftKnee: 0, torso: 0 };
const thighLength = .505;
const shinLength = .49;

/** The feet stand on y=0, the sensors face +Z and the robot's right hand is on -X. */
export function createBodyModel() {
  const group = new THREE.Group();
  group.name = "RakitronHumanoid";
  const metal = (color: string, metalness: number, roughness: number) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const materials = {
    armor: new THREE.MeshPhysicalMaterial({ color: "#ecebe3", metalness: .12, roughness: .38, clearcoat: .3, clearcoatRoughness: .36 }),
    edge: metal("#adb4b3", .65, .36), frame: metal("#465052", .72, .35),
    dark: metal("#20292c", .46, .42), rubber: metal("#292d30", .02, .77),
    alloy: metal("#c0c7c7", .86, .29), copper: metal("#cc754b", .65, .34),
    glass: metal("#142b33", .34, .16), lens: metal("#75e1d8", .17, .23),
    led: metal("#ffc387", .14, .30),
  };
  materials.lens.emissive.set("#39b3ac"); materials.lens.emissiveIntensity = .5;
  materials.led.emissive.set("#f39b51"); materials.led.emissiveIntensity = .28;
  for (const [name, material] of Object.entries(materials)) material.name = name;
  type Finish = keyof typeof materials;
  const parts = {} as Record<BodyPartId, THREE.Group>;
  const joints: Record<string, THREE.Group> = {};
  const baked = new Set<THREE.BufferGeometry>();
  function node(parent: THREE.Group, name: string, at: Point = [0,0,0]) {
    const result = new THREE.Group();
    result.name = name;
    result.position.set(...at);
    parent.add(result);
    return result;
  }
  function hinge(parent: THREE.Group, name: string, at: Point = [0,0,0]) {
    return joints[name] = node(parent,name,at);
  }
  function module(id: BodyPartId) {
    return parts[id] = node(group,id,[...BODY_ANCHORS[id]]);
  }
  // Bake each rigid link and assembly stage independently so the workbench can reveal its layers.
  type Batch = { stage: Stage; finish: Finish; shapes: THREE.BufferGeometry[] };
  const buckets = new Map<THREE.Group, Map<string,Batch>>();
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const up = new THREE.Vector3(0,1,0);
  const v = new THREE.Vector3();
  const unit = new THREE.Vector3(1,1,1);
  function add(p: THREE.Group, st: Stage, finish: Finish, g: THREE.BufferGeometry,
    at: Point = [0,0,0], rotation?: Point | THREE.Quaternion) {
    const batches = buckets.get(p) ?? new Map<string,Batch>();
    if (!buckets.has(p)) buckets.set(p,batches);
    const key = st + finish;
    const batch = batches.get(key) ?? { stage: st, finish, shapes: [] };
    if (!batches.has(key)) batches.set(key,batch);
    if (rotation instanceof THREE.Quaternion) q.copy(rotation);
    else if (rotation) q.setFromEuler(e.set(...rotation));
    else q.identity();
    matrix.compose(v.set(...at),q,unit);
    g.applyMatrix4(matrix);
    g.deleteAttribute("uv");
    g.clearGroups();
    if (g.index) { const flat=g.toNonIndexed(); g.dispose(); g=flat; }
    batch.shapes.push(g);
  }
  function cyl(p: THREE.Group, st: Stage, f: Finish, at: Point, r: number, h: number,
    axis: "x"|"y"|"z" = "y", sides = 20, top = r) {
    add(p,st,f,new THREE.CylinderGeometry(top,r,h,sides),at,
      axis === "x" ? [0,0,Math.PI/2] : axis === "z" ? [Math.PI/2,0,0] : undefined);
  }
  function bar(p: THREE.Group, st: Stage, f: Finish, a: Point, b: Point, r: number, r2=r, sides=12) {
    const d=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const len=d.length();
    const rot=new THREE.Quaternion().setFromUnitVectors(up,d.normalize());
    add(p,st,f,new THREE.CylinderGeometry(r2,r,len,sides),[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],rot);
  }
  function box(p: THREE.Group, st: Stage, f: Finish, at: Point, size: Point, rot?: Point) {
    add(p,st,f,new THREE.BoxGeometry(...size),at,rot);
  }
  // Stacked oval cross-sections form the tapered armour and castings, including the heel and toe.
  function shell(p: THREE.Group, st: Stage, f: Finish, at: Point, rings: Section[], power=1, count=16) {
    const pos:number[]=[], idx:number[]=[];
    for (const [y,w,d,cz=0] of rings) {
      for (let i=0;i<count;i++) {
        const a=(i+.5)*2*Math.PI/count, co=Math.cos(a), si=Math.sin(a);
        pos.push(Math.sign(co)*Math.abs(co)**power*w,y,cz+Math.sign(si)*Math.abs(si)**power*d);
      }
    }
    for (let j=1;j<rings.length;j++) for (let i=0;i<count;i++) {
      const n=(i+1)%count,b=(j-1)*count,t=j*count;
      idx.push(b+i,t+i,t+n,b+i,t+n,b+n);
    }
    const last=(rings.length-1)*count;
    for (let i=1;i<count-1;i++) idx.push(0,i,i+1,last,last+i+1,last+i);
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals();
    add(p,st,f,g,at);
  }
  function loom(p: THREE.Group, st: Stage, f: Finish, route: Point[], radius: number) {
    const curve=new THREE.CatmullRomCurve3(route.map(pt=>new THREE.Vector3(...pt)));
    add(p,st,f,new THREE.TubeGeometry(curve,Math.max(6,route.length*2),radius,6,false));
  }
  function fastener(p: THREE.Group, at: Point, r=.012, axis:"x"|"z"="z", sign=1) {
    cyl(p,3,"alloy",at,r,.007,axis,12);
    const point: Point=[...at]; point[axis==="x"?0:2]+=.0045*sign;
    cyl(p,3,"dark",point,r*.44,.003,axis,6);
  }
  function journal(p: THREE.Group, at: Point, r: number, width: number, side: number) {
    cyl(p,1,"frame",at,r,width,"x",24);
    const out=at[0]+side*width/2;
    const face=(x:number, y:number, h:number, f:Finish, seg=24) =>
      cyl(p,1,f,[out+x*side,at[1],at[2]],y,h,"x",seg);
    face(.004,r*.88,.011,"copper"); face(.013,r*.68,.014,"edge");
    face(.022,r*.45,.009,"frame"); face(.027,r*.20,.005,"alloy",8);
  }
  // Three nested loops model the turned return edge and the raised face of a pressed metal panel.
  function formed(p: THREE.Group, st: Stage, finish: Finish, outline: Outline, at: Point, thickness: number, crown: number) {
    const ccw = [...outline];
    const area = ccw.reduce((a,pt,i)=>{ const n=ccw[(i+1)%ccw.length]; return a+pt[0]*n[1]-n[0]*pt[1]; },0);
    if (area<0) ccw.reverse();
    const n=ccw.length, cx=ccw.reduce((sum,pt)=>sum+pt[0],0)/n, cy=ccw.reduce((sum,pt)=>sum+pt[1],0)/n;
    const pos:number[]=[], idx:number[]=[];
    for(const [scale,z] of [[.96,-thickness/2],[1,thickness*.25],[.87,thickness*.52+crown*.72],[.67,thickness*.5+crown]]) {
      for(const [x,y] of ccw) pos.push(cx+(x-cx)*scale, cy+(y-cy)*scale, z);
    }
    for(let j=0;j<3;j++) for(let i=0;i<n;i++) {
      const k=(i+1)%n,b=j*n,t=b+n;
      idx.push(b+i,b+k,t+k,b+i,t+k,t+i);
    }
    for(let i=1;i<n-1;i++) idx.push(0,i+1,i,3*n,3*n+i,3*n+i+1);
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals();
    add(p,st,finish,g,at);
  }
  const reflected=(outline: Outline,s:number): Outline=>outline.map(([x,y])=>[x*s,y]);
  const torsoPart = module("torso");
  const pelvis = hinge(torsoPart, "PelvisMount");
  const waist = hinge(pelvis, "BodyWaist", [0, .20, 0]);

  // Each row locates the inner and outer edges on the actual body surface.
  // The plates turn around the ribs and hips rather than ending at a flat front face.
  type SurfaceRow = [innerX: number, outerX: number, innerY: number, outerY: number, innerZ: number, outerZ: number];
  function bodyPanel(parent: THREE.Group, finish: Finish, side: number, facing: number,
    rows: SurfaceRow[], crown: number, thickness = .012) {
    const rail = (outer: boolean) => new THREE.CatmullRomCurve3(rows.map(row => {
      const i = outer ? 1 : 0;
      return new THREE.Vector3(row[i], row[2 + i], row[4 + i]);
    }), false, "centripetal");
    const inner = rail(false), outer = rail(true);
    const inside = new THREE.Vector3(), outside = new THREE.Vector3();
    const surface = (u: number, t: number, lift = 0): Point => {
      inner.getPoint(t, inside); outer.getPoint(t, outside);
      const camber = crown * Math.pow(Math.max(0, Math.sin(Math.PI * u) * Math.sin(Math.PI * t)), .63);
      return [side * THREE.MathUtils.lerp(inside.x, outside.x, u), THREE.MathUtils.lerp(inside.y, outside.y, u),
        facing * (THREE.MathUtils.lerp(inside.z, outside.z, u) + camber + lift)];
    };
    const across = 8, along = (rows.length - 1) * 3, stride = across + 1;
    const verts: number[] = [], indices: number[] = [];
    for (let wall = 0; wall < 2; wall++) for (let y = 0; y <= along; y++) for (let x = 0; x <= across; x++)
      verts.push(...surface(x / across, y / along, -wall * thickness));
    const offset = (along + 1) * stride;
    const quad = (a: number, b: number, c: number, d: number) => {
      if (side * facing > 0) indices.push(a, b, c, a, c, d);
      else indices.push(a, c, b, a, d, c);
    };
    for (let y = 0; y < along; y++) for (let x = 0; x < across; x++) {
      const a = y * stride + x, b = a + 1, d = a + stride, c = d + 1;
      quad(a, b, c, d); quad(a + offset, d + offset, c + offset, b + offset);
      if (x === 0) quad(a, d, d + offset, a + offset);
      if (x === across - 1) quad(c, b, b + offset, c + offset);
      if (y === 0) quad(b, a, a + offset, b + offset);
      if (y === along - 1) quad(d, c, c + offset, d + offset);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    add(parent, 2, finish, geometry);
    return surface;
  }

  const hipSocket = Math.abs(BODY_ANCHORS["right-leg"][0]);
  const shoulderSocket = Math.abs(BODY_ANCHORS["right-arm"][0]);
  // The iliac yoke carries the two leg axles. Its back rises to form the sacrum.
  shell(pelvis, 0, "frame", [0,0,0], [
    [-.120,.054,.078,.012],[-.091,.106,.108,.004],[-.042,.147,.128,-.003],
    [.042,.152,.148,-.005],[.062,.155,.148,-.005],[.092,.181,.143,-.008],
    [.112,.172,.135,-.009],[.138,.136,.115,-.009],
  ], .86, 28);
  cyl(pelvis, 1, "alloy", [0,.145,0], .108, .126);
  shell(pelvis, 1, "dark", [0,0,0], [[.094,.141,.12],[.128,.139,.116],[.18,.136,.112],[.204,.135,.107]], .75, 24);
  for (let i = 0; i < 3; i++) {
    shell(pelvis, 1, i === 1 ? "frame" : "rubber", [0,.119 + i*.028,0],
      [[0,.141,.123],[.004,.142,.124],[.012,.140,.120]], .78, 24);
  }
  for (const s of [-1, 1]) {
    bar(pelvis, 0, "alloy", [s*.091,.012,-.004],[s*hipSocket,0,0], .043);
    const iliac = bodyPanel(pelvis, "armor", s, 1, [
      [.020,.059,-.106,-.081,.116,.119], [.023,.109,-.066,-.046,.148,.128],
      [.039,.147,-.002,.042,.155,.088], [.055,.184,.057,.089,.150,.060],
      [.075,.184,.084,.109,.141,.050], [.092,.152,.113,.122,.120,.088],
    ], .019, .015);
    loom(pelvis, 3, "copper", [iliac(.47,.81,.0025),iliac(.67,.84,.0025),iliac(.84,.87,.0025)], .0035);
    bodyPanel(pelvis, "edge", s, -1, [
      [.017,.064,-.086,-.081,.107,.093],[.021,.108,-.045,-.034,.142,.121],
      [.022,.151,.027,.050,.158,.089],[.035,.182,.068,.090,.157,.063],
      [.044,.186,.100,.111,.147,.054],[.057,.143,.124,.132,.127,.106],
    ], .021);
  }
  shell(pelvis, 2, "edge", [0,0,.027], [[-.136,.041,.066],[-.112,.072,.089],[-.061,.067,.125],[-.027,.048,.130]], .77, 20);
  formed(pelvis,2,"edge",[[-.018,-.110],[-.048,-.063],[-.066,.020],[-.044,.060],
    [.044,.060],[.066,.020],[.048,-.063],[.018,-.110],[0,-.122]],[0,0,.140],.012,.016);
  shell(waist, 1, "frame", [0,0,0], [[-.018,.139,.119],[.005,.144,.125],[.034,.141,.123]], .8, 24);

  // A rib basket supplies a continuous flank underneath the removable bodywork.
  shell(waist, 0, "dark", [0,0,0], [
    [.006,.132,.097],[.070,.143,.117],[.165,.158,.137],[.254,.188,.151],
    [.336,.220,.153,.001],[.420,.245,.157,.001],[.494,.256,.147,0],
    [.554,.237,.132,-.001],[.605,.190,.115,-.001],[.646,.128,.100,-.005],[.681,.092,.071],
  ], .91, 32);
  for (const s of [-1, 1]) {
    bar(waist, 0, "frame", [s*.185,.511,0],[s*shoulderSocket,.54,0], .051);
    bar(waist, 1, "alloy", [s*.245,.526,0],[s*(shoulderSocket-.012),.54,0], .053);
    for (let j = 0; j < 3; j++) cyl(waist,1,"rubber",[s*(shoulderSocket-.081+j*.020),.537,0],.060-j*.001,.011,"x");
    bar(waist, 1, "alloy", [s*.095,.026,-.073],[s*.158,.269,-.108], .017);
    bar(waist, 1, "frame", [s*.115,.071,-.083],[s*.156,.243,-.102], .025, .021);
    loom(waist, 3, "rubber", [[s*.102,.025,-.098],[s*.131,.116,-.108],[s*.16,.205,-.110],[s*.182,.28,-.093]], .009);

    const pec = bodyPanel(waist, "armor", s, 1, [
      [.023,.114,.289,.303,.157,.161],[.013,.197,.319,.340,.171,.123],
      [.014,.247,.405,.417,.176,.070],[.026,.270,.493,.526,.157,.045],
      [.059,.240,.535,.563,.139,.078],[.146,.204,.565,.572,.120,.094],
    ], .068, .018);
    // The raised collarbone leads into the shoulder bearing above the pectoral shield.
    bodyPanel(waist, "armor", s, 1, [
      [.029,.119,.540,.560,.150,.140],[.048,.226,.568,.574,.142,.099],
      [.071,.285,.593,.551,.124,.016],[.090,.295,.617,.573,.103,-.012],
      [.111,.259,.622,.592,.083,.002],
    ], .016);
    const scapula = bodyPanel(waist, "edge", s, -1, [
      [.043,.093,.338,.313,.178,.169],[.030,.184,.42,.366,.186,.130],
      [.043,.235,.498,.474,.171,.102],[.077,.266,.572,.535,.144,.079],
      [.114,.218,.602,.57,.128,.102],
    ], .034, .016);
    const trapezius = bodyPanel(waist, "armor", s, -1, [
      [.042,.091,.504,.486,.189,.180],[.038,.196,.565,.536,.176,.146],
      [.042,.278,.628,.565,.137,.084],[.057,.244,.682,.590,.104,.091],
      [.067,.122,.696,.659,.084,.095],
    ], .015);
    loom(waist, 3, "alloy", [trapezius(.15,.60,.001),trapezius(.31,.55,.001),trapezius(.60,.43,.001),trapezius(.84,.34,.001)], .0028);
    // Three deep cooling louvers follow the diagonal blade across its full travel.
    for(let i = 0; i < 3; i++) {
      const t=.29+i*.099;
      loom(waist, 3, "frame", [scapula(.26,t,.002),scapula(.49,t+.045,.002),scapula(.72,t+.101,.002)], .0053);
    }
    const lumbar = bodyPanel(waist, "edge", s, -1, [
      [.081,.111,.043,.067,.102,.087],[.082,.145,.093,.122,.119,.076],
      [.099,.169,.190,.233,.136,.069],[.117,.191,.277,.308,.142,.070],
      [.132,.175,.306,.317,.132,.089],
    ], .012, .009);
    loom(waist, 3, "copper", [lumbar(.31,.19,.001),lumbar(.29,.34,.001),lumbar(.28,.43,.001)],.0028);
    // Three staggered costal plates descend toward the obliques, leaving the waist bearing free.
    for (let rib = 0; rib < 3; rib++) {
      const y = .168 + rib*.057, w = .152 + rib*.018;
      bodyPanel(waist, rib === 2 ? "armor" : "edge", s, 1, [
        [w-.025,w-.010,y-.032,y-.024,.120,.104],
        [w-.029,w+.016,y-.013,y+.018,.136,.078],
        [w-.015,w+.039,y+.010,y+.044,.130,.020],
        [w+.003,w+.030,y+.021,y+.050,.110,.019],
      ], .017, .009);
    }
    bodyPanel(waist, "edge", s, 1, [
      [.111,.129,.007,.014,.102,.079],[.100,.149,.051,.065,.123,.067],
      [.117,.164,.101,.119,.129,.068],[.130,.174,.144,.175,.118,.042],
      [.138,.162,.149,.183,.110,.062],
    ], .014);
    // The abdominal shields change both projection and width along the spinal column.
    const abdomen = [
      { base:.020, width:.107, height:.087, rake:.032, depth:.125 },
      { base:.116, width:.122, height:.071, rake:.021, depth:.140 },
      { base:.202, width:.137, height:.066, rake:.032, depth:.151 },
    ];
    abdomen.forEach(({base, width:w, height:h, rake, depth}, row) => {
      const y = base + (s > 0 && row === 1 ? .008 : 0);
      bodyPanel(waist, row === 0 ? "edge" : "armor", s, 1, [
        [.014,w*.45,y-.006,y+.005,depth,depth-.001],
        [.007,w*.83,y+.006,y+.012+rake,depth+.005,depth-.009],
        [.010,w,y+h*.54,y+h*.62+rake,depth+.013,depth-.019],
        [.016,w*.92,y+h*.87,y+h*.90+rake*.8,depth+.012,depth-.014],
        [.022,w*.66,y+h,y+h+rake*.45,depth+.003,depth-.004],
      ], row === 1 ? .020 : .017, .010);
    });
    // A service seam and two recessed fixing heads follow the curvature of each chest panel.
    loom(waist, 3, "edge", [pec(.10,.42,.001),pec(.13,.65,.001),pec(.22,.79,.001),pec(.51,.82,.001)], .0022);
    fastener(waist,pec(.14,.45,.0015),.0065);
    fastener(waist,pec(.86,.69,.0015),.0065);
    for(let i = 0; i < 3; i++) {
      const y=.234+i*.057, x=.179+i*.017;
      loom(waist,1,"frame",[[s*(x-.020),y,.082],[s*x,y+.016,.032],[s*(x+.006),y+.02,-.033],[s*(x-.017),y+.041,-.095]],.009);
    }
    // Only the service side carries a visible charge indicator.
    if (s > 0) {
      const rail = (u: number, t: number, h = 0) => pec(u,t,.004+h);
      loom(waist, 3, "glass", [rail(.31,.60),rail(.47,.615),rail(.64,.635)], .009);
      loom(waist, 3, "lens", [rail(.34,.604,.006),rail(.42,.613,.006),rail(.50,.620,.006)], .0037);
      loom(waist, 3, "edge", [rail(.55,.627,.006),rail(.60,.633,.006)], .003);
    }
    loom(waist, 3, "copper", [pec(.46,.114,.002),pec(.62,.125,.002),pec(.83,.158,.002)], .0035);
  }
  formed(waist,2,"edge",[[0,.510],[.021,.554],[.049,.582],[.061,.605],[.026,.618],
    [0,.623],[-.026,.618],[-.061,.605],[-.049,.582],[-.021,.554]],[0,0,.130],.017,.009);
  formed(waist,2,"alloy",[[-.003,.302],[-.006,.411],[-.011,.507],[-.010,.539],
    [.010,.539],[.011,.507],[.006,.411],[.003,.302],[0,.290]],[0,0,.167],.010,.004);
  // The spinal bridges overlap the rear skin, fairing into a compact cervical unit.
  shell(waist,0,"frame",[0,0,-.046],[[.03,.087,.075],[.15,.101,.099],[.31,.108,.128],
    [.48,.110,.133],[.62,.089,.092],[.694,.070,.059]], .77, 20);
  for (const s of [-1, 1]) {
    loom(waist, 3, "rubber", [[s*.036,.033,-.126],[s*.059,.141,-.145],[s*.058,.314,-.178],
      [s*.041,.435,-.191],[s*.042,.540,-.183],[s*.031,.656,-.137]],.006);
  }
  const spineDepth = [.136,.152,.168,.184,.192,.196,.191,.174,.152,.132];
  for (let i = 0; i < spineDepth.length; i++) {
    const y = .078 + i*.064, z = spineDepth[i];
    const w = .025 + .014*Math.sin(i/(spineDepth.length-1)*Math.PI);
    shell(waist, 1, i === 6 ? "copper" : "alloy", [0,y,-z],
      [[-.011,w*.78,.014],[0,w,.019],[.013,w,.016],[.017,w*.72,.012]], .56, 16);
  }
  shell(waist, 2, "edge", [0,0,.003], [[.541,.139,.090],[.591,.128,.095],
    [.642,.099,.087],[.666,.081,.069]], .88, 24);
  cyl(waist, 1, "alloy", [0,.702,0], .063, .093);
  for (let i = 0; i < 3; i++) cyl(waist, 1, "rubber", [0,.678+i*.020,0], .070, .010);
  for (const s of [-1, 1]) {
    bar(waist, 1, "alloy", [s*.084,.610,.062],[s*.045,.724,.036], .012,.009);
    loom(waist, 3, "dark", [[s*.063,.631,-.059],[s*.053,.668,-.069],[s*.041,.726,-.047]], .010);
  }

  const headPart=module("head");
  const headMount=hinge(headPart,"HeadMount");
  const head=hinge(headMount,"HeadYaw");
  cyl(head,0,"frame",[0,.014,0],.064,.048);
  cyl(head,1,"alloy",[0,.033,0],.069,.021);
  cyl(head,1,"copper",[0,.029,0],.070,.006);
  shell(head,0,"dark",[0,0,0],[
    [.034,.049,.055,.01],[.067,.078,.079,.016],[.111,.099,.100,.006],
    [.170,.109,.109,-.003],[.209,.112,.116,-.008],[.245,.109,.112,-.014],
    [.284,.093,.098,-.019],[.320,.061,.066,-.024],[.341,.023,.028,-.028],
  ],.92,32);

  // A supporting face casting has a broad zygomatic arch and a narrowing jaw.
  // Its satin surface remains visible between the replaceable malar and chin plates.
  shell(head,1,"edge",[0,0,0],[
    [.046,.027,.048,.075],[.058,.048,.070,.057],[.080,.073,.087,.044],
    [.102,.091,.103,.035],[.135,.109,.111,.023],[.166,.119,.117,.014],
    [.189,.116,.113,.012],[.219,.110,.108,.015],[.239,.090,.095,.020],
  ],.90,32);

  // Cast panels follow the depth of the face. A raised centre and a rolled perimeter
  // leave real hollows between the nose, the brow and the two optical inserts.
  function facePanel(stage: Stage, finish: Finish, perimeter: Point[], crest: Point) {
    const rim = [...perimeter];
    const area = rim.reduce((a,[x,y],i) => {
      const next=rim[(i+1)%rim.length];
      return a+x*next[1]-next[0]*y;
    },0);
    if (area < 0) rim.reverse();
    const vertices:number[]=[], indices:number[]=[];
    const n=rim.length;
    for(const [x,y,z] of rim) vertices.push(x,y,z-.006);
    for(const point of rim) vertices.push(...point);
    for(const [x,y,z] of rim) vertices.push(
      x*.76+crest[0]*.24,y*.76+crest[1]*.24,z*.65+crest[2]*.35);
    vertices.push(...crest);
    for(let i=0;i<n;i++) {
      const j=(i+1)%n;
      indices.push(i,j,j+n,i,j+n,i+n,i+n,j+n,j+2*n,i+n,j+2*n,i+2*n);
      indices.push(i+2*n,j+2*n,3*n);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    add(head,stage,finish,geometry);
  }

  function symmetricMask(rows:Point[][]) {
    // A continuous ceramic surface follows the brow, nasal bridge, or mouth.
    // Rows descend the face, with their first point on its centreline.
    const grid=rows.map(row=>[
      ...row.slice(1).reverse().map(([x,y,z])=>[-x,y,z]),...row,
    ]);
    const span=grid[0].length, points=grid.flat();
    const indices:number[]=[];
    for(let i=0;i<grid.length-1;i++) for(let j=0;j<span-1;j++) {
      const a=i*span+j,b=a+span;
      indices.push(a,b,b+1,a,b+1,a+1);
    }
    const rim:number[]=[];
    for(let j=0;j<span;j++) rim.push(j);
    for(let i=1;i<grid.length;i++) rim.push(i*span+span-1);
    for(let j=span-2;j>=0;j--) rim.push((grid.length-1)*span+j);
    for(let i=grid.length-2;i>0;i--) rim.push(i*span);
    const base=points.length;
    for(const i of rim) { const [x,y,z]=points[i]; points.push([x,y,z-.007]); }
    for(let i=0;i<rim.length;i++) {
      const j=(i+1)%rim.length;
      indices.push(rim[i],rim[j],base+j,rim[i],base+j,base+i);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(points.flat(),3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); add(head,2,"armor",geometry);
  }

  // Four individually removable cranial panels taper into the nape. Their parting
  // lines continue over the crown instead of cutting horizontally across the face.
  const skullRows=[
    [0,.123,.137,-.015],[.18,.128,.145,-.017],[.38,.125,.145,-.020],
    [.57,.114,.135,-.024],[.75,.096,.115,-.026],[.90,.067,.081,-.028],
    [.975,.037,.045,-.028],[1,.009,.013,-.028],
  ];
  function cranialPoint(deg:number,row:number[],offset=0):Point {
    const angle=deg*RAD,[t,w,d,z]=row,co=Math.cos(angle);
    const front=Math.max(0,co), lateral=Math.abs(Math.sin(angle));
    const arch=.005*Math.exp(-Math.pow((lateral-.51)/.31,2))*front;
    const bottom=.161+.056*co+.007*co*co+arch;
    const brow=.006*front*Math.pow(1-t,3);
    return [(w+offset)*Math.sin(angle),bottom+(.355-bottom)*t,z+(d+offset)*co+brow];
  }
  function skullPanel(start: number, end: number, lining=false) {
    const positions:number[]=[], indices:number[]=[];
    const steps=Math.ceil((end-start)/6), span=steps+1;
    for(const row of skullRows) for(let i=0;i<=steps;i++) {
      const angle=start+(end-start)*i/steps;
      const point=cranialPoint(angle,row,lining ? -.0025 : 0);
      if (lining) point[1]-=.001;
      positions.push(...point);
    }
    for(let row=1;row<skullRows.length;row++) for(let i=0;i<steps;i++) {
      const a=(row-1)*span+i,b=a+span;
      indices.push(a,a+1,b+1,a,b+1,b);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); add(head,lining?0:2,lining?"dark":"armor",geometry);
  }
  skullPanel(0,360,true);
  skullPanel(-51,51); skullPanel(52,139); skullPanel(140,220); skullPanel(221,308);
  shell(head,2,"armor",[0,0,-.028],[[.351,.024,.025],[.355,.013,.014],[.356,.006,.006]],1,20);
  function skullMark(angle:number,height:number,offset=.0018):Point {
    const i=skullRows.findIndex(row=>row[0]>=height);
    const lower=skullRows[i-1],upper=skullRows[i];
    const f=(height-lower[0])/(upper[0]-lower[0]);
    return cranialPoint(angle,lower.map((v,j)=>v+(upper[j]-v)*f),offset);
  }
  for(const s of [-1,1]) {
    for(let i=0;i<3;i++) {
      // A row of tangential acoustic slots is etched into each temple, just aft of the ear.
      const hi=.23+i*.080;
      loom(head,3,"frame",[skullMark(s*102,hi),skullMark(s*109,hi+.012),
        skullMark(s*116,hi+.033),skullMark(s*124,hi+.072)],.0018);
    }
    loom(head,3,"copper",[skullMark(s*62,.43),skullMark(s*62,.51),skullMark(s*62.6,.59)],.0013);
  }
  for(let i=0;i<3;i++) {
    const h=.16+i*.065;
    loom(head,3,"frame",[skullMark(163+i*2,h+.029),skullMark(171,h+.009),
      skullMark(180,h),skullMark(189,h+.009),skullMark(197-i*2,h+.029)],.0022);
  }
  for(const s of [-1,1]) {
    const mirrored=(pts:Point[]):Point[]=>pts.map(([x,y,z])=>[s*x,y,z]);
    const panel=(stage:Stage,finish:Finish,rim:Point[],peak:Point)=>
      facePanel(stage,finish,mirrored(rim),[s*peak[0],peak[1],peak[2]]);

    // Inclined temporal bearings, quiet acoustic ports, and jaw tendons sit behind
    // the face shield and remain readable in profile when the head turns.
    cyl(head,1,"frame",[s*.112,.177,-.014],.030,.032,"x",24);
    cyl(head,1,"alloy",[s*.127,.177,-.014],.027,.008,"x",24);
    cyl(head,2,"edge",[s*.133,.177,-.014],.021,.005,"x",24);
    cyl(head,3,"frame",[s*.136,.177,-.014],.013,.004,"x",18);
    fastener(head,[s*.139,.177,-.014],.006,"x",s);
    bar(head,1,"alloy",[s*.119,.165,-.021],[s*.085,.088,.035],.008,.005);
    loom(head,3,"rubber",mirrored([[.106,.164,-.045],[.097,.130,-.058],[.069,.088,-.042],[.049,.048,-.026]]),.005);
    panel(2,"edge",[[.113,.172,.054],[.121,.167,.001],[.114,.139,-.018],
      [.096,.108,-.005],[.073,.077,.037],[.050,.055,.091],[.074,.085,.100],[.098,.123,.081]],
      [.101,.129,.068]);

    // An eyelid-shaped graphite recess and a convex cyan lens share the local
    // facial curvature, with the outer corner turning away in profile.
    const orbit=(x:number,y:number,lift:number):Point=>[x,y,.147-.40*(x-.025)+lift];
    const eyelid:Outline=[[.020,.190],[.030,.196],[.047,.1995],[.063,.2005],
      [.082,.1995],[.097,.197],[.102,.193],[.089,.1885],
      [.072,.1835],[.054,.1825],[.038,.184],[.027,.187]];
    const opticalCentre:Outline[number]=[.058,.1915];
    const oval=(scale:number,lift:number)=>eyelid.map(([x,y])=>orbit(
      opticalCentre[0]+(x-opticalCentre[0])*scale,opticalCentre[1]+(y-opticalCentre[1])*scale,lift));
    panel(2,"frame",oval(1.09,-.003),orbit(.058,.192,-.0005));
    panel(3,"glass",oval(.88,.0002),orbit(.058,.192,.0024));
    const pupil=node(head,s===-1?"RightOcularSensor":"LeftOcularSensor",[s*.058,.192,.1372]);
    pupil.rotation.y=s*.37;
    // Each optic has a dark glass field surrounding its illuminated iris, aperture
    // and catchlight. Only a short strip of the outer emitter is visible.
    cyl(pupil,3,"lens",[0,0,0],.0086,.002,"z",24);
    cyl(pupil,3,"glass",[0,0,.0015],.0048,.0015,"z",20);
    cyl(pupil,3,"lens",[-.002,.0027,.0026],.0017,.0012,"z",10);
    bar(head,3,"lens",[s*.075,.1926,.1285],[s*.086,.1938,.1246],.0012,.0008,6);

    // The malar shield narrows from a full cheekbone to a lower jaw that returns
    // deeply around the side, leaving the back of the neck free to rotate.
    panel(2,"armor",[[.021,.178,.146],[.043,.174,.146],[.065,.173,.140],
      [.091,.180,.122],[.107,.192,.100],[.119,.180,.073],[.121,.161,.052],
      [.104,.146,.074],[.083,.136,.105],[.057,.118,.132],[.039,.107,.141],
      [.026,.118,.149],[.034,.139,.151]], [.079,.153,.148]);
    panel(2,"armor",[[.115,.154,.054],[.104,.131,.050],[.077,.097,.078],
      [.042,.060,.115],[.024,.049,.129],[.033,.070,.142],[.052,.098,.136],
      [.068,.116,.123],[.090,.133,.098]], [.073,.102,.122]);
    panel(2,"armor",[[.024,.138,.149],[.042,.124,.141],[.052,.106,.138],
      [.043,.097,.143],[.025,.107,.150],[.015,.120,.153]], [.031,.117,.154]);
    // A small copper alignment index follows the recessed mid-cheek seam.
    bar(head,3,"copper",[s*.108,.144,.073],[s*.094,.132,.093],.0017,.0017,6);
  }
  // The top row sits inside the cranial skin. Its lower edge follows the two
  // arches of the frontal bone, preserving a recessed socket for each eye.
  symmetricMask([
    [[0,.257,.119],[.035,.254,.115],[.061,.247,.107],[.084,.236,.096],[.102,.224,.078],[.115,.209,.050]],
    [[0,.231,.137],[.035,.233,.135],[.061,.231,.128],[.084,.223,.113],[.103,.213,.094],[.116,.202,.069]],
    [[0,.214,.144],[.035,.216,.144],[.061,.218,.135],[.084,.213,.119],[.103,.206,.103],[.118,.198,.077]],
    [[0,.201,.144],[.035,.200,.141],[.061,.204,.135],[.084,.203,.122],[.103,.197,.105],[.117,.189,.080]],
  ]);
  symmetricMask([
    [[0,.210,.145],[.008,.210,.144],[.013,.205,.140]],
    [[0,.192,.151],[.009,.193,.148],[.014,.189,.140]],
    [[0,.172,.158],[.010,.173,.155],[.015,.170,.146]],
    [[0,.155,.172],[.012,.156,.166],[.019,.150,.153]],
    [[0,.147,.174],[.014,.146,.167],[.024,.144,.158]],
    [[0,.140,.166],[.012,.141,.162],[.024,.141,.156]],
    [[0,.137,.158],[.013,.139,.155],[.023,.140,.153]],
  ]);
  symmetricMask([
    [[0,.141,.154],[.012,.140,.152],[.025,.137,.15],[.040,.125,.141]],
    [[0,.120,.154],[.014,.119,.156],[.028,.116,.151],[.045,.109,.143]],
    [[0,.111,.159],[.015,.113,.160],[.029,.110,.155],[.044,.105,.145]],
    [[0,.107,.159],[.015,.108,.159],[.030,.106,.153],[.041,.105,.148]],
  ]);
  facePanel(3,"frame",[[-.040,.105,.147],[-.020,.108,.157],[0,.107,.160],
    [.020,.108,.157],[.040,.105,.147],[.031,.104,.150],[0,.104,.158],
    [-.031,.104,.150]], [0,.1055,.160]);
  symmetricMask([
    [[0,.104,.159],[.015,.105,.158],[.030,.104,.151],[.041,.105,.147]],
    [[0,.099,.160],[.016,.099,.159],[.034,.101,.149],[.047,.103,.140]],
    [[0,.088,.153],[.025,.089,.151],[.040,.087,.142],[.049,.091,.134]],
    [[0,.075,.156],[.023,.074,.153],[.039,.073,.141],[.045,.078,.132]],
    [[0,.058,.144],[.018,.058,.142],[.031,.062,.136],[.041,.068,.126]],
    [[0,.051,.134],[.015,.052,.132],[.027,.056,.128],[.035,.062,.119]],
  ]);
  for(const s of [-1,1]) {
    for(let i=0;i<3;i++) {
      const y=.117+i*.010;
      bar(head,3,"edge",[s*.044,y,-.095-i*.003],[s*.066,y+.002,-.082-i*.004],.0028,.0028,6);
    }
  }
  const optics = node(head,"OpticalAxis",[0,.192,.140]);
  function buildLeg(s: number, id: "right-leg"|"left-leg", side: string) {
    const mount = hinge(module(id),side+"LegMount");
    const hip = hinge(mount,side+"Hip");
    cyl(hip,0,"alloy",[-s*.071,0,0],.047,.12,"x");
    journal(hip,[0,0,0],.070,.120,s);
    for (const flank of [-1,1]) {
      bar(hip,0,"frame",[flank*.044,-.041,-.012],[flank*.036,-.482,-.019],.030,.025);
      bar(hip,1,"alloy",[flank*.053,-.126,.010],[flank*.038,-.468,.017],.014);
    }
    bar(hip,1,"frame",[0,-.058,-.046],[0,-.302,-.059],.040,.033);
    bar(hip,1,"alloy",[0,-.236,-.058],[0,-.450,-.032],.018);
    const quadric: LinkRing[] = [
      [-.447,.054,.057,-.008,-.003,-17],[-.416,.066,.071,-.009,.001,-14],
      [-.353,.079,.090,-.008,.006,-8],[-.283,.093,.110,-.003,.008,-2],
      [-.199,.107,.121,.005,.006,4],[-.129,.110,.120,.010,.000,11],
      [-.072,.102,.108,.010,-.011,15],[-.033,.087,.086,.007,-.015,24],
      [-.016,.074,.067,.004,-.017,28],
    ];
    cladLink(hip,s,quadric,292,48);
    // The upper thigh cups the ball laterally, leaving the medial arc open for hip flexion.
    const trochanter: LinkRing[] = [
      [-.099,.094,.100,.011,-.002,0],[-.071,.099,.106,.012,-.001,0],
      [-.036,.093,.101,.012,-.001,0],[.001,.082,.089,.014,-.001,0],
      [.037,.062,.067,.015,-.003,0],[.060,.036,.042,.013,-.004,0],
    ];
    wrapPanel(hip,2,"frame",s,trochanter,-60,179,-.008);
    wrapPanel(hip,2,"edge",s,trochanter,-55,-24,-.002);
    wrapPanel(hip,2,"armor",s,trochanter,-21,132,.001);
    wrapPanel(hip,2,"edge",s,trochanter,136,178);
    fastener(hip,linkPoint(s,trochanter[3],88,.002),.009,"x",s);
    stampLink(hip,s,quadric[5],quadric[6],33,48);
    // The inner teardrop runs lower than the outer quadriceps housing.
    const medialis: LinkRing[] = [
      [-.463,.042,.043,-.016,.031,-11],[-.431,.062,.058,-.018,.029,-6],
      [-.387,.070,.072,-.017,.025,0],[-.323,.077,.084,-.014,.012,12],
    ];
    wrapPanel(hip,2,"armor",s,medialis,-108,-35);
    wrapPanel(hip,3,"copper",s,quadric.slice(3,7),65,68,.001);
    loom(hip,3,"rubber",[[s*.054,-.046,-.045],[s*.058,-.165,-.093],[s*.053,-.292,-.088],[s*.030,-.464,-.048]],.008);
    fastener(hip,linkPoint(s,quadric[6],92),.008,"x",s);
    fastener(hip,linkPoint(s,quadric[2],97),.007,"x",s);
    const knee = hinge(hip,side+"Knee",[0,-thighLength,0]);
    journal(knee,[0,0,-.006],.062,.127,s);
    bar(knee,0,"frame",[-.038,-.025,.005],[-.025,-.447,-.012],.024,.018);
    bar(knee,0,"frame",[.038,-.025,.005],[.025,-.447,-.012],.024,.018);
    bar(knee,1,"frame",[0,-.051,-.038],[0,-.235,-.068],.038,.033);
    bar(knee,1,"alloy",[0,-.180,-.061],[0,-.430,-.035],.017,.013);
    const kneecap: Outline = [[-.060,.037],[-.029,.071],[.024,.074],[.057,.051],[.067,.011],[.045,-.038],[.007,-.073],[-.032,-.062],[-.058,-.020]];
    formed(knee,2,"armor",reflected(kneecap,s),[0,0,.055],.028,.025);
    fastener(knee,[s*.034,.034,.094],.0065);
    const calf: LinkRing[] = [
      [-.439,.034,.041,-.001,-.012,3],[-.407,.041,.045,-.003,-.015,4],
      [-.337,.050,.061,-.006,-.017,-2],[-.259,.064,.081,-.005,-.024,-8],
      [-.189,.081,.100,-.004,-.028,-12],[-.133,.089,.102,.001,-.029,-10],
      [-.086,.079,.083,.005,-.019,-3],[-.062,.057,.061,.002,-.011,6],
    ];
    cladLink(knee,s,calf,302,42);
    const tibia: LinkRing[] = [
      [-.420,.024,.049,0,-.003,4],[-.35,.037,.059,.001,.000,3],
      [-.246,.047,.069,.003,.002,3],[-.152,.056,.078,.005,.003,3],[-.107,.057,.073,.004,.002,4],
    ];
    wrapPanel(knee,2,"armor",s,tibia,-49,35);
    stampLink(knee,s,calf[5],calf[6],21,40);
    wrapPanel(knee,3,"copper",s,calf.slice(4,7),65,69,.001);
    loom(knee,3,"rubber",[[s*.038,-.063,-.042],[s*.051,-.162,-.101],[s*.032,-.294,-.083],[s*.022,-.435,-.045]],.009);
    const ankle = hinge(knee,side+"Ankle",[0,-shinLength,0]);
    journal(ankle,[0,-.003,-.010],.044,.092,s);
    cyl(ankle,0,"alloy",[0,-.057,-.012],.040,.077);
    bar(ankle,1,"frame",[0,-.020,-.051],[0,-.124,-.089],.023,.029);
    const gaiter: LinkRing[] = [
      [-.095,.044,.074,.000,.024],[-.075,.051,.065,.000,.015],[-.046,.055,.060,.000,.007],
      [-.012,.054,.056,.000,.003],[.022,.048,.054,.000,-.002],[.047,.044,.048,-.002,-.006],
      [.064,.037,.043,-.002,-.007],
    ];
    wrapPanel(ankle,0,"rubber",s,gaiter,-180,180,-.007);
    wrapPanel(ankle,2,"edge",s,gaiter,-94,-39,-.002);
    wrapPanel(ankle,2,"armor",s,gaiter,-34,52);
    wrapPanel(ankle,2,"edge",s,gaiter,57,138);
    fastener(ankle,linkPoint(s,gaiter[3],90,.002),.008,"x",s);
    // A plan-view outline retains the arch at the medial edge and the broader ball of the foot.
    // The raised toe caps overlap the beveled outsole at the metatarsal joints.
    const footPlan = [[-.055,-.119],[-.077,-.074],[-.076,-.030],[-.065,.025],[-.081,.078],
      [-.100,.146],[-.092,.205],[-.068,.237],[-.026,.247],[.026,.237],[.069,.214],
      [.094,.175],[.105,.126],[.093,.050],[.077,-.034],[.076,-.086],[.050,-.124],[0,-.133]];
    const outsole = new THREE.Shape(footPlan.map(([x,z])=>new THREE.Vector2(s*x,-z)));
    outsole.closePath();
    const sole = new THREE.ExtrudeGeometry(outsole,{depth:.021,bevelEnabled:true,bevelSegments:2,bevelSize:.006,bevelThickness:.005});
    sole.rotateX(-Math.PI/2);
    add(ankle,0,"rubber",sole,[0,-.179,0]);
    shell(ankle,0,"frame",[0,-.185,0],[[.031,.076,.153,.045],[.050,.078,.152,.041],[.075,.065,.103,.009],[.089,.047,.078,-.008]],.72,20);
    shell(ankle,2,"edge",[0,-.185,-.048],[[.031,.063,.074],[.048,.072,.077],[.084,.067,.071],[.114,.055,.053],[.128,.044,.036]],.78,20);
    shell(ankle,2,"armor",[-s*.006,-.185,.050],[[.035,.082,.119],[.051,.087,.123],[.074,.078,.104,-.008],[.112,.058,.070,-.028],[.146,.036,.045,-.047]],.76,24);
    const toeRows: [number,number,number,number][] = [
      [-.055,.036,.044,.198],[-.005,.044,.044,.191],[.051,.033,.041,.174],
    ];
    for (const [x,w,d,z] of toeRows) {
      shell(ankle,2,"armor",[s*x,-.185,z],[[.032,w*.92,d,.001],[.041,w,d],[.057,w*.90,d*.91],[.068,w*.68,d*.65,-.006]],.70,16);
    }
    for (let i=0; i<3; i++) {
      const z=.044+i*.024;
      bar(ankle,3,"edge",[-s*(.045+i*.002),-.075-i*.009,z],[s*(.046+i*.002),-.079-i*.009,z-.005],.003);
    }
    box(ankle,3,"copper",[0,-.121,-.116],[.047,.012,.008]);
    fastener(ankle,[s*.071,-.122,-.057],.009,"x",s);
    node(ankle,side+"Sole",[0,-.185,.020]);
  }
  buildLeg(-1,"right-leg","Right"); buildLeg(1,"left-leg","Left");

  function buildArm(s: number, id: "right-arm"|"left-arm", side: string) {
    const mount = hinge(module(id),side+"ShoulderMount");
    const shoulder = hinge(mount,side+"Shoulder");
    cyl(shoulder,0,"alloy",[-s*.030,0,0],.051,.112,"x");
    journal(shoulder,[0,-.003,0],.068,.102,s);
    bar(shoulder,0,"frame",[0,-.036,0],[0,-.371,-.010],.041,.031);
    bar(shoulder,1,"frame",[0,-.098,.024],[-s*.009,-.227,.042],.029,.034);
    bar(shoulder,1,"alloy",[-s*.009,-.215,.039],[-s*.019,-.351,.014],.017,.012);
    bar(shoulder,1,"alloy",[s*.026,-.088,-.040],[s*.018,-.345,-.028],.013);
    const upperArm: LinkRing[] = [
      [-.363,.041,.042,-.002,-.010,6],[-.340,.046,.051,-.003,-.007,2],
      [-.293,.059,.073,-.007,.006,-7],[-.232,.072,.088,-.008,.012,-9],
      [-.169,.078,.087,-.001,.005,-5],[-.135,.074,.081,.004,-.001,4],
      [-.099,.064,.063,.004,-.001,11],[-.076,.056,.053,.002,.001,13],
    ];
    cladLink(shoulder,s,upperArm,291,54);
    const deltoid: LinkRing[] = [
      [-.175,.052,.059,.023,-.001,12],[-.145,.074,.081,.026,-.001,7],
      [-.098,.088,.099,.023,-.004,2],[-.044,.101,.114,.014,-.003,-3],
      [-.002,.102,.108,.010,-.006,-6],[.038,.087,.089,.007,-.011,-9],
      [.062,.066,.064,-.002,-.014,-11],[.071,.032,.032,-.012,-.014,-10],
    ];
    // The shoulder dome wraps over the motor and blends into the lateral upper arm.
    wrapPanel(shoulder,2,"edge",s,deltoid,-180,180,-.006);
    wrapPanel(shoulder,2,"armor",s,deltoid,-48,115);
    wrapPanel(shoulder,2,"armor",s,deltoid,119,209);
    wrapPanel(shoulder,2,"edge",s,deltoid,213,306);
    wrapPanel(shoulder,3,"copper",s,deltoid.slice(1,5),104,108,.001);
    fastener(shoulder,linkPoint(s,deltoid[3],82,.001),.008,"x",s);
    stampLink(shoulder,s,deltoid[3],deltoid[4],25,46);
    loom(shoulder,3,"rubber",[[s*.028,-.081,-.042],[s*.038,-.175,-.069],[s*.032,-.278,-.062],[s*.019,-.363,-.029]],.007);
    const elbow = hinge(shoulder,side+"Elbow",[0,-.392,0]);
    journal(elbow,[0,0,-.002],.044,.101,s);
    formed(elbow,2,"edge",reflected([[-.042,.017],[-.012,.042],[.024,.037],[.045,.004],[.023,-.037],[-.014,-.045],[-.038,-.021]],s),[0,0,-.028],.017,.009);
    for (const flank of [-1,1]) bar(elbow,0,"frame",[flank*.032,-.024,0],[flank*.020,-.313,-.002],.019,.013);
    bar(elbow,1,"alloy",[0,-.026,-.022],[0,-.321,-.020],.013,.010);
    const forearm: LinkRing[] = [
      [-.312,.037,.037,-.001,.001,-15],[-.291,.041,.041,.000,.001,-10],
      [-.239,.048,.053,.005,.000,0],[-.171,.063,.069,.011,-.004,9],
      [-.109,.074,.080,.013,-.005,12],[-.068,.070,.074,.008,-.004,8],
      [-.039,.052,.056,.004,-.003,4],[-.029,.039,.044,.002,-.003,-1],
    ];
    cladLink(elbow,s,forearm,296,44);
    wrapPanel(elbow,3,"copper",s,forearm.slice(3,6),58,62,.0015);
    fastener(elbow,linkPoint(s,forearm[3],82),.0065,"x",s);
    stampLink(elbow,s,forearm[4],forearm[5],16,36);
    cyl(elbow,1,"frame",[0,-.321,0],.034,.041);
    cyl(elbow,1,"alloy",[0,-.325,0],.037,.017);
    cyl(elbow,1,"rubber",[0,-.340,0],.033,.011);
    const wrist = hinge(elbow,side+"Wrist",[0,-.352,0]);
    const palm: LinkRing[] = [
      [-.128,.050,.017,.003,.000,-2],[-.117,.063,.025,.001,.000,-2],
      [-.097,.065,.032,-.002,-.002,0],[-.067,.058,.037,-.007,-.003,0],
      [-.043,.052,.034,-.006,-.005,2],[-.021,.039,.027,-.003,-.002,5],
      [-.004,.030,.025,.000,-.002,3],
    ];
    wrapPanel(wrist,0,"frame",s,palm,-180,180,-.0045);
    shell(wrist,0,"frame",[0,0,-.002],[[-.119,.043,.011],[-.100,.047,.016],[-.062,.039,.017],[-.010,.022,.015]],.85);
    wrapPanel(wrist,2,"edge",s,palm,-79,84,-.002);
    wrapPanel(wrist,2,"armor",s,palm,-77,16);
    wrapPanel(wrist,2,"armor",s,palm,20,78);
    wrapPanel(wrist,3,"copper",s,palm.slice(2,5),56,60,.0013);
    wrapPanel(wrist,2,"edge",s,palm,89,151);
    wrapPanel(wrist,2,"edge",s,palm,210,277);
    // Thenar and hypothenar pads frame the recess in the middle of the palm.
    shell(wrist,3,"rubber",[-s*.028,-.070,-.024],[[-.037,.012,.010],[-.020,.019,.013],[.010,.020,.016],[.033,.012,.012]],.86);
    shell(wrist,3,"rubber",[s*.034,-.082,-.022],[[-.025,.011,.009],[-.013,.015,.012],[.014,.014,.014],[.024,.009,.010]],.86);
    const fingers = [
      {name:"Index",x:-.046,base:-.117,length:.115,spread:-.007,curl:.028},
      {name:"Middle",x:-.016,base:-.125,length:.131,spread:-.002,curl:.039},
      {name:"Ring",x:.016,base:-.124,length:.123,spread:.004,curl:.044},
      {name:"Little",x:.046,base:-.112,length:.099,spread:.009,curl:.048},
    ];
    for (const [fingerIndex,finger] of fingers.entries()) {
      const {name,x,base,length,spread,curl} = finger;
      const width = fingerIndex === 3 ? .0123 : .0140;
      const phalanges: Point[] = [
        [s*x,base,.001],[s*(x+spread*.49),base-length*.45,.001-curl*.13],
        [s*(x+spread*.81),base-length*.78,.001-curl*.46],[s*(x+spread),base-length*.94,.001-curl],
      ];
      // Separate phalangeal caps return around the sides and leave the hinge line exposed.
      for (let j=0; j<3; j++) {
        const a = phalanges[j], b = phalanges[j+1], r = width-j*.0014;
        bar(wrist,0,"frame",a,b,r*.79,r*.65,8);
        cyl(wrist,1,"edge",a,r*.85,r*1.67,"x",12);
        fingerCap(wrist,s,a,b,r);
        if (j===2) bar(wrist,3,"rubber",b,[b[0],b[1]+.009,b[2]+.001],r*.69,r*.76,10);
      }
      const angle = -49 + fingerIndex*31;
      wrapPanel(wrist,3,"edge",s,palm.slice(0,3),angle,angle+3,.0012);
      node(wrist,side+name+"Tip",phalanges[3]);
    }
    const thumbBase: Point = [-s*.039,-.053,-.010];
    const thumbMcp: Point = [-s*.070,-.080,-.019];
    const thumbIp: Point = [-s*.084,-.111,-.035];
    const thumbTip: Point = [-s*.083,-.140,-.051];
    for (const [start,end,r] of [[thumbBase,thumbMcp,.019],[thumbMcp,thumbIp,.015],[thumbIp,thumbTip,.013]] as const) {
      bar(wrist,0,"frame",start,end,r*.74,r*.61,10);
      cyl(wrist,1,"edge",start,r*.82,r*1.67,"x",12);
      fingerCap(wrist,s,start,end,r);
    }
    fastener(wrist,[-s*.009,-.044,.031],.0055);
    node(wrist,side+"ThumbTip",thumbTip);
  }
  buildArm(-1,"right-arm","Right"); buildArm(1,"left-arm","Left");
  // Each ring locates a section of a limb in its anatomical frame. A varying centre and
  // twist give the casting a muscle belly, an offset tendon, and a different front/back profile.
  type LinkRing = [height: number, width: number, depth: number, outward: number, forward: number, twist?: number];
  function linkPoint(side: number, ring: LinkRing, degrees: number, inset = 0): Point {
    const [y, w, d, x, z, twist = 0] = ring;
    const a = (degrees + twist) * RAD;
    return [side * (x + (w + inset) * Math.sin(a)), y, z + (d + inset) * Math.cos(a)];
  }
  function wrapPanel(link: THREE.Group, stage: Stage, finish: Finish, side: number, rings: LinkRing[],
    from: number, to: number, offset = 0, placement?: THREE.Matrix4) {
    const steps = Math.max(3, Math.ceil((to - from) / 14));
    const pos: number[] = [], idx: number[] = [];
    const row = steps + 1, surface = rings.length * row;
    for (const inset of [offset, offset - .005]) {
      for (const ring of rings) {
        for (let i = 0; i <= steps; i++) pos.push(...linkPoint(side, ring, from + (to - from) * i / steps, inset));
      }
    }
    function quad(a: number, b: number, c: number, d: number) {
      if (side === 1) idx.push(a,b,c,a,c,d);
      else idx.push(a,c,b,a,d,c);
    }
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < steps; i++) {
        const a = j * row + i, b = a + 1, c = b + row, d = a + row;
        quad(a,b,c,d); quad(d+surface,c+surface,b+surface,a+surface);
        if (j === 0) quad(b,a,a+surface,b+surface);
        if (j === rings.length-2) quad(d,c,c+surface,d+surface);
      }
      const low = j*row, hi = low+steps;
      quad(low,low+row,low+row+surface,low+surface);
      quad(hi+row,hi,hi+surface,hi+row+surface);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
    geometry.setIndex(idx); geometry.computeVertexNormals();
    if (placement) geometry.applyMatrix4(placement);
    add(link,stage,finish,geometry);
  }
  function stampLink(link: THREE.Group, side: number, low: LinkRing, high: LinkRing, from: number, to: number) {
    const sample = (t: number): LinkRing => [
      low[0]+(high[0]-low[0])*t,low[1]+(high[1]-low[1])*t,low[2]+(high[2]-low[2])*t,
      low[3]+(high[3]-low[3])*t,low[4]+(high[4]-low[4])*t,(low[5]??0)+((high[5]??0)-(low[5]??0))*t,
    ];
    for (const t of [.25,.49,.73]) {
      wrapPanel(link,3,"frame",side,[sample(t),sample(t+.062)],from,to-(t-.25)*10,.0007);
    }
  }
  function fingerCap(parent: THREE.Group, side: number, from: Point, to: Point, radius: number) {
    const base = new THREE.Vector3(...from), axis = base.clone().sub(new THREE.Vector3(...to));
    const length = axis.length();
    axis.normalize();
    const forward = new THREE.Vector3(0,0,1);
    forward.addScaledVector(axis,-forward.dot(axis)).normalize();
    const lateral = new THREE.Vector3().crossVectors(axis,forward);
    const placement = new THREE.Matrix4().makeBasis(lateral,axis,forward).setPosition(base);
    const shell: LinkRing[] = [
      [-length*.90,radius*.70,radius*.66,0,0],[-length*.76,radius*.89,radius*.85,0,0],
      [-length*.30,radius,radius*.96,0,0],[-length*.15,radius*.87,radius*.80,0,0],
    ];
    wrapPanel(parent,2,"armor",side,shell,-112,112,0,placement);
    wrapPanel(parent,3,"rubber",side,shell,127,233,-.0006,placement);
  }
  function cladLink(link: THREE.Group, side: number, rings: LinkRing[], frontEdge: number, outerEdge: number) {
    wrapPanel(link,2,"frame",side,rings,-180,180,-.005);
    wrapPanel(link,2,"armor",side,rings,frontEdge-360,outerEdge);
    wrapPanel(link,2,"edge",side,rings,outerEdge+3,152);
    wrapPanel(link,2,"armor",side,rings,156,249);
    wrapPanel(link,2,"edge",side,rings,253,frontEdge-3);
  }
  for (const [parent,batches] of buckets) {
    for (const {finish,stage,shapes} of batches.values()) {
      const merged=mergeGeometries(shapes,false);
      if (!merged) throw new Error("Geometri modul tidak kompatibel");
      const geometry=mergeVertices(merged,1e-5);
      merged.dispose(); shapes.forEach(shape=>shape.dispose());
      geometry.computeBoundingSphere();
      baked.add(geometry);
      const item=new THREE.Mesh(geometry,materials[finish]);
      item.name=parent.name+"_"+stage+"_"+finish;
      item.userData.assemblyStage=stage;
      item.castShadow=true; item.receiveShadow=true;
      parent.add(item);
    }
  }
  buckets.clear();
  function legBend(angle: number) {
    const knee=angle*RAD;
    const hip=-Math.atan2(shinLength*Math.sin(knee),thighLength+shinLength*Math.cos(knee));
    const lift=thighLength*(1-Math.cos(hip))+shinLength*(1-Math.cos(hip+knee));
    return {hip,knee,lift};
  }
  function setPose(pose: BodyPose) {
    const yaw=-pose.torso*RAD;
    const right=legBend(pose.rightKnee), left=legBend(pose.leftKnee);
    // The unraised foot supports the robot. Bending both knees lowers the pelvis.
    const drop=Math.min(right.lift,left.lift);
    pelvis.position.y=-drop;
    waist.rotation.y=yaw;
    headMount.position.y=-drop;
    headMount.rotation.y=yaw;
    head.rotation.y=-pose.head*RAD;
    for(const [s,label,bend,armValue] of [[-1,"Right",right,pose.rightArm],[1,"Left",left,pose.leftArm]] as const) {
      joints[label+"LegMount"].position.y=-drop;
      joints[label+"Hip"].rotation.x=bend.hip;
      joints[label+"Knee"].rotation.x=bend.knee;
      joints[label+"Ankle"].rotation.x=-bend.hip-bend.knee;
      const mount=joints[label+"ShoulderMount"];
      const anchor=BODY_ANCHORS[s===-1?"right-arm":"left-arm"];
      mount.position.set(anchor[0]*(Math.cos(yaw)-1),-drop,-anchor[0]*Math.sin(yaw));
      mount.rotation.y=yaw;
      const a=armValue*RAD;
      // The upper arm externally rotates as it rises; the forearm always flexes about its hinge pin.
      joints[label+"Shoulder"].rotation.set(-.035-.12*a,s*.87*a,s*(.085+.89*a),"ZXY");
      joints[label+"Elbow"].rotation.x=-.13-.83*a;
      // The centered wrist turns from palm-in at rest to palm-forward for the greeting.
      const greeting = THREE.MathUtils.smoothstep(armValue, 20, 65);
      joints[label+"Wrist"].rotation.y = s * (.96 + .43 * greeting);
    }
  }
  setPose(neutral);
  return {group,parts,joints,optics,setPose,dispose() {
    for(const geometry of baked) geometry.dispose();
    Object.values(materials).forEach(material=>material.dispose());
  }};
}
