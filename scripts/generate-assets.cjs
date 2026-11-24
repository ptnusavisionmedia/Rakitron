// Rebuild the robot GLB and all drawer previews from the same parametric CAD geometry.
// Run from the project with Node and the project's Three.js installation.
const fs = require('node:fs');
const path = require('node:path');
const T = require('three');
const root = path.join(__dirname, '..', 'public');
const partsDir = path.join(root, 'parts');
const modelDir = path.join(root, 'models');
fs.mkdirSync(partsDir, {recursive:true});
fs.mkdirSync(modelDir, {recursive:true});
const TAU = Math.PI * 2;
const palette = {
  porcelain:['#eee8d6',.07,.43], shell:['#d8d3c4',.10,.46],
  orange:['#ed7434',.23,.39], rust:['#b95327',.25,.43],
  deep:['#333e3a',.46,.43], frame:['#68746d',.60,.39],
  silver:['#a5b0a9',.73,.31], bright:['#cbd3c9',.70,.30],
  bore:['#1e2825',.23,.50], rubber:['#2c3531',.02,.85], amber:['#ffc069',.12,.47]
};
const materials = Object.fromEntries(Object.entries(palette).map(([key,[color,metalness,roughness]])=>{
  const mat=new T.MeshStandardMaterial({color,metalness,roughness});mat.name=key;return [key,mat];
}));
const group=(name,parent,pos=[0,0,0])=>{
  const g=new T.Group();g.name=name;g.position.fromArray(pos);if(parent)parent.add(g);return g;
};
const names=['Stand','Base','Shoulder','UpperArm','Elbow','Forearm','Gripper'];
const roots=Object.fromEntries(names.map(n=>[n,group(n)]));
let triInput=0;
function mesh(p,n,m,g,pos,rot=[0,0,0]){
  const obj=new T.Mesh(g,materials[m]);obj.name=n;obj.position.fromArray(pos);obj.rotation.set(...rot);p.add(obj);return obj;
}
const orient={z:[0,0,0], y:[-Math.PI/2,0,0], x:[0,Math.PI/2,0]};
function profile(parent,name,material,at,coordinates,axis='z',segments=32){
  const pts=coordinates.map(v=>new T.Vector2(v[0],v[1]));
  const g=new T.LatheGeometry(pts,segments);g.rotateX(Math.PI/2);
  return mesh(parent,name,material,g,at,orient[axis]);
}
function disc(p,n,m,at,r,h,axis='z',b=.006,s=28){
  b=Math.min(b,h*.30,r*.25);const l=h/2;
  return profile(p,n,m,at,[[0,-l],[r-b,-l],[r,-l+b],[r,l-b],[r-b,l],[0,l]],axis,s);
}
function ring(p,n,m,at,r,i,h,axis='z',b=.004,s=32){
  const l=h/2;b=Math.min(b,h*.30,(r-i)*.27);
  return profile(p,n,m,at,[[i+b,-l],[r-b,-l],[r,-l+b],[r,l-b],[r-b,l],[i+b,l],[i,l-b],[i,-l+b],[i+b,-l]],axis,s);
}
function outlineShape(pts){
  const s=new T.Shape();s.moveTo(...pts[0]);for(const p of pts.slice(1))s.lineTo(...p);s.closePath();return s;
}
function panel(parent,name,material,at,pts,d,b=.006,rot=[0,0,0],cutouts=[]){
  const s=outlineShape(pts);
  for(const loop of cutouts)s.holes.push(outlineShape(loop));
  const bevel=Math.min(b,d*.22);
  const g=new T.ExtrudeGeometry(s,{depth:d-2*bevel,bevelEnabled:bevel>0,bevelSegments:1,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:5});
  g.translate(0,0,-(d-2*bevel)/2);
  return mesh(parent,name,material,g,at,rot);
}
function rect(w,h,r){
  r=Math.min(w*.46,h*.46,r);const pts=[];
  for(let k=0;k<4;k++){
    const [x,y]=[[w/2-r,h/2-r],[-w/2+r,h/2-r],[-w/2+r,-h/2+r],[w/2-r,-h/2+r]][k];
    for(let j=0;j<=3;j++){const a=(k+j/3)*Math.PI/2;pts.push([x+r*Math.cos(a),y+r*Math.sin(a)]);}
  }return pts;
}
const box=(p,n,m,at,w,h,d,r=.012,b=.005,rot=[0,0,0])=>panel(p,n,m,at,rect(w,h,r),d,b,rot);
function bolt(p,n,at,r=.021,axis='z',side=1){
  const along=axis==='z'?2:axis==='y'?1:0;
  const shifted=s=>at.map((v,i)=>v+(i===along?s*side:0));
  disc(p,n+' seat','bore',at,r*1.13,.010,axis,.001,12);
  disc(p,n+' cap','silver',shifted(.006),r,.012,axis,.002,12);
  disc(p,n+' hex drive','bore',shifted(.0125),r*.47,.002,axis,.0004,6);
}
function loom(p,name,pts,r){
  const route=new T.CatmullRomCurve3(pts.map(x=>new T.Vector3(...x)));
  return mesh(p,name,'rubber',new T.TubeGeometry(route,22,r,6,false),[0,0,0]);
}
const {Stand,Base,Shoulder,UpperArm,Elbow,Forearm,Gripper}=roots;
const deck=[[-.56,-.37],[-.39,-.53],[.37,-.53],[.55,-.38],[.55,.35],[.38,.51],[-.39,.51],[-.56,.35]];
panel(Stand,'Casting','deep',[0,.057,0],deck,.077,.009,orient.y);
panel(Stand,'Deck','shell',[0,.108,0],deck.map(p=>p.map(v=>v*.98)),.047,.008,orient.y);
ring(Stand,'Bearing lip','frame',[0,.144,0],.435,.34,.043,'y');
disc(Stand,'Seating well','bore',[0,.136,0],.341,.02,'y');
for(const x of [-.39,.39])for(const z of [-.35,.35]){
  disc(Stand,'Isolation shoe','rubber',[x,.016,z],.09,.032,'y');
  bolt(Stand,'Mounting bolt',[x,.133,z],.032,'y');
}
box(Stand,'Rating plate','deep',[0,.133,.434],.305,.069,.008,.008,.001,orient.y);
for(let j=0;j<5;j++)box(Stand,'Plate etching','silver',[-.11+j*.022,.138,.434],.011,.033,.003,.002,.0004,orient.y);
box(Stand,'Rating mark','orange',[.068,.138,.434],.093,.014,.003,.002,.0004,orient.y);
group('SocketBase',Stand,[0,.16,0]);
profile(Base,'Rotary casting','deep',[0,0,0],[[0,0],[.32,0],[.36,.019],[.36,.050],[.402,.072],[.402,.100],[.385,.115],[0,.115]],'y',48);
ring(Base,'Rotary track','orange',[0,.090,0],.407,.385,.029,'y',.004,48);
profile(Base,'Turntable housing','porcelain',[0,0,0],[[0,.107],[.383,.107],[.397,.119],[.399,.134],[.370,.167],[.326,.190],[.276,.195],[0,.195]],'y',48);
ring(Base,'Mounting collar','frame',[0,.193,0],.258,.168,.039,'y');
disc(Base,'Cup','bore',[0,.192,0],.166,.024,'y');
ring(Base,'Index register','rust',[0,.214,0],.240,.218,.011,'y');
box(Base,'Key','amber',[0,.218,.228],.042,.018,.047,.004,.001);
for(let i=0;i<6;i++){const t=(i+.5)*TAU/6;bolt(Base,'Deck fastener',[.307*Math.cos(t),.191,.307*Math.sin(t)],.019,'y');}
group('SocketShoulder',Base,[0,.22,0]);
function hinge(p,id,x,y,z,r,s){
  ring(p,id+' gasket','bore',[x,y,z],r*1.03,r*.54,.021);
  ring(p,id+' orange index','orange',[x,y,z+s*.014],r,r*.58,.035);
  disc(p,id+' boss','frame',[x,y,z+s*.028],r*.58,.031);
  ring(p,id+' steel lip','silver',[x,y,z+s*.046],r*.47,r*.34,.008);
  disc(p,id+' axial socket','bore',[x,y,z+s*.05],r*.24,.007,'z',.001,6);
  for(let i=0;i<3;i++){const a=.32+i*TAU/3;disc(p,id+' recess','rust',[x+r*.80*Math.cos(a),y+r*.80*Math.sin(a),z+s*.032],r*.067,.005,'z',.0008,8);}
}
disc(Shoulder,'Keyed heel','frame',[0,.016,0],.19,.043,'y');
box(Shoulder,'Motor foot','deep',[.006,.066,0],.40,.113,.421,.037,.009);
const cheek=[[-.18,0],[.166,0],[.212,.072],[.18,.317],[.156,.415],[.116,.481],[.049,.520],[-.039,.524],[-.117,.49],[-.171,.424],[-.192,.349],[-.209,.12]];
for(const s of [-1,1]){
  panel(Shoulder,'Yoke cheek','porcelain',[0,0,s*.207],cheek,.070,.010);
  panel(Shoulder,'Motor cover','shell',[0,0,s*.246],[[-.133,.083],[.109,.083],[.136,.11],[.106,.212],[-.118,.236],[-.148,.204]],.015,.003);
  hinge(Shoulder,'Shoulder cap',0,.40,s*.247,.132,s);
  for(const x of [-.137,.134])bolt(Shoulder,'Cheek screw',[x,.063,s*.243],.018,'z',s);
  for(let j=0;j<3;j++)box(Shoulder,'Cooling slot','deep',[-.065+j*.049,.158,s*.255],.013,.068,.005,.004,.0008,[0,0,-.24]);
}
disc(Shoulder,'Pivot axle','silver',[0,.4,0],.067,.39);
group('SocketUpperArm',Shoulder,[0,.4,0]);
function boom(p,L,upper){
  const f=upper?1:.85;
  const blank=[[-.035,.075],[.115,.143],[.247,.149],[L-.24,.105],[L-.116,.080],[L+.038,.044],[L+.036,-.047],[L-.156,-.087],[.282,-.136],[.105,-.119],[-.025,-.078]];
  const window=[[.367,-.046],[.418,.053],[L-.345,.025],[L-.306,-.008],[L-.382,-.034]];
  const coord=loop=>loop.map(([x,y])=>[x,y*f]);
  panel(p,'Alloy spine','frame',[0,0,0],coord(blank),.174*f,.007,[0,0,0],[coord(window)]);
  disc(p,'Input boss','frame',[0,0,0],.118*f,.275*f);
  disc(p,'Output boss','deep',[L,0,0],.094*f,.187*f);
  for(const s of [-1,1]){
    const z=s*.104*f;
    const trim=[[.055,.091],[.141,.145],[.266,.149],[L-.240,.099],[L-.121,.064],[L-.099,.031],[L-.144,-.053],[L-.270,-.082],[.288,-.117],[.139,-.103],[.066,-.061]];
    panel(p,'Split ivory armour','porcelain',[0,0,z],coord(trim),.065*f,.007,[0,0,0],[coord(window)]);
    panel(p,'Raised ridge','shell',[0,0,z+s*.034*f],coord([[.253,.089],[.307,.107],[L-.272,.060],[L-.245,.049],[L-.291,.047],[.298,.079]]),.005,.0008);
    panel(p,'Lower trim','frame',[0,0,z+s*.034*f],coord([[.211,-.077],[.304,-.082],[L-.272,-.044],[L-.301,-.060],[.302,-.100],[.226,-.095]]),.005,.0008);
    bolt(p,'Cover screw',[.158,.067*f,z+s*.036*f],.018*f,'z',s);
    bolt(p,'Distal screw',[L-.201,.009*f,z+s*.036*f],.015*f,'z',s);
    for(let j=0;j<(upper?3:2);j++)box(p,'Guide stripe','orange',[.218+j*.031,-.014*f,z+s*.035*f],.012,.051*f,.005,.001,.0005,[0,0,-.38]);
    ring(p,'Input bushing','silver',[0,0,s*.137*f],.095*f,.064*f,.013);
    ring(p,'Distal bushing','silver',[L,0,s*.098*f],.075*f,.050*f,.011);
  }
  loom(p,'Protected servo loom',[[.11,-.077,0],[.23,-.159*f,0],[.4,-.176*f,0],[L-.30,-.130*f,0],[L-.11,-.116*f,0],[L-.035,-.052*f,0]],.021*f);
  for(const x of [.40,L-.32])box(p,'Cable retainer','deep',[x,-(.160-.038*x/L)*f,0],.044,.053*f,.076*f,.008,.002);
  group(upper?'SocketElbow':'SocketGripper',p,[L,0,0]);
}
boom(UpperArm,1.35,true);boom(Forearm,1.10,false);
// The flat on a D-shaft visibly distinguishes the correct forearm orientation.
function dProfile(radius,fraction=.45){
  const alpha=Math.acos(fraction), arc=TAU-2*alpha;
  return Array.from({length:29},(_,i)=>{const a=alpha+arc*i/28;return [radius*Math.cos(a),radius*Math.sin(a)];});
}
function circle(radius,count=36){return Array.from({length:count},(_,i)=>[radius*Math.cos(TAU*i/count),radius*Math.sin(TAU*i/count)]);}
const elbowProfile=[[-.105,-.103],[-.157,-.047],[-.160,.046],[-.118,.114],[-.047,.149],[.051,.142],[.124,.102],[.166,.042],[.181,-.038],[.116,-.105],[.013,-.143]];
for(const s of [-1,1]){
  panel(Elbow,'Rotor enclosure','shell',[0,0,s*.166],elbowProfile,.061,.005,[0,0,0],s>0?[dProfile(.086)]:[]);
  if(s<0)hinge(Elbow,'Elbow cap',0,0,s*.198,.125,s);
  else{
    panel(Elbow,'Keyed drive flange','orange',[0,0,.205],circle(.126),.019,.002,[0,0,0],[dProfile(.086)]);
    disc(Elbow,'Recess bottom','bore',[0,0,.174],.091,.004);
    for(const angle of [1.24,3.40,5.17]){
      bolt(Elbow,'Flange screw',[.106*Math.cos(angle),.106*Math.sin(angle),.215],.010);
    }
  }
  bolt(Elbow,'Rotor fastener',[.134,-.045,s*.198],.013,'z',s);
}
box(Elbow,'Servo bridge','deep',[.002,-.099,0],.199,.077,.303,.017,.004);
disc(Elbow,'Drive axle','silver',[0,0,0],.060,.344);
group('SocketForearm',Elbow);
// A visible outboard cheek on the forearm slides onto the elbow's drive flange.
// The D pin continues through the cheek: its shape can be read from either side.
const forearmEar=[[-.104,-.035],[-.103,.038],[-.071,.086],[-.021,.106],[.046,.101],[.127,.073],[.223,.061],[.265,.030],[.264,-.041],[.211,-.062],[.121,-.073],[.042,-.098],[-.039,-.099],[-.084,-.076]];
panel(Forearm,'Outboard coupling cheek','frame',[0,0,.240],forearmEar,.038,.004,[0,0,0],[dProfile(.080)]);
box(Forearm,'Forearm flange bridge','shell',[.224,0,.177],.085,.119,.103,.020,.004);
panel(Forearm,'D shaped drive tang','silver',[0,0,.206],dProfile(.077),.053,.0015);
panel(Forearm,'Visible keyed pin end','orange',[0,0,.249],dProfile(.0765),.034,.0015);
disc(Forearm,'Axle retention screw','deep',[-.012,0,.269],.019,.006,'z',.001,12);
bolt(Forearm,'Cheek fastener',[.204,.003,.259],.017);
disc(Gripper,'Wrist clevis','frame',[0,.005,0],.091,.246);
for(const s of [-1,1]){
  ring(Gripper,'Wrist bearing','orange',[0,.005,s*.130],.082,.042,.021);
  disc(Gripper,'Wrist pin','silver',[0,.005,s*.143],.044,.014);
}
box(Gripper,'Wrist stem','deep',[0,-.078,0],.137,.162,.138,.017,.004);
box(Gripper,'Gripper bridge','porcelain',[0,-.145,0],.206,.125,.696,.030,.008);
box(Gripper,'Linear guide','frame',[0,-.215,0],.159,.058,.669,.010,.004);
for(const s of [-1,1]){
  box(Gripper,'End stop','orange',[0,-.164,s*.343],.196,.10,.024,.017,.003);
  bolt(Gripper,'Guide fixing',[.108,-.145,s*.222],.019,'x');
}
const finger=[[-.073,-.206],[.074,-.206],[.071,-.25],[.043,-.284],[.041,-.387],[.023,-.432],[-.035,-.432],[-.066,-.403],[-.057,-.306],[-.073,-.269]];
for(const s of [-1,1]){
  const jaw=group(s>0?'JawLeft':'JawRight',Gripper,[0,0,s*.29]);
  box(jaw,'Slider','deep',[0,-.221,0],.159,.063,.101,.011,.004);
  panel(jaw,'Jaw finger','frame',[0,0,0],finger,.075,.005);
  box(jaw,'Elastomer pad','rubber',[0,-.364,-s*.048],.108,.142,.026,.010,.003);
  for(let j=0;j<4;j++)box(jaw,'Grip tread','bore',[0,-.314-j*.032,-s*.0625],.099,.009,.005,.002,.0006);
  bolt(jaw,'Jaw pin',[0,-.263,s*.040],.018,'z',s);
}
group('GripCenter',Gripper,[0,-.36,0]);


