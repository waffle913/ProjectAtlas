import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { xyz, lonLat, countryAt, type GlobePolygon, type Point } from './globeGeometry';
import {countryFocus,focusDistance,easeCamera,type CountryFocus} from './globeCamera';
import { sovereignBorderSegments } from './globeGeometry';
export interface GlobeRenderOptions { saved?: boolean; regionPicking?: boolean; focusCountryId?:string; reducedMotion?:boolean }
export interface GlobeMarker { x:number;y:number;visible:boolean }
export interface GlobeController { select(id: string,focus?:boolean): void; zoom(factor: number): void; recenter(): void; free():void; dispose(): void }
function surfaceGeometry(polygons: readonly GlobePolygon[]): THREE.BufferGeometry {
  const vertices: number[]=[];
  const triangle=(a:Point,b:Point,c:Point,depth=0) => {
    const distances=[Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(b[0]-c[0],b[1]-c[1]),Math.hypot(c[0]-a[0],c[1]-a[1])];
    const edge=distances.indexOf(Math.max(...distances));
    if(distances[edge]>4 && depth<8) {
      const p=[a,b,c][edge],q=[b,c,a][edge],r=[c,a,b][edge];const m:Point=[(p[0]+q[0])/2,(p[1]+q[1])/2];
      triangle(p,m,r,depth+1);triangle(m,q,r,depth+1);return;
    }
    vertices.push(...xyz(a,1.004),...xyz(b,1.004),...xyz(c,1.004));
  };
  for(const polygon of polygons) {
    const rings=polygon.rings.map(r=>r.map(p=>new THREE.Vector2(...p)));
    if((rings[0]?.length??0)<3)continue;
    const faces=THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1));const points=rings.flat();
    for(const f of faces) triangle(points[f[0]].toArray() as Point,points[f[1]].toArray() as Point,points[f[2]].toArray() as Point);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}
