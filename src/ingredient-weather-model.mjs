import {
  BoxGeometry, CapsuleGeometry, Color, ExtrudeGeometry, Group, Mesh,
  MeshStandardMaterial, Shape, SphereGeometry,
} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const KINDS=new Set(['sunny','cloudy','rain','snow','storm','fog']);
const cache=new Map();
let materials;
const C={cloud:'#fff9e9',cloudShade:'#dce8e9',storm:'#d4dfe4',sun:'#f3bb53',ray:'#ffce6e',rain:'#92cddd',snow:'#f8ffff',fog:'#e0ebe9'};

function sharedMaterials(){
  if(!materials)materials={
    cloud:new MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,
      transparent:true,opacity:.91,depthWrite:false,toneMapped:false}),
    accent:new MeshStandardMaterial({vertexColors:true,roughness:.86,metalness:0,
      transparent:true,opacity:.97,depthWrite:false,toneMapped:false}),
  };
  return materials;
}

function piece(geometry,color,{position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]}={}){
  const result=geometry.index?geometry.toNonIndexed():geometry;
  if(result!==geometry)geometry.dispose();
  result.deleteAttribute('uv');result.clearGroups();
  result.scale(...scale).rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]).translate(...position);
  const value=new Color(color),colors=new Float32Array(result.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3){colors[i]=value.r;colors[i+1]=value.g;colors[i+2]=value.b;}
  // Attribute constructor matches the geometry's Float32 position attribute.
  result.setAttribute('color',new result.attributes.position.constructor(colors,3));
  return result;
}

const ball=(color,position,scale)=>piece(new SphereGeometry(1,10,7),color,{position,scale});
const bar=(color,position,length,radius,angle=0)=>piece(new CapsuleGeometry(radius,length,2,6),color,{position,rotation:[0,0,angle]});

function cloudParts(kind){
  const main=kind==='storm'?C.storm:C.cloud;
  return [
    ball(C.cloudShade,[-.94,1.20,-.02],[.51,.42,.38]),
    ball(main,[-.43,1.42,0],[.62,.54,.43]),
    ball(main,[.27,1.43,.01],[.58,.50,.42]),
    ball(main,[.90,1.20,-.02],[.49,.40,.35]),
    ball(kind==='storm'?C.storm:C.cloud,[.05,1.02,.10],[.78,.28,.39]),
  ];
}

function build(kind){
  const opaque=[],soft=[];
  if(kind==='sunny'){
    opaque.push(ball(C.sun,[0,1,0],[.56,.56,.43]));
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4;
      opaque.push(bar(C.ray,[Math.sin(angle)*.83,1+Math.cos(angle)*.83,0],.18,.045,-angle));
    }
  }else{
    soft.push(...cloudParts(kind));
    if(kind==='rain'){
      for(const x of [-.72,0,.72])opaque.push(bar(C.rain,[x,.37,.15],.35,.049,-.23));
    }else if(kind==='snow'){
      for(const [x,y] of [[-.72,.30],[0,.41],[.72,.25]]){
        for(let angle=0;angle<Math.PI;angle+=Math.PI/3){
          opaque.push(piece(new BoxGeometry(.041,.31,.042),C.snow,{position:[x,y,.16],rotation:[0,0,angle]}));
        }
      }
    }else if(kind==='storm'){
      const outline=new Shape();
      outline.moveTo(.10,.95);outline.lineTo(-.31,.45);outline.lineTo(-.04,.48);
      outline.lineTo(-.17,.04);outline.lineTo(.46,.65);outline.lineTo(.15,.59);
      outline.lineTo(.29,.95);outline.closePath();
      opaque.push(piece(new ExtrudeGeometry(outline,{depth:.09,bevelEnabled:false,steps:1}),C.sun,{position:[0,0,.39]}));
    }else if(kind==='fog'){
      for(const [x,y,length] of [[-.17,.16,2.62],[.18,.43,2.35],[-.06,.70,2.73]])
        opaque.push(bar(C.fog,[x,y,.18],length,.055,Math.PI/2));
    }
  }
  const parts=[];
  for(const [name,geometries] of [['cloud',soft],['accent',opaque]]){
    if(!geometries.length)continue;
    const geometry=mergeGeometries(geometries,false);
    for(const source of geometries)source.dispose();
    if(!geometry)throw new Error('Unable to merge ingredient weather geometry');
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    geometry.userData={sharedIngredientWeather:true,kind};
    parts.push({name,geometry,material:sharedMaterials()[name]});
  }
  cache.set(kind,parts);
  return parts;
}

/**
 * A small weather hint above a plant canopy, in local +Y-up coordinates.
 * Front is +Z; all parts are actual shallow 3D geometry. Height stays below
 * two units, width below 3.5. No sprites, textures, text, animation, or requests.
 *
 * Every call returns independently transformable objects. Geometry/materials
 * are shared; remove instances without disposing their shared mesh resources.
 */
export function createIngredientWeatherBadge(kind){
  const group=new Group();group.name=`ingredient-weather-${String(kind)}`;
  group.userData={kind:KINDS.has(kind)?kind:'unknown',sharedIngredientWeather:true};
  if(!KINDS.has(kind))return group;
  for(const part of cache.get(kind)||build(kind)){
    const mesh=new Mesh(part.geometry,part.material);
    mesh.name=`weather-${kind}-${part.name}`;
    mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=2;
    // The region's plant/pick proxy handles interaction; weather has none.
    mesh.raycast=()=>{};
    group.add(mesh);
  }
  return group;
}

/** Dispose once when every badge instance has been removed (not per clone). */
export function disposeWeatherBadgeCache(){
  for(const parts of cache.values())for(const {geometry} of parts)geometry.dispose();
  cache.clear();
  if(materials)for(const material of Object.values(materials))material.dispose();
  materials=undefined;
}

/** Inspect resources already built; does not allocate models or touch a DOM. */
export function ingredientWeatherBadgeCacheStats(){
  return {kinds:cache.size,materials:materials?2:0,models:[...cache.entries()].map(([kind,parts])=>({kind,
    drawCalls:parts.length,triangles:parts.reduce((sum,{geometry})=>sum+geometry.attributes.position.count/3,0)}))};
}