// Combine fixed surfaces by material. Each joint, snap point and moving jaw keeps its own node.
const matNames=Object.keys(palette);
const document={
  asset:{version:'2.0',generator:'Rakitron parametric toolmaking studio'},
  scene:0,scenes:[{name:'Assembly kit',nodes:[]}],nodes:[],meshes:[],materials:[],buffers:[],bufferViews:[],accessors:[]
};
for(const key of matNames){
  const m=materials[key];document.materials.push({name:key,pbrMetallicRoughness:{baseColorFactor:[m.color.r,m.color.g,m.color.b,1],metallicFactor:m.metalness,roughnessFactor:m.roughness}});
}
const spans=[];let bufferLength=0;
const packed=(arr,type,accessType,target,min,max)=>{
  const padding=(4-bufferLength%4)%4;
  if(padding){spans.push(Buffer.alloc(padding));bufferLength+=padding;}
  const bytes=Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength);
  const view=document.bufferViews.push({buffer:0,byteOffset:bufferLength,byteLength:bytes.length,target})-1;
  spans.push(bytes);bufferLength+=bytes.length;
  const count=arr.length/(accessType==='VEC3'?3:1);
  return document.accessors.push({bufferView:view,componentType:type,count,type:accessType,...(min?{min,max}:{})})-1;
};
function appendGroup(obj){
  const n={name:obj.name};
  if(obj.position.lengthSq())n.translation=obj.position.toArray();
  const i=document.nodes.push(n)-1;
  const mBy=new Map();
  for(const child of obj.children){
    if(child.isGroup){(n.children??=[]).push(appendGroup(child));continue;}
    const id=child.material.name;
    if(!mBy.has(id))mBy.set(id,{points:[],normals:[],indices:[],used:new Map()});
    const pool=mBy.get(id);
    child.updateMatrix();const transform=child.matrix;const normalTransform=new T.Matrix3().getNormalMatrix(transform);
    const g=child.geometry,positions=g.attributes.position,normals=g.attributes.normal;
    const vec=new T.Vector3(),norm=new T.Vector3();
    const remap=[];
    for(let j=0;j<positions.count;j++){
      vec.fromBufferAttribute(positions,j).applyMatrix4(transform);
      norm.fromBufferAttribute(normals,j).applyMatrix3(normalTransform).normalize();
      const v=vec.toArray(),vn=norm.toArray();
      const key=[...v,...vn].map(x=>Math.round(x*800000)).join(',');
      let k=pool.used.get(key);
      if(k===undefined){k=pool.points.length/3;pool.used.set(key,k);pool.points.push(...v);pool.normals.push(...vn);}
      remap[j]=k;
    }
    const idx=g.index?g.index.array:Array.from({length:positions.count},(_,k)=>k);
    for(let k=0;k<idx.length;k+=3){
      const a=remap[idx[k]],b=remap[idx[k+1]],c=remap[idx[k+2]];
      if(a!==b&&b!==c&&c!==a)pool.indices.push(a,b,c);
    }
  }
  if(mBy.size){const primitives=[];
    for(const [name,p] of mBy){
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(let j=0;j<p.points.length;j++){const axis=j%3;lo[axis]=Math.min(lo[axis],p.points[j]);hi[axis]=Math.max(hi[axis],p.points[j]);}
      const a=packed(new Float32Array(p.points),5126,'VEC3',34962,lo,hi);
      const b=packed(new Float32Array(p.normals),5126,'VEC3',34962);
      const large=p.points.length/3>=65536;
      const inds=packed(large?new Uint32Array(p.indices):new Uint16Array(p.indices),large?5125:5123,'SCALAR',34963);
      triInput+=p.indices.length/3;
      primitives.push({attributes:{POSITION:a,NORMAL:b},indices:inds,material:matNames.indexOf(name)});
    }
    n.mesh=document.meshes.push({name:obj.name+' surfaces',primitives})-1;
  }
  return i;
}
// Individual top-level part nodes retain local joint origins while their scene
// transforms place the downloadable kit in an assembled, bent rest pose.
function assembledRig(parts){
  const rig=group('Assembled view');const {Stand,Base,Shoulder,UpperArm,Elbow,Forearm,Gripper}=parts;
  rig.add(Stand);Base.position.y=.16;Stand.add(Base);Shoulder.position.y=.22;Base.add(Shoulder);
  UpperArm.position.y=.40;UpperArm.rotation.z=1.02;Shoulder.add(UpperArm);
  Elbow.position.x=1.35;Elbow.rotation.z=-1.43;UpperArm.add(Elbow);
  Elbow.add(Forearm);Gripper.position.x=1.10;Gripper.rotation.z=.41;Forearm.add(Gripper);
  rig.updateMatrixWorld(true);return rig;
}
const previewTransforms=Object.fromEntries(names.map(n=>[n,group(n)]));
assembledRig(previewTransforms);
for(const name of names){
  const id=appendGroup(roots[name]),entry=document.nodes[id],transform=previewTransforms[name];
  const xyz=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();
  transform.matrixWorld.decompose(xyz,q,s);
  if(xyz.lengthSq()>1e-15)entry.translation=xyz.toArray();
  if(1-Math.abs(q.w)>1e-12)entry.rotation=q.toArray();
  document.scenes[0].nodes.push(id);
}
document.buffers.push({byteLength:bufferLength});
let json=Buffer.from(JSON.stringify(document));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
let bin=Buffer.concat(spans);bin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const header=Buffer.alloc(20),bhead=Buffer.alloc(8);
header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);
bhead.writeUInt32LE(bin.length,0);bhead.write('BIN\0',4);
const filename=path.join(modelDir,'rakitron-arm.glb');
fs.writeFileSync(filename,Buffer.concat([header,json,bhead,bin]));
console.log('Generated',path.basename(filename),triInput,'triangles;',fs.statSync(filename).size,'bytes.');