function borderGeometry(polygons: readonly GlobePolygon[], sovereignOnly=false): THREE.BufferGeometry {
  const vertices:number[]=[];
  const rings=sovereignOnly?sovereignBorderSegments(polygons):polygons.flatMap(p=>p.rings);
  for(const ring of rings)for(let i=0;i<(sovereignOnly?1:ring.length);i++){
    const a=ring[i],b=ring[(i+1)%ring.length];let bx=b[0];while(bx-a[0]>180)bx-=360;while(bx-a[0]<-180)bx+=360;
    const n=Math.max(1,Math.ceil(Math.hypot(bx-a[0],b[1]-a[1])/2));
    for(let j=0;j<n;j++)for(const t of [j/n,(j+1)/n])vertices.push(...xyz([a[0]+(bx-a[0])*t,a[1]+(b[1]-a[1])*t],1.007));
  }
  return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
}
export function mountGlobe(host: HTMLElement, polygons: readonly GlobePolygon[], onSelect:(id:string)=>void, onHover:(id?:string,point?:GlobeMarker)=>void,onMarker:(point:GlobeMarker)=>void,options:GlobeRenderOptions={}): GlobeController {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('data-texture-status','loading');renderer.domElement.setAttribute('aria-label','Globe terrestre 3D interactif');host.append(renderer.domElement);
  const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(40,1,.005,20);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.1;controls.minDistance=1.18;controls.maxDistance=5;controls.rotateSpeed=.55;controls.zoomSpeed=.7;
  const sphereGeometry=new THREE.SphereGeometry(1,96,64);
  const sphereMaterial=new THREE.MeshBasicMaterial({color:0x8eafd3});
  const earth=new THREE.Mesh(sphereGeometry,sphereMaterial);scene.add(earth);
  sphereMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat lightMask=smoothstep(0.12,0.45,diffuseColor.r+diffuseColor.g+diffuseColor.b);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.0,0.65,0.25)*max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b)*1.6,lightMask);');};
  let dead=false,selected='',frame=0,inFrame=false,interacting=false,settleUntil=0,resumeAfter=0,lastFrame=0,lastMarker=0;
  let mode:'free'|'focused'|'transition'='free';
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced=Boolean(options.reducedMotion || preference.matches);
  controls.enableDamping=!reduced;
  const focusCache=new Map<string,CountryFocus|undefined>();
  let selectedFocus:CountryFocus|undefined;
  let focusPoints:THREE.Vector3[]=[];let renderedFrames=0;
  let flight:{start:number;from:THREE.Vector3;to:THREE.Vector3;endMode:'free'|'focused'}|undefined;
  const worldUp=new THREE.Vector3(0,1,0);
  const setMode=(value:typeof mode)=>{mode=value;renderer.domElement.dataset.cameraMode=value;};
  renderer.domElement.dataset.motion=reduced?'reduced':'animated';
  const cancelFlight=()=>{if(flight){flight=undefined;setMode('free');}resumeAfter=performance.now()+1400;};
  const needsFrame=()=>!reduced && !document.hidden && (Boolean(flight)||interacting||performance.now()<settleUntil||mode==='free');
  function schedule(){if(!dead && !frame && needsFrame())frame=requestAnimationFrame(animate);}
  function animate(time:number){
    frame=0;if(dead)return;inFrame=true;
    const delta=lastFrame?Math.min(.05,(time-lastFrame)/1000):0;lastFrame=time;
    if(flight){
      const progress=easeCamera((time-flight.start)/650);
      const from=flight.from.clone().normalize(),to=flight.to.clone().normalize();
      const rotation=new THREE.Quaternion().setFromUnitVectors(from,to);
      from.applyQuaternion(new THREE.Quaternion().slerp(rotation,progress));
      camera.position.copy(from.multiplyScalar(THREE.MathUtils.lerp(flight.from.length(),flight.to.length(),progress)));
      camera.lookAt(0,0,0);controls.update();
      if(progress>=1){const endMode=flight.endMode;flight=undefined;setMode(endMode);resumeAfter=time+600;}
    }else{
      if(interacting || time<settleUntil)controls.update();
      if(mode==='free' && !interacting && time>resumeAfter){camera.position.applyAxisAngle(worldUp,.006*delta);camera.lookAt(0,0,0);controls.update();}
    }
    render();inFrame=false;schedule();
  }
  function travel(to:THREE.Vector3,endMode:'free'|'focused'){
    flight=undefined;settleUntil=0;
    // Clear residual damping before installing an explicit camera target.
    const damping=controls.enableDamping;const pose=camera.position.clone();const wasInFrame=inFrame;inFrame=true;controls.enableDamping=false;controls.update();camera.position.copy(pose);camera.lookAt(0,0,0);controls.update();controls.enableDamping=damping;inFrame=wasInFrame;
    if(reduced){camera.position.copy(to);camera.lookAt(0,0,0);controls.update();setMode(endMode);render();return;}
    flight={start:performance.now(),from:camera.position.clone(),to,endMode};setMode('transition');schedule();
  }
  function focusSelected(){
    if(!selectedFocus)return;
    travel(new THREE.Vector3(...xyz(selectedFocus.center,focusDistance(selectedFocus.radius,camera.fov,camera.aspect))),'focused');
  }
  const texture=new THREE.TextureLoader().load('/globe/black-marble-2016.jpg',()=>{if(dead){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;sphereMaterial.map=texture;sphereMaterial.needsUpdate=true;renderer.domElement.setAttribute('data-texture-status','ready');render();},undefined,()=>render());
  const borders=new THREE.LineSegments(borderGeometry(polygons,options.saved),new THREE.LineBasicMaterial({color:0x4194c3,transparent:true,opacity:.65}));scene.add(borders);
  const highlight=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xe7ac4e,transparent:true,opacity:.52,side:THREE.DoubleSide,depthWrite:false}));scene.add(highlight);
  const outline=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffd58c,transparent:true,opacity:1}));scene.add(outline);
  // Saved overlays do not change polygon identity/sovereignty. Screen-space hatching follows the occupied mesh.
  if(options.saved) {
    for(const p of polygons.filter(p=>p.control)) {
      const color=p.control==='contested'?0xffa478:p.controllerId===options.focusCountryId?0xeac37e:0x94c9f0;
      const material=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,uniforms:{tint:{value:new THREE.Color(color)}},
        vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:'uniform vec3 tint;void main(){float stripe=step(0.48,fract((gl_FragCoord.x+gl_FragCoord.y)/12.0));gl_FragColor=vec4(tint,stripe*0.85);}'});
      const layer=new THREE.Mesh(surfaceGeometry([p]),material);layer.renderOrder=3;scene.add(layer);
    }
  }
  const hover=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xffd58c,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false}));scene.add(hover);
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.012,64,48),new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 n;varying vec3 v;void main(){float a=pow(1.0-abs(dot(normalize(n),normalize(v))),3.0);gl_FragColor=vec4(0.25,0.6,1.0,a*0.9);}'}));scene.add(atmosphere);
  const render=()=>{
    if(dead)return;renderer.render(scene,camera);
    renderer.domElement.dataset.renderedFrames=String(++renderedFrames);
    renderer.domElement.dataset.interacting=String(interacting);
    // Camera observations and interaction state describe the same rendered pose.
    // Only the React marker below is throttled; a pointerdown must not expose an old longitude.
    renderer.domElement.dataset.cameraLongitude=String(lonLat(camera.position.toArray() as [number,number,number])[0]);
    if(mode==='focused' && focusPoints.length){
      const points=focusPoints.map(p=>p.clone().project(camera));
      renderer.domElement.dataset.focusBounds=JSON.stringify({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))});
    }

    const time=performance.now();if(time-lastMarker<40 && !reduced && mode!=='focused')return;lastMarker=time;
    const center=selectedFocus?.center;
    if(center){const position=new THREE.Vector3(...xyz(center,1.01));const visible=position.clone().normalize().dot(camera.position.clone().normalize())>0;
      position.project(camera);const rect=host.getBoundingClientRect();onMarker({x:rect.left+(position.x+1)/2*rect.width,y:rect.top+(1-position.y)/2*rect.height,visible});
    }else onMarker({x:0,y:0,visible:false});
  };
  camera.position.set(...xyz([20,28],3.1));camera.lookAt(0,0,0);controls.update();setMode('free');
  const onChange=()=>{if(!inFrame){render();schedule();}};
  const onStart=()=>{interacting=true;cancelFlight();render();schedule();};
  const onEnd=()=>{interacting=false;settleUntil=performance.now()+1200;resumeAfter=settleUntil+600;render();schedule();};
  controls.addEventListener('change',onChange);controls.addEventListener('start',onStart);controls.addEventListener('end',onEnd);
  const resize=()=>{if(dead)return;const r=host.getBoundingClientRect();if(!r.width||!r.height)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height);if(mode==='focused')focusSelected();else render();schedule();};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const motionChange=()=>{
    reduced=Boolean(options.reducedMotion || preference.matches);controls.enableDamping=!reduced;renderer.domElement.dataset.motion=reduced?'reduced':'animated';
    if(reduced){if(frame)cancelAnimationFrame(frame);frame=0;if(flight){camera.position.copy(flight.to);setMode(flight.endMode);flight=undefined;camera.lookAt(0,0,0);controls.update();}render();}
    else{lastFrame=0;schedule();}
  };
  preference.addEventListener('change',motionChange);
  const visibility=()=>{if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;cancelFlight();}else{lastFrame=0;schedule();}};
  document.addEventListener('visibilitychange',visibility);
  const pickingPolygons=options.regionPicking?polygons.map(p=>({...p,countryId:p.regionId??p.countryId})):polygons;
  const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let down:[number,number]|undefined,hoverId:string|undefined;
  const hit=(e:PointerEvent)=>{const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(earth)[0];return hit?countryAt(pickingPolygons,...lonLat(hit.point.toArray() as [number,number,number])):undefined;};
  const pointerDown=(e:PointerEvent)=>{down=[e.clientX,e.clientY];};
  const pointerUp=(e:PointerEvent)=>{if(down && Math.hypot(e.clientX-down[0],e.clientY-down[1])<5){const id=hit(e);if(id)onSelect(id);}down=undefined;};
  // A cancelled/capture-lost gesture cannot later turn into a country click.
  const cancelPointer=()=>{down=undefined;};
  const pointerMove=(e:PointerEvent)=>{if(e.buttons){if(down && Math.hypot(e.clientX-down[0],e.clientY-down[1])>=5){cancelFlight();setMode('free');}return;}const id=hit(e);if(id===hoverId)return;hoverId=id;hover.geometry.dispose();hover.geometry=id && id!==selected?surfaceGeometry(polygons.filter(p=>(options.regionPicking?p.regionId??p.countryId:p.countryId)===id)):new THREE.BufferGeometry();onHover(id,{x:e.clientX,y:e.clientY,visible:true});render();};
  const leave=()=>{hoverId=undefined;onHover();hover.geometry.dispose();hover.geometry=new THREE.BufferGeometry();render();};
  const keyDown=(e:KeyboardEvent)=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','+','-'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='Home'){focusSelected();return;}
    cancelFlight();resumeAfter=performance.now()+1500;
    if(e.key==='+' || e.key==='-'){camera.position.multiplyScalar(e.key==='+'?.85:1.15).clampLength(1.18,5);controls.update();render();return;}
    setMode('free');
    const p=lonLat(camera.position.toArray() as [number,number,number]);
    p[0]+=e.key==='ArrowLeft'?-5:e.key==='ArrowRight'?5:0;
    p[1]=Math.max(-85,Math.min(85,p[1]+(e.key==='ArrowUp'?5:e.key==='ArrowDown'?-5:0)));
    camera.position.set(...xyz(p,camera.position.length()));controls.update();render();
  };
  renderer.domElement.addEventListener('keydown',keyDown);
  const contextLost=(e:Event)=>{e.preventDefault();host.dispatchEvent(new Event('globe-unavailable'));};
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerleave',leave);renderer.domElement.addEventListener('pointercancel',cancelPointer);renderer.domElement.addEventListener('lostpointercapture',cancelPointer);renderer.domElement.addEventListener('webglcontextlost',contextLost);
  schedule();
  return {
    select(id,focus=true){
      selected=id;hover.geometry.dispose();hover.geometry=new THREE.BufferGeometry();onHover();
      if(!focusCache.has(id))focusCache.set(id,countryFocus(polygons,id));selectedFocus=focusCache.get(id);
      const p=polygons.filter(p=>p.countryId===id);
      renderer.domElement.dataset.focusCountry=id;
      const direction=selectedFocus?new THREE.Vector3(...xyz(selectedFocus.center)):undefined;
      focusPoints=direction?p.flatMap(p=>p.rings[0]).map(point=>new THREE.Vector3(...xyz(point,1.007))).filter(v=>v.clone().normalize().dot(direction)>=.5):[];
      highlight.geometry.dispose();outline.geometry.dispose();
      highlight.geometry=surfaceGeometry(p);outline.geometry=borderGeometry(p,options.saved);
      if(!selectedFocus){cancelFlight();setMode('free');render();schedule();}
      else if(focus)focusSelected();else render();
    },
    zoom(factor){cancelFlight();camera.position.multiplyScalar(factor).clampLength(1.18,5);controls.update();render();schedule();},
    recenter(){focusSelected();},
    free(){travel(camera.position.clone().normalize().multiplyScalar(3.1),'free');},
    dispose(){
      dead=true;if(frame)cancelAnimationFrame(frame);flight=undefined;
      observer.disconnect();preference.removeEventListener('change',motionChange);document.removeEventListener('visibilitychange',visibility);
      controls.removeEventListener('change',onChange);controls.removeEventListener('start',onStart);controls.removeEventListener('end',onEnd);controls.dispose();
      renderer.domElement.removeEventListener('keydown',keyDown);renderer.domElement.removeEventListener('pointerdown',pointerDown);
      renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointermove',pointerMove);
      renderer.domElement.removeEventListener('pointerleave',leave);renderer.domElement.removeEventListener('pointercancel',cancelPointer);renderer.domElement.removeEventListener('lostpointercapture',cancelPointer);renderer.domElement.removeEventListener('webglcontextlost',contextLost);
      scene.traverse(o=>{if(o instanceof THREE.Mesh || o instanceof THREE.LineSegments){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});
      texture.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    }
  };
}
