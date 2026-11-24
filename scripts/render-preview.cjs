const T = require('three');

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

module.exports = render;