// Portable orthographic z-buffer for baked thumbnail images, independent of WebGL.
const zlib=require('node:zlib');
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function png(w,h,pixels){
  function chunk(type,data){
    const id=Buffer.from(type),all=Buffer.concat([id,data]);let crc=0xffffffff;
    for(const v of all)crc=(crc>>>8)^crcTable[(crc^v)&255];
    const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([head,all,tail]);
  }
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  const rows=Buffer.alloc((1+4*w)*h);for(let y=0;y<h;y++)pixels.copy(rows,y*(1+4*w)+1,y*4*w,(y+1)*4*w);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function render(obj,title,view,outW,outH){
  const aa=2,w=outW*aa,h=outH*aa;
  const eye=new T.Vector3(...view).normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),eye).normalize(),up=new T.Vector3().crossVectors(eye,right);
  const lightSide=view[2]<0 ? -1 : 1;
  const keyLight=new T.Vector3(-.35,.86,.50*lightSide).normalize(),rimLight=new T.Vector3(.48,.42,-.72*lightSide).normalize();
  const half=new T.Vector3().addVectors(eye,keyLight).normalize();
  const batches=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  obj.updateMatrixWorld(true);
  obj.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geom=mesh.geometry,pos=geom.attributes.position,n=geom.attributes.normal;
    const nm=new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const vec=new T.Vector3(),nv=new T.Vector3();const vertices=[];
    for(let i=0;i<pos.count;i++){
      vec.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
      nv.fromBufferAttribute(n,i).applyMatrix3(nm).normalize();
      const x=vec.dot(right),y=vec.dot(up),z=vec.dot(eye);
      const key=Math.max(0,nv.dot(keyLight)),rim=Math.max(0,nv.dot(rimLight));
      const sheen=Math.pow(Math.max(0,nv.dot(half)),mesh.material.metalness>.4?20:35)*(.095+mesh.material.metalness*.24);
      vertices.push([x,y,z,.65+.38*key+.10*rim+.025*nv.y,sheen]);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    const col=mesh.material.color.getHex();
    batches.push({vertices,ids:geom.index?geom.index.array:Array.from({length:pos.count},(_,i)=>i),rgb:[col>>16,col>>8&255,col&255]});
  });
  const scale=.86*Math.min(w/(maxX-minX),h/(maxY-minY)),ox=w/2-scale*(maxX+minX)/2,oy=h/2+scale*(maxY+minY)/2;
  const pixels=Buffer.alloc(4*w*h);const depth=new Float32Array(w*h);depth.fill(-Infinity);
  for(const {vertices,ids,rgb} of batches){
    for(const v of vertices){v[0]=ox+scale*v[0];v[1]=oy-scale*v[1];}
    for(let i=0;i<ids.length;i+=3){
      const a=vertices[ids[i]],b=vertices[ids[i+1]],c=vertices[ids[i+2]];
      const abx=b[0]-a[0],aby=b[1]-a[1],acx=c[0]-a[0],acy=c[1]-a[1];
      const ar=abx*acy-aby*acx;if(ar>=-.00001)continue;
      const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0])));
      const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const rx=x+.5-a[0],ry=y+.5-a[1],u=(rx*acy-ry*acx)/ar,v=(abx*ry-aby*rx)/ar;
        if(u<0||v<0||u+v>1)continue;
        const t=1-u-v,z=t*a[2]+u*b[2]+v*c[2],idx=y*w+x;
        if(z<=depth[idx])continue;
        depth[idx]=z;const scalar=t*a[3]+u*b[3]+v*c[3],shine=t*a[4]+u*b[4]+v*c[4];
        for(let k=0;k<3;k++)pixels[idx*4+k]=Math.min(255,rgb[k]*scalar+255*shine);
        pixels[idx*4+3]=255;
      }
    }
  }
  const out=Buffer.alloc(4*outW*outH);
  for(let y=0;y<outH;y++)for(let x=0;x<outW;x++){
    const acc=[0,0,0,0];for(let yy=0;yy<aa;yy++)for(let xx=0;xx<aa;xx++){
      const idx=((aa*y+yy)*w+aa*x+xx)*4;
      for(let k=0;k<4;k++)acc[k]+=pixels[idx+k];
    }
    const dst=(y*outW+x)*4;
    if(acc[3])for(let k=0;k<3;k++)out[dst+k]=Math.round(acc[k]*255/acc[3]);
    out[dst+3]=Math.round(acc[3]/(aa*aa));
  }
  const data=png(outW,outH,out);
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 '+outW+' '+outH+'"><title>'+title+'</title><image x="0" y="0" width="'+outW+'" height="'+outH+'" xlink:href="data:image/png;base64,'+data.toString('base64')+'"/></svg>';
}
const previews=[
  ['base',Base,'Alas putar',[1.5,1.7,2.1]],
  ['shoulder',Shoulder,'Modul bahu',[1.7,1.10,2.4]],
  ['upper-arm',UpperArm,'Lengan atas',[1.15,1.25,2.7]],
  ['elbow',Elbow,'Modul siku',[1.4,.82,2.5]],
  ['forearm',Forearm,'Lengan bawah',[1.15,1.25,2.7]],
  ['gripper',Gripper,'Capit dua rahang',[3.5,1.1,1.65]]
];
for(const [slug,part,title,eye] of previews){fs.writeFileSync(path.join(partsDir,slug+'.svg'),render(part,title,eye,248,160));}
const rig=assembledRig(roots);
fs.writeFileSync(path.join(partsDir,'assembled.svg'),render(rig,'Lengan robot Rakitron terakit',[.98,.78,3.0],560,400));
async function writeHandPreviews(){
  const {createRoboticHand}=await import('../lib/handModel.ts');
  const hand=createRoboticHand({angles:{thumb:6,index:3,middle:4,ring:7,little:10},opposition:12});
  try {
    hand.group.rotation.z=Math.PI*.92;
    fs.writeFileSync(path.join(partsDir,'hand.svg'),render(hand.group,'Tangan robot lima jari',[-.80,.52,-3.4],248,160));

    const wrist=Gripper.parent;
    hand.group.position.copy(Gripper.position);
    hand.group.quaternion.copy(Gripper.quaternion);
    wrist.remove(Gripper);
    wrist.add(hand.group);
    fs.writeFileSync(path.join(partsDir,'assembled-hand.svg'),render(rig,'Lengan Rakitron dengan tangan lima jari',[.85,.62,-3.4],560,400));
  } finally {
    hand.dispose();
  }
}
writeHandPreviews().then(() => console.log('Wrote 9 previews baked from robot geometry.')).catch(error => {
  console.error(error);
  process.exitCode=1;
});

