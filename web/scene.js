import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const R = 1737.4;
export const toWorld = (v) => new THREE.Vector3(v[0]/R,v[2]/R,-v[1]/R);
export function bodyRotation(rows) {
  const p=new THREE.Matrix4().set(1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1);
  const m=new THREE.Matrix4().set(rows[0][0],rows[0][1],rows[0][2],0,rows[1][0],rows[1][1],rows[1][2],0,rows[2][0],rows[2][1],rows[2][2],0,0,0,0,1);
  return p.clone().multiply(m).multiply(p.clone().invert());
}
export const surface = (lat,lon,r=1) => { const p=THREE.MathUtils.degToRad(lat),l=THREE.MathUtils.degToRad(lon); return new THREE.Vector3(Math.cos(p)*Math.cos(l)*r,Math.sin(p)*r,-Math.cos(p)*Math.sin(l)*r); };

export class Universe {
  constructor(container,onPick) {
    this.container=container;this.onPick=onPick;this.mode='moon';this.trueScale=true;this.markers=[];this.labels=[];this.extras=[];
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(38,1,.001,2e7);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,logarithmicDepthBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35;
    container.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.07;this.controls.minDistance=1.12;this.controls.maxDistance=300000;
    this.scene.add(new THREE.AmbientLight(0xa7bfd9,.065));
    this.light=new THREE.DirectionalLight(0xfff3db,2.8);this.scene.add(this.light);this.scene.add(this.light.target);
    this.moon=new THREE.Group();this.earth=new THREE.Group();this.scene.add(this.moon,this.earth);
    this.moonMesh=new THREE.Mesh(new THREE.SphereGeometry(1,128,64),new THREE.MeshStandardMaterial({color:0xbebbb6,roughness:1}));this.moon.add(this.moonMesh);
    const earthGeometry=new THREE.SphereGeometry(6378.137/R,128,64);earthGeometry.scale(1,6356.752314245/6378.137,1);
    this.earthMesh=new THREE.Mesh(earthGeometry,new THREE.MeshStandardMaterial({roughness:.86,metalness:.02}));this.earth.add(this.earthMesh);
    this.sun=new THREE.Mesh(new THREE.SphereGeometry(695700/R,64,32),new THREE.MeshBasicMaterial({color:0xffe7a5}));this.scene.add(this.sun);
    const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(6378.137/R*1.012,96,48),new THREE.ShaderMaterial({vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n; varying vec3 v; void main(){float a=pow(1.-abs(dot(normalize(n),normalize(v))),3.5);gl_FragColor=vec4(.18,.48,.8,a*.36);}',transparent:true,depthWrite:false,side:THREE.FrontSide}));this.earth.add(atmosphere);
    // Decorative stars are not a catalog or a navigation reference.
    const starPositions=[];let seed=23;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<2000;i++){const z=rand()*2-1,a=rand()*Math.PI*2,r=950000;starPositions.push(r*Math.sqrt(1-z*z)*Math.cos(a),r*z,r*Math.sqrt(1-z*z)*Math.sin(a));}
    const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));this.scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xadc0d4,size:1.2,sizeAttenuation:false,transparent:true,opacity:.48})));
    this.bodyLabels=[this.makeLabel(this.moon,'MOON','body'),this.makeLabel(this.earth,'EARTH','body'),this.makeLabel(this.sun,'SUN','body')];
    this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();let down;
    this.renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
    this.renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const b=container.getBoundingClientRect();this.pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);const hits=this.ray.intersectObjects([...this.markers,this.moonMesh,this.earthMesh],false);if(!hits.length)return;const hit=hits[0];if(hit.object.userData.pick)this.onPick(hit.object.userData.pick);else if(hit.object===this.moonMesh){const local=this.moon.worldToLocal(hit.point.clone()).normalize();this.onPick({type:'point',latitude:THREE.MathUtils.radToDeg(Math.asin(local.y)),longitude:THREE.MathUtils.radToDeg(Math.atan2(-local.z,local.x))});}});
    new ResizeObserver(()=>this.resize()).observe(container);this.resize();this.animate();
  }
  async load() {
    const loader=new THREE.TextureLoader();const [moonMap,earthMap,meta,buffer]=await Promise.all([loader.loadAsync('./assets/moon.jpg'),loader.loadAsync('./assets/earth.png'),fetch('./assets/terrain.json').then(r=>{if(!r.ok)throw new Error('Terrain assets missing; run setup');return r.json();}),fetch('./assets/moon-height.f32').then(r=>r.arrayBuffer())]);
    moonMap.colorSpace=earthMap.colorSpace=THREE.SRGBColorSpace;moonMap.anisotropy=earthMap.anisotropy=this.renderer.capabilities.getMaxAnisotropy();this.moonMesh.material.map=moonMap;this.moonMesh.material.color.set(0xffffff);this.moonMesh.material.needsUpdate=true;this.earthMesh.material.map=earthMap;this.earthMesh.material.needsUpdate=true;
    const heights=new Float32Array(buffer);if(heights.length!==meta.width*meta.height)throw new Error('Invalid terrain asset');
    const geo=new THREE.SphereGeometry(1,720,360);const pos=geo.attributes.position,uv=geo.attributes.uv;
    for(let i=0;i<pos.count;i++){const col=Math.floor(uv.getX(i)*meta.width)%meta.width;const row=Math.min(meta.height-1,Math.floor((1-uv.getY(i))*meta.height));const r=1+heights[row*meta.width+col]/R;const v=new THREE.Vector3().fromBufferAttribute(pos,i).normalize().multiplyScalar(r);pos.setXYZ(i,v.x,v.y,v.z);}
    geo.computeVertexNormals();this.moonMesh.geometry.dispose();this.moonMesh.geometry=geo;
  }
  resize(){const b=this.container.getBoundingClientRect();this.width=b.width;this.height=b.height;this.renderer.setSize(b.width,b.height);this.camera.aspect=b.width/b.height;this.camera.updateProjectionMatrix();}
  makeLabel(object,text,type){const node=document.createElement('span');node.className=`label3d ${type}`;node.textContent=text;document.querySelector('#labels').append(node);const label={object,node,type};this.labels.push(label);return label;}
  clearMarkers(){for(const marker of this.markers){marker.removeFromParent();marker.geometry.dispose();marker.material.dispose();}this.markers=[];this.labels=this.labels.filter(label=>{if(label.type==='body')return true;label.node.remove();return false;});}
  marker(parent,position,text,type,pick,color){const marker=new THREE.Mesh(new THREE.SphereGeometry(type==='station'?.055:.016,12,8),new THREE.MeshBasicMaterial({color}));marker.position.copy(position);marker.userData.pick=pick;parent.add(marker);this.markers.push(marker);this.makeLabel(marker,text,type);return marker;}
  update(state,catalog,extras=this.extras){this.state=state;this.catalog=catalog;this.extras=extras;const oldTarget=this.targetPosition?.clone();this.moon.quaternion.setFromRotationMatrix(bodyRotation(state.moon.fixedToJ2000));this.earth.quaternion.setFromRotationMatrix(bodyRotation(state.earth.fixedToJ2000));
    this.earth.position.copy(toWorld(state.earth.positionKm));this.sun.position.copy(toWorld(state.sun.positionKm));this.sun.scale.setScalar(1);
    if(!this.trueScale){this.earth.position.normalize().multiplyScalar(14);this.sun.position.normalize().multiplyScalar(this.mode==='solar'?60:200);this.sun.scale.setScalar(.015);}
    this.light.position.copy(toWorld(state.sun.positionKm).normalize().multiplyScalar(1000));this.light.target.position.set(0,0,0);
    this.clearMarkers();
    for(const site of catalog.sites){const result=state.sites.find(s=>s.id===site.id);const radius=result?.terrain.radiusKm/R||1.003;this.marker(this.moon,surface(site.latitude,site.longitude,radius+.006),site.name,'site',{type:'site',id:site.id},result?0xb1efe3:0x819297);}
    for(const station of state.stations)this.marker(this.earth,toWorld(station.fixedPositionKm).multiplyScalar(1.005),station.id,'station',{type:'station',id:station.id},0x8fc8ff);
    for(const candidate of extras)this.marker(this.moon,surface(candidate.latitude,candidate.longitude,candidate.terrain.radiusKm/R+.007),candidate.id==='picked'?'PICKED LOCATION':'CANDIDATE','candidate',{type:'candidate',data:candidate},0xe9c184);
    if(!this.initialized){this.initialized=true;this.focus('moon');}
    else if(this.mode==='earth'&&oldTarget){const delta=this.earth.position.clone().sub(oldTarget);this.camera.position.add(delta);this.controls.target.add(delta);this.targetPosition=this.earth.position.clone();}
    this.scene.updateMatrixWorld(true);
  }
  focus(mode,site){if(!this.state)return;this.mode=mode;let target=new THREE.Vector3(),distance=4.6,direction=surface(-35,25).applyQuaternion(this.moon.quaternion);this.camera.up.set(0,1,0);this.controls.minDistance=1.12;
    if(mode==='moon'){this.camera.up.copy(new THREE.Vector3(0,1,0).applyQuaternion(this.moon.quaternion));if(site){direction=surface(site.latitude,site.longitude).applyQuaternion(this.moon.quaternion);distance=2.6;}}
    if(mode==='earth'){target.copy(this.earth.position);distance=15;direction=surface(site?.latitude??18,site?.longitude??-40).applyQuaternion(this.earth.quaternion);this.camera.up.copy(new THREE.Vector3(0,1,0).applyQuaternion(this.earth.quaternion));this.controls.minDistance=3.8;}
    if(mode==='system'){target.copy(this.earth.position).multiplyScalar(.5);distance=Math.max(30,this.earth.position.length()*2.5);direction.copy(this.earth.position).normalize().cross(new THREE.Vector3(0,1,0)).add(new THREE.Vector3(0,.3,0)).normalize();}
    if(mode==='solar'){target.copy(this.sun.position).multiplyScalar(.5);distance=this.sun.position.length()*2.5;direction.copy(this.sun.position).normalize().cross(new THREE.Vector3(0,1,0)).add(new THREE.Vector3(0,.3,0)).normalize();}
    if(innerWidth<=800&&mode==='moon')distance=4.5;
    this.controls.target.copy(target);this.camera.position.copy(target).addScaledVector(direction,distance);this.targetPosition=target.clone();this.controls.update();}
  setScale(value){this.trueScale=value;if(this.state){this.update(this.state,this.catalog);this.focus(this.mode);}}
  animate(){requestAnimationFrame(()=>this.animate());this.controls.update();this.renderer.render(this.scene,this.camera);const show=document.querySelector('#show-labels')?.checked;
    for(const label of this.labels){const p=label.object.getWorldPosition(new THREE.Vector3());const projected=p.clone().project(this.camera);let visible=show&&projected.z<1&&projected.z>-1&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1;
      if(label.object===this.moon && this.mode==='moon')visible=false;
      if(label.type!=='body'){const center=label.object.parent===this.earth?this.earth.position:new THREE.Vector3();visible=visible&&p.clone().sub(center).dot(this.camera.position.clone().sub(p))>0;const distance=this.camera.position.distanceTo(p);label.object.scale.setScalar(THREE.MathUtils.clamp(distance/5,.3,5));if(this.mode==='solar')visible=false;}
      label.node.style.display=visible?'block':'none';label.node.style.left=`${(projected.x*.5+.5)*this.width}px`;label.node.style.top=`${(-projected.y*.5+.5)*this.height}px`;
    }
  }
}
