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
    armor: metal("#ece8d9", .26, .38), edge: metal("#bbbcb0", .41, .42),
    frame: metal("#354039", .63, .34), dark: metal("#18231f", .30, .46),
    rubber: metal("#302f2a", .02, .79), alloy: metal("#b1b6aa", .78, .32),
    copper: metal("#df743e", .53, .35), glass: metal("#203a3a", .45, .18),
    lens: metal("#69bab4", .20, .24), led: metal("#ffc089", .12, .32),
  };
  materials.lens.emissive.set("#2c7575"); materials.lens.emissiveIntensity = .28;
  materials.led.emissive.set("#f39b51"); materials.led.emissiveIntensity = .28;
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
  function plate(p: THREE.Group, st: Stage, f: Finish, at: Point, outline: Outline,
    depth: number, bevel=.004, rot?: Point) {
    const path=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)));
    path.closePath();
    const g=new THREE.ExtrudeGeometry(path,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:2});
    g.translate(0,0,-depth/2);
    add(p,st,f,g,at,rot);
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
  const torsoPart=module("torso");
  const pelvis=hinge(torsoPart,"PelvisMount");
  shell(pelvis,0,"frame",[0,0,0],[[-.108,.145,.083],[-.055,.225,.125],[.045,.225,.14],[.115,.165,.115]],.65);
  cyl(pelvis,0,"alloy",[0,.16,0],.103,.12);
  for (let i=0;i<4;i++) cyl(pelvis,1,i===2?"edge":"rubber",[0,.118+i*.027,0],.117-i*.002,.018);
  for(const side of [-1,1]) {
    bar(pelvis,0,"alloy",[side*.115,.007,0],[side*.271,0,0],.050);
    plate(pelvis,2,"armor",[0,0,.135],reflected([[.018,.07],[.112,.09],[.204,.052],[.182,-.018],[.077,-.066],[.029,-.047]],side),.023,.006);
    fastener(pelvis,[side*.143,.041,.155],.013);
    box(pelvis,3,"copper",[side*.196,.005,.092],[.022,.023,.028]);
  }
  plate(pelvis,2,"edge",[0,-.04,.107],[[-.050,.032],[.050,.032],[.037,-.043],[0,-.064],[-.037,-.043]],.026);
  const waist=hinge(pelvis,"BodyWaist",[0,.20,0]);
  cyl(waist,1,"frame",[0,.007,0],.15,.048);
  cyl(waist,1,"copper",[0,.005,0],.153,.012);
  shell(waist,0,"frame",[0,0,0],[[.025,.125,.082],[.13,.16,.105],[.29,.225,.134],[.47,.308,.137],[.59,.246,.112],[.654,.113,.078]],.75);
  for(const side of [-1,1]) {
    bar(waist,1,"frame",[side*.097,.045,-.065],[side*.185,.355,-.087],.036);
    bar(waist,1,"alloy",[side*.082,.03,.038],[side*.194,.335,.066],.019);
    bar(waist,1,"edge",[side*.124,.148,.049],[side*.187,.307,.063],.030);
    loom(waist,3,"rubber",[[side*.106,.048,-.113],[side*.124,.14,-.133],[side*.192,.23,-.137],[side*.236,.34,-.13]],.014);
    shell(waist,0,"dark",[side*.284,.53,0],[[-.075,.044,.083],[-.031,.065,.095],[.038,.066,.094],[.071,.043,.064]],.7);
    bar(waist,0,"frame",[side*.218,.54,0],[side*.463,.54,0],.060);
    bar(waist,1,"alloy",[side*.330,.54,0],[side*.445,.54,0],.073);
    for(let i=0;i<3;i++)
      cyl(waist,1,"rubber",[side*(.347+i*.024),.54,0],.080,.014,"x");
  }
  // Overlapping floating ribs protect the moving lumbar section.
  for(let i=0;i<3;i++) {
    const y=.104+i*.055,w=.139+i*.022;
    plate(waist,2,i===1?"edge":"armor",[0,y,.113+i*.010],
      [[-w,.014],[-w*.73,.027],[w*.73,.027],[w,.014],[w*.85,-.008],[0,-.025],[-w*.85,-.008]],.019);
  }
  shell(waist,2,"edge",[0,0,-.015],[[.268,.184,.137],[.329,.265,.159],[.475,.326,.15],[.538,.303,.126],[.585,.201,.102]],.66,20);
  for(const s of [-1,1]) {
    // An angled pectoral with two return flanges over the central sternum.
    formed(waist,2,"armor",reflected([[.023,.501],[.105,.554],[.227,.562],[.321,.513],[.327,.453],[.267,.383],[.141,.352],[.057,.365],[.021,.399]],s),[0,0,.145],.040,.030);
    plate(waist,2,"armor",[0,0,.077],reflected([[.105,.559],[.162,.608],[.291,.604],[.372,.562],[.359,.531],[.277,.539],[.212,.563]],s),.075,.006);
    plate(waist,3,"copper",[0,0,.196],reflected([[.150,.394],[.270,.431],[.245,.398],[.167,.377]],s),.003,.0006);
    fastener(waist,[s*.293,.478,.189],.010);
    fastener(waist,[s*.068,.416,.187],.008);
    // These seams are pressed into the top of each breastplate.
    for(let j=0;j<3;j++) box(waist,3,"dark",[s*(.229+j*.015),.501,.195],[.005,.026,.003],[0,0,-s*.43]);
    plate(waist,2,"edge",[0,0,.114],reflected([[.157,.339],[.239,.363],[.254,.346],[.226,.281],[.154,.245],[.133,.259]],s),.030,.005);
    for(let i=0;i<3;i++) box(waist,3,"dark",[s*(.207-i*.010),.330-i*.016,.134],[.038,.005,.003],[0,0,s*.35]);
    plate(waist,2,"frame",[0,0,-.154],reflected([[.080,.521],[.198,.560],[.253,.515],[.232,.341],[.091,.298]],s),.03);
    for(let i=0;i<5;i++)
      box(waist,3,"edge",[s*.158,.362+i*.029,-.175],[.090,.010,.013],[0,0,s*.14]);
  }
  // A small maintenance plate on the upper left chest carries three recessed status marks.
  box(waist,3,"edge",[.152,.479,.1955],[.072,.027,.003]);
  for(let j=0;j<3;j++) box(waist,3,j===0?"copper":"frame",[.132+j*.016,.480,.198],[.010,.010,.004]);
  shell(waist,2,"edge",[0,0,-.016],[[.555,.158,.092],[.586,.140,.093],[.614,.111,.086],[.623,.091,.074]],.66);
  for(const s of [-1,1]) formed(waist,2,"armor",reflected([[.036,.587],[.098,.601],[.212,.572],[.247,.542],[.184,.541],[.073,.565]],s),[0,0,.082],.025,.008);
  plate(waist,2,"dark",[0,.445,.159],[[-.034,.084],[0,.100],[.034,.084],[.032,-.048],[0,-.075],[-.032,-.048]],.020);
  for(let i=0;i<3;i++) box(waist,3,i===0?"led":"alloy",[0,.463-i*.026,.174],[.030,.008,.006]);
  shell(waist,0,"frame",[0,.647,0],[[-.054,.10,.079],[-.015,.113,.092],[.022,.089,.071]],.72);
  cyl(waist,1,"alloy",[0,.702,0],.072,.094);
  for(let i=0;i<3;i++) cyl(waist,1,"rubber",[0,.673+i*.023,0],.081,.013);
  box(waist,3,"edge",[0,.424,-.153],[.053,.295,.026]);
  for(let i=0;i<5;i++) box(waist,3,"rubber",[0,.317+i*.049,-.173],[.077,.019,.012]);

  const headPart=module("head");
  const headMount=hinge(headPart,"HeadMount");
  const head=hinge(headMount,"HeadYaw");
  cyl(head,0,"frame",[0,.012,0],.075,.041);
  cyl(head,1,"copper",[0,.032,0],.081,.015);
  shell(head,0,"frame",[0,0,0],[[.032,.063,.071,.002],[.067,.098,.091,.018],[.139,.132,.126,.016],[.230,.139,.116,-.012],[.286,.119,.105,-.022],[.315,.084,.082,-.022]],.77,24);
  shell(head,2,"armor",[0,0,0],[[.211,.145,.142,-.008],[.242,.159,.153,-.009],[.279,.150,.144,-.014],[.323,.115,.116,-.022],[.345,.067,.076,-.015]],.72,24);
  shell(head,2,"glass",[0,0,.015],[[.152,.126,.125],[.163,.143,.141],[.208,.153,.143],[.225,.145,.133]],.57,24);
  // The camera face is slightly flattened, with recessed optics and an overhanging brow.
  plate(head,2,"glass",[0,.189,.151],[[-.125,.022],[-.092,.035],[.100,.034],[.128,.020],[.115,-.018],[.074,-.028],[-.103,-.029]],.009,.003);
  plate(head,2,"edge",[0,.229,.143],[[-.138,-.002],[-.113,.013],[-.037,.019],[.091,.016],[.134,.002],[.116,-.006],[.015,.003],[-.10,.001]],.012,.003);
  for(const [x,r] of [[-.064,.027],[.048,.018],[.095,.010]] as const) {
    cyl(head,3,"frame",[x,.188,.158],r+.005,.014,"z",20);
    cyl(head,3,"alloy",[x,.188,.168],r,.009,"z",20);
    cyl(head,3,"dark",[x,.188,.175],r*.77,.006,"z",20);
    cyl(head,3,"lens",[x,.190,.179],r*.55,.006,"z",16);
    cyl(head,3,"glass",[x,.188,.183],r*.32,.004,"z",12);
    cyl(head,3,"lens",[x-.005,.195,.186],r*.12,.002,"z",8);
  }
  // The shallow spine continues over the rear of the helmet. A side port accepts a service plug.
  plate(head,3,"edge",[0,.272,.128],[[-.042,-.011],[-.018,.011],[.029,.011],[.045,-.011]],.007,.002);
  for(const s of [-1,1]) {
    plate(head,3,"dark",[0,.254,.132],reflected([[.066,.003],[.098,-.010],[.094,-.017],[.063,-.004]],s),.004,.001);
  }
  box(head,3,"led",[.118,.201,.161],[.011,.005,.003]);
  for(const s of [-1,1]) {
    plate(head,2,"armor",[0,0,.111],reflected([[.013,.135],[.057,.153],[.122,.147],[.118,.114],[.083,.073],[.042,.061],[.015,.078]],s),.025,.006);
    journal(head,[s*.133,.178,-.035],.047,.041,s);
    fastener(head,[s*.088,.118,.132],.008);
  }
  plate(head,2,"edge",[0,.089,.122],[[-.046,.001],[-.031,.030],[.028,.030],[.049,.001],[.031,-.024],[-.025,-.023]],.012);
  for(let i=0;i<3;i++) box(head,3,"dark",[0,.095-i*.009,.134],[.047-i*.005,.0035,.004]);
  for(let i=0;i<3;i++) box(head,3,"dark",[0,.172+i*.022,-.137],[.094,.007,.010]);
  node(head,"OpticalAxis",[0,.19,.185]);
  function buildLeg(s: number, id: "right-leg"|"left-leg", side: string) {
    const part=module(id);
    const mount=hinge(part,side+"LegMount");
    const hip=hinge(mount,side+"Hip");
    // A stub axle seats in the pelvis. The two rails carry the load to the knee.
    cyl(hip,0,"alloy",[-s*.087,0,0],.047,.10,"x");
    journal(hip,[0,-.010,0],.098,.139,s);
    shell(hip,2,"edge",[0,-.010,0],[[-.078,.058,.078],[-.059,.076,.102],[.027,.082,.106],[.063,.068,.095],[.076,.049,.072]],.78);
    formed(hip,2,"armor",reflected([[-.078,.042],[.032,.061],[.066,.033],[.062,-.032],[.030,-.069],[-.021,-.061],[-.058,-.028]],s),[0,-.012,.089],.021,.012);
    fastener(hip,[s*.036,-.021,.114],.008);
    cyl(hip,2,"frame",[s*.079,-.015,0],.066,.016,"x",20);
    cyl(hip,3,"copper",[s*.089,-.015,0],.051,.006,"x",20);
    cyl(hip,3,"edge",[s*.095,-.015,0],.042,.009,"x",20);
    fastener(hip,[s*.102,-.015,0],.014,"x",s);
    for(const flank of [-1,1]) {
      bar(hip,0,"frame",[flank*.053,-.045,-.037],[flank*.043,-.462,-.022],.037,.028);
      bar(hip,1,"alloy",[flank*.053,-.134,.006],[flank*.042,-.449,.013],.016,.015);
    }
    bar(hip,1,"dark",[0,-.092,-.058],[0,-.354,-.069],.045,.034);
    bar(hip,1,"alloy",[0,-.277,-.067],[0,-.458,-.035],.019);
    shell(hip,2,"edge",[0,0,0],[[-.425,.064,.061],[-.388,.081,.085],[-.193,.108,.114],[-.099,.094,.094],[-.072,.073,.070]],.83,16);
    const thigh: Outline=[[-.084,-.125],[-.047,-.095],[.051,-.105],[.091,-.153],[.074,-.300],[.043,-.393],[.004,-.411],[-.050,-.380],[-.077,-.274]];
    formed(hip,2,"armor",reflected(thigh,s),[0,0,.097],.026,.016);
    plate(hip,3,"copper",[0,0,.128],reflected([[.059,-.175],[.069,-.185],[.052,-.262],[.044,-.266]],s),.004,.0008);
    fastener(hip,[-s*.045,-.153,.126],.011);
    fastener(hip,[s*.032,-.346,.122],.010);
    loom(hip,3,"rubber",[[s*.056,-.089,-.068],[s*.091,-.189,-.070],[s*.074,-.339,-.069],[s*.049,-.425,-.044]],.012);
    plate(hip,2,"frame",[0,-.247,-.111],[[-.050,.073],[.037,.069],[.059,.042],[.040,-.064],[0,-.093],[-.041,-.069]],.014,.006);
    for(let i=0;i<4;i++) box(hip,3,"edge",[0,-.203-i*.023,-.123],[.056-i*.004,.005,.004]);
    const knee=hinge(hip,side+"Knee",[0,-thighLength,0]);
    journal(knee,[0,0,0],.085,.159,s);
    for(const flank of [-1,1]) {
      bar(knee,0,"frame",[flank*.061,-.030,0],[flank*.039,-.444,-.018],.031,.022);
      bar(knee,1,"alloy",[flank*.060,-.040,-.040],[flank*.045,-.432,-.047],.014);
    }
    bar(knee,1,"edge",[0,-.084,-.042],[0,-.277,-.071],.044,.036);
    bar(knee,1,"alloy",[0,-.239,-.071],[0,-.427,-.050],.018);
    plate(knee,2,"armor",[0,0,.073],[[-.076,.018],[-.056,.057],[.041,.063],[.078,.027],[.068,-.055],[.016,-.095],[-.047,-.080]],.033,.007);
    shell(knee,2,"edge",[0,0,0],[[-.414,.045,.053,-.010],[-.370,.062,.075,-.013],[-.200,.090,.098,-.017],[-.112,.086,.078,-.009],[-.092,.064,.064]],.8);
    plate(knee,2,"armor",[0,0,.068],reflected([[-.061,-.112],[.012,-.110],[.071,-.146],[.061,-.235],[.031,-.350],[-.017,-.402],[-.044,-.365],[-.067,-.201]],s),.025,.006);
    plate(knee,3,"copper",[0,0,.086],reflected([[-.045,-.149],[.021,-.151],[.045,-.167],[-.045,-.163]],s),.004,.0008);
    fastener(knee,[s*.030,-.210,.089],.009);
    for(let i=0;i<3;i++) box(knee,3,"dark",[0,-.273-i*.025,.091],[.043-i*.005,.006,.006],[0,0,s*.10]);
    loom(knee,3,"rubber",[[s*.062,-.092,-.057],[s*.077,-.202,-.087],[s*.060,-.297,-.076],[s*.038,-.408,-.052]],.010);
    const ankle=hinge(knee,side+"Ankle",[0,-shinLength,0]);
    journal(ankle,[0,-.009,-.013],.058,.115,s);
    cyl(ankle,0,"alloy",[0,-.064,-.011],.056,.082);
    shell(ankle,0,"rubber",[0,-.185,0],[[.001,.083,.165,.035],[.012,.106,.190,.037],[.033,.109,.194,.039],[.046,.10,.181,.035]],.46,24);
    shell(ankle,2,"armor",[0,-.185,0],[[.039,.099,.177,.035],[.064,.103,.181,.036],[.092,.087,.145,.017],[.132,.073,.091,-.010]],.58,20);
    shell(ankle,1,"frame",[0,-.185,.046],[[.081,.078,.064],[.119,.069,.053,-.009],[.135,.057,.043,-.026]],.67);
    for(let i=0;i<3;i++) box(ankle,3,"dark",[0,-.099-i*.007,.102+i*.023],[.116-i*.006,.007,.007]);
    for(const flank of [-1,1]) {
      fastener(ankle,[flank*.098,-.118,.057],.009,"x",flank);
      for(let j=0;j<4;j++) box(ankle,3,"frame",[flank*.102,-.160,-.068+j*.063],[.009,.017,.030]);
    }
    box(ankle,3,"dark",[0,-.123,.191],[.089,.006,.006]);
    box(ankle,3,"copper",[0,-.105,-.125],[.089,.022,.009]);
    node(ankle,side+"Sole",[0,-.185,.020]);
  }
  buildLeg(-1,"right-leg","Right"); buildLeg(1,"left-leg","Left");

  function buildArm(s: number,id:"right-arm"|"left-arm",side:string) {
    const part=module(id);
    const mount=hinge(part,side+"ShoulderMount");
    const shoulder=hinge(mount,side+"Shoulder");
    cyl(shoulder,0,"alloy",[-s*.035,0,0],.053,.113,"x");
    journal(shoulder,[0,-.010,0],.083,.119,s);
    shell(shoulder,2,"armor",[0,0,0],[[-.110,.070,.067],[-.073,.095,.088],[-.024,.104,.100],[.034,.091,.086],[.060,.058,.062]],.78,20);
    cyl(shoulder,2,"frame",[s*.091,-.027,0],.047,.014,"x");
    cyl(shoulder,3,"copper",[s*.100,-.027,0],.038,.009,"x");
    cyl(shoulder,3,"alloy",[s*.106,-.027,0],.023,.005,"x");
    bar(shoulder,0,"frame",[0,-.069,-.004],[0,-.341,-.007],.045,.040);
    bar(shoulder,1,"alloy",[s*.036,-.091,-.041],[s*.022,-.314,-.037],.013);
    bar(shoulder,1,"frame",[-s*.019,-.095,.028],[-s*.018,-.214,.036],.032,.027);
    bar(shoulder,1,"alloy",[-s*.018,-.185,.035],[-s*.012,-.302,.027],.015);
    shell(shoulder,2,"edge",[0,0,0],[[-.283,.046,.047],[-.251,.059,.060],[-.142,.072,.075],[-.117,.060,.068]],.82);
    plate(shoulder,2,"armor",[0,0,.070],reflected([[-.049,-.138],[-.014,-.119],[.048,-.141],[.053,-.194],[.028,-.265],[-.018,-.292],[-.042,-.263]],s),.020);
    fastener(shoulder,[s*.019,-.158,.085],.008);
    loom(shoulder,3,"rubber",[[s*.021,-.090,-.059],[s*.054,-.158,-.061],[s*.052,-.234,-.046],[s*.029,-.319,-.032]],.009);
    const elbow=hinge(shoulder,side+"Elbow",[0,-.343,0]);
    journal(elbow,[0,0,0],.059,.121,s);
    formed(elbow,2,"edge",reflected([[-.047,.025],[.027,.038],[.052,.018],[.042,-.026],[.015,-.049],[-.035,-.031]],s),[0,0,.045],.016,.009);
    fastener(elbow,[s*.014,.004,.064],.008);
    for(const flank of [-1,1]) bar(elbow,0,"frame",[flank*.040,.011,0],[flank*.029,-.269,0],.021,.016);
    bar(elbow,1,"alloy",[0,-.048,-.035],[0,-.260,-.027],.013);
    shell(elbow,2,"edge",[0,0,0],[[-.256,.039,.041],[-.230,.055,.061],[-.109,.076,.074],[-.067,.064,.066],[-.055,.050,.049]],.70);
    plate(elbow,2,"armor",[0,0,.054],reflected([[-.050,-.069],[.006,-.061],[.052,-.084],[.051,-.133],[.027,-.225],[-.012,-.250],[-.039,-.226],[-.055,-.126]],s),.023);
    plate(elbow,3,"copper",[0,0,.070],reflected([[-.035,-.099],[.031,-.112],[.026,-.124],[-.034,-.109]],s),.004,.0008);
    fastener(elbow,[s*.012,-.199,.071],.008);
    cyl(elbow,1,"frame",[0,-.270,0],.040,.054);
    cyl(elbow,1,"alloy",[0,-.279,0],.042,.016);
    const wrist=node(elbow,side+"Wrist",[0,-.302,0]);
    shell(wrist,0,"frame",[0,0,0],[[-.119,.047,.034,.002],[-.099,.054,.039],[-.039,.051,.041],[-.011,.032,.030]],.64);
    plate(wrist,2,"armor",[0,-.067,.034],[[-.037,.021],[-.022,.034],[.027,.029],[.043,.006],[.035,-.032],[-.010,-.039],[-.039,-.016]],.012,.003);
    fastener(wrist,[s*.022,-.057,.046],.0055);
    // Four separated articulated fingers plus an opposed, two-link thumb.
    const digitNames=["Index","Middle","Ring","Little"];
    for(let i=0;i<4;i++) {
      const x=s*(-.038+i*.024);
      const len=[.093,.104,.098,.079][i];
      const start:Point=[x,-.114+(i===3?.009:0),.001];
      const mid:Point=[x+s*(i-1)*.002,start[1]-len*.48,-.007];
      const end:Point=[mid[0],mid[1]-len*.33,-.016];
      const tip:Point=[end[0],end[1]-len*.19,-.026];
      for(const [j,a,b] of [[0,start,mid],[1,mid,end],[2,end,tip]] as const) {
        const radius=.012-j*.0014;
        bar(wrist,0,"frame",a,b,radius,radius*.9,8);
        cyl(wrist,1,"edge",a,radius*.87,radius*1.75,"x",10);
        const t=.5;
        box(wrist,2,"armor",[(a[0]+b[0])*t,(a[1]+b[1])*t,(a[2]+b[2])*t+.009],[radius*1.47,Math.max(.011,(a[1]-b[1])*.64),.008],[-.16,0,0]);
      }
      node(wrist,side+digitNames[i]+"Tip",tip);
    }
    const thumb:Point=[-s*.041,-.059,-.004], knuckle:Point=[-s*.067,-.087,-.017], tip:Point=[-s*.073,-.119,-.039];
    bar(wrist,0,"frame",thumb,knuckle,.014,.013,10); bar(wrist,2,"armor",knuckle,tip,.012,.010,10);
    cyl(wrist,1,"edge",knuckle,.012,.019,"x",12);
    node(wrist,side+"ThumbTip",tip);
  }
  buildArm(-1,"right-arm","Right"); buildArm(1,"left-arm","Left");
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
    }
  }
  setPose(neutral);
  return {group,parts,joints,setPose,dispose() {
    for(const geometry of baked) geometry.dispose();
    Object.values(materials).forEach(material=>material.dispose());
  }};
}
