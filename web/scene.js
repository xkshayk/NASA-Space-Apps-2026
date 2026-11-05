// Three.js scene: bodies placed and rotated from SPICE state, persistent site/station
// markers, decluttered labels, eased camera moves and render-on-demand.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const R = 1737.4; // km per scene unit (LOLA reference radius)
const EARTH_RADIUS = 6378.137 / R;
const EARTH_FLATTENING = 6356.752314245 / 6378.137;
const SUN_RADIUS = 695700 / R;

/** SPICE J2000 kilometres -> renderer units (Moon radii), right-handed with Y up. */
export const toWorld = (v) => new THREE.Vector3(v[0] / R, v[2] / R, -v[1] / R);

/** Body-fixed -> J2000 rows conjugated into the renderer basis (not transposed). */
export function bodyRotation(rows) {
  const p = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
  const m = new THREE.Matrix4().set(
    rows[0][0], rows[0][1], rows[0][2], 0,
    rows[1][0], rows[1][1], rows[1][2], 0,
    rows[2][0], rows[2][1], rows[2][2], 0,
    0, 0, 0, 1);
  return p.clone().multiply(m).multiply(p.clone().invert());
}

/** Planetocentric, east-positive latitude/longitude in degrees -> body-fixed renderer vector. */
export const surface = (lat, lon, r = 1) => {
  const p = THREE.MathUtils.degToRad(lat), l = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(p) * Math.cos(l) * r, Math.sin(p) * r, -Math.cos(p) * Math.sin(l) * r);
};

const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = {
  site: 0x8a9aa4, siteSelected: 0x86e6d8, station: 0x93c8ff,
  candidate: 0xf1c27d, candidateFail: 0x9b8a76, rejected: 0x7c5f5a, picked: 0xffffff,
};
// Larger numbers win label space when labels collide.
const PRIORITY = { body: 9, distance: 8, picked: 7, siteSelected: 6, candidate: 5, station: 4, site: 3, candidateFail: 2, rejected: 1 };

function glowTexture() {
  const size = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'), gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,248,225,1)');
  gradient.addColorStop(.12, 'rgba(255,226,160,.85)');
  gradient.addColorStop(.35, 'rgba(255,190,110,.22)');
  gradient.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Universe {
  constructor(container, { onPick = () => {}, onHover = () => {} } = {}) {
    this.container = container;
    this.onPick = onPick;
    this.onHover = onHover;
    this.mode = 'moon';
    this.focusItem = null;
    this.trueScale = true;
    this.showLabels = true;
    this.free = null;
    this.dirty = true;
    this.tween = null;
    this.markers = new Map();
    this.selected = new Set();
    this.siteStatus = new Map();
    this.hovered = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, .001, 2e7);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'labels';
    this.labelLayer.setAttribute('aria-hidden', 'true');
    container.append(this.renderer.domElement, this.labelLayer);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .08;
    this.controls.rotateSpeed = .6;
    this.controls.zoomSpeed = .9;
    this.controls.minDistance = 1.12;
    this.controls.maxDistance = 400000;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    // A drag or scroll interrupts a camera transition (capture runs before OrbitControls' own listeners).
    const interrupt = () => { if (this.tween) { this.tween = null; this.controls.enabled = true; } };
    container.addEventListener('pointerdown', interrupt, { capture: true });
    container.addEventListener('wheel', interrupt, { capture: true, passive: true });

    // Faint bluish fill stands in for earthshine on the night side.
    this.scene.add(new THREE.AmbientLight(0x9fb6d6, .07));
    this.light = new THREE.DirectionalLight(0xfff4e0, 2.7);
    this.scene.add(this.light, this.light.target);

    this.moon = new THREE.Group();
    this.earth = new THREE.Group();
    this.scene.add(this.moon, this.earth);
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ color: 0x8f8c87, roughness: 1, metalness: 0 }));
    this.moon.add(this.moonMesh);
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 64);
    earthGeometry.scale(1, EARTH_FLATTENING, 1);
    this.earthMesh = new THREE.Mesh(earthGeometry, new THREE.MeshStandardMaterial({ color: 0x3b6a9c, roughness: .85, metalness: 0 }));
    this.earth.add(this.earthMesh);
    this.atmosphere = this.makeAtmosphere();
    this.earth.add(this.atmosphere);

    this.sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 64, 32), new THREE.MeshBasicMaterial({ color: 0xfff1cf, toneMapped: false }));
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.sunGlow.scale.setScalar(SUN_RADIUS * 9);
    this.sun.add(this.sunGlow);
    this.scene.add(this.sun);
    this.addStars();

    this.distanceLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0x7fa6b8, dashSize: 4, gapSize: 3, transparent: true, opacity: .55 }));
    this.distanceLine.visible = false;
    this.scene.add(this.distanceLine);

    this.markerGeometry = new THREE.SphereGeometry(1, 16, 12);
    this.bodyLabels = [
      this.addLabel({ key: 'body:moon', kind: 'body', text: 'Moon', anchor: () => this.moon.position, radius: () => 1 }),
      this.addLabel({ key: 'body:earth', kind: 'body', text: 'Earth', anchor: () => this.earth.position, radius: () => EARTH_RADIUS }),
      this.addLabel({ key: 'body:sun', kind: 'body', text: 'Sun', anchor: () => this.sun.position, radius: () => SUN_RADIUS * this.sun.scale.x }),
    ];
    this.distanceLabel = this.addLabel({ key: 'distance', kind: 'distance', text: '', anchor: () => this.earth.position.clone().multiplyScalar(.5) });

    this.raycaster = new THREE.Raycaster();
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  makeAtmosphere() {
    const material = new THREE.ShaderMaterial({
      uniforms: { sunDirection: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 sunDirection;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vNormal);
          float rim = pow(1.0 - abs(dot(n, normalize(vView))), 3.0);
          float day = smoothstep(-0.3, 0.4, dot(n, sunDirection));
          gl_FragColor = vec4(0.36, 0.64, 1.0, rim * (0.12 + 0.88 * day) * 0.6);
        }`,
      transparent: true,
      depthWrite: false,
    });
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.015, 96, 48);
    geometry.scale(1, EARTH_FLATTENING, 1);
    return new THREE.Mesh(geometry, material);
  }

  addStars() {
    // Decorative, seeded random stars: not a catalog or a navigation reference.
    let seed = 23;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (const [count, size, opacity] of [[2200, 1.1, .45], [260, 2, .7]]) {
      const positions = [];
      for (let i = 0; i < count; i++) {
        const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = 9e5, s = Math.sqrt(1 - z * z);
        positions.push(r * s * Math.cos(a), r * z, r * s * Math.sin(a));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xb8c8da, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false })));
    }
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const texture = (file) => loader.loadAsync(`./assets/${file}`).catch(() => {
      throw new Error(`assets/${file} is missing; run science/prepare_assets.py (or scripts/setup.ps1)`);
    });
    const [moonMap, normalMap, southNormal, earthMap, meta, buffer] = await Promise.all([
      texture('moon.jpg'),
      texture('moon-normal.jpg'),
      texture('moon-south-normal.jpg'),
      texture('earth.png'),
      fetch('./assets/terrain.json').then((r) => { if (!r.ok) throw new Error('Terrain assets are missing; run setup'); return r.json(); }),
      fetch('./assets/moon-height.f32').then((r) => { if (!r.ok) throw new Error('Terrain heights are missing; run setup'); return r.arrayBuffer(); }),
    ]);
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    moonMap.colorSpace = earthMap.colorSpace = THREE.SRGBColorSpace;
    normalMap.colorSpace = southNormal.colorSpace = THREE.NoColorSpace;
    moonMap.anisotropy = normalMap.anisotropy = southNormal.anisotropy = earthMap.anisotropy = anisotropy;
    Object.assign(this.moonMesh.material, { map: moonMap, normalMap, color: new THREE.Color(0xffffff) });
    if (meta.southCap) this.installPolarShading(southNormal, meta.southCap);
    this.moonMesh.material.needsUpdate = true;
    Object.assign(this.earthMesh.material, { map: earthMap, color: new THREE.Color(0xffffff) });
    this.earthMesh.material.needsUpdate = true;

    const heights = new Float32Array(buffer);
    if (heights.length !== meta.width * meta.height) throw new Error('Invalid terrain asset; rerun setup');
    this.terrain = { heights, width: meta.width, height: meta.height };
    this.moonMesh.geometry.dispose();
    this.moonMesh.geometry = this.buildMoonGeometry();
    for (const marker of this.markers.values()) if (marker.parent === this.moon) this.placeOnMoon(marker);
    this.dirty = true;
  }

  /**
   * Equirectangular maps pinch at the poles, where the CLPS south-pole sites are.
   * South of ~75° S, shading switches to normals from the 240 m polar LOLA DEM on a
   * polar-stereographic grid; colour fades to the mean polar albedo near both poles.
   */
  installPolarShading(texture, cap) {
    const edge = -cap.edgeLatitudeDeg;
    const uniforms = {
      southNormal: { value: texture },
      capRho: { value: cap.rhoMaxRadii },
      capStart: { value: THREE.MathUtils.degToRad(edge + .5) },
      capFull: { value: THREE.MathUtils.degToRad(edge + 2) },
      polarAlbedo: { value: new THREE.Vector3(...cap.albedoLinear) },
      bodyToView: { value: new THREE.Matrix3() },
    };
    const material = this.moonMesh.material;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBodyPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBodyPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vBodyPos;
uniform sampler2D southNormal;
uniform float capRho, capStart, capFull;
uniform vec3 polarAlbedo;
uniform mat3 bodyToView;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
{
  float polarLat = asin(clamp(normalize(vBodyPos).y, -1.0, 1.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, polarAlbedo, smoothstep(radians(84.0), radians(88.5), abs(polarLat)));
}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 bp = normalize(vBodyPos);
  float lat = asin(clamp(bp.y, -1.0, 1.0));
  float lon = atan(-bp.z, bp.x);
  normal = normalize(mix(normal, nonPerturbedNormal, smoothstep(radians(84.0), radians(88.0), lat)));
  float capWeight = smoothstep(capStart, capFull, -lat);
  if (capWeight > 0.0) {
    float rho = 2.0 * tan((1.5707963267948966 + lat) * 0.5);
    vec3 m = texture2D(southNormal, vec2(sin(lon), cos(lon)) * (rho / capRho * 0.5) + 0.5).xyz * 2.0 - 1.0;
    vec3 east = vec3(-sin(lon), 0.0, -cos(lon));
    vec3 north = vec3(-sin(lat) * cos(lon), cos(lat), sin(lat) * sin(lon));
    vec3 capNormal = normalize(bodyToView * (m.x * east + m.y * north + m.z * bp));
    normal = normalize(mix(normal, capNormal, capWeight));
  }
}`);
    };
    material.customProgramCacheKey = () => 'lunar-horizon-polar-v1';
    const modelView = new THREE.Matrix4();
    this.moonMesh.onBeforeRender = (renderer, scene, camera) => {
      uniforms.bodyToView.value.setFromMatrix4(modelView.multiplyMatrices(camera.matrixWorldInverse, this.moonMesh.matrixWorld));
    };
  }

  /** LOLA cell means interpolated at each vertex; shared seam/pole vertices get one normal. */
  buildMoonGeometry() {
    const columns = 720, rows = 360;
    const geometry = new THREE.SphereGeometry(1, columns, rows);
    const position = geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).normalize();
      const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)));
      const lon = THREE.MathUtils.radToDeg(Math.atan2(-v.z, v.x));
      v.multiplyScalar(1 + this.heightKm(lat, lon) / R);
      position.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    const normal = geometry.attributes.normal, a = new THREE.Vector3(), b = new THREE.Vector3(), stride = columns + 1;
    for (let row = 0; row <= rows; row++) {
      const first = row * stride, last = first + columns;
      a.fromBufferAttribute(normal, first).add(b.fromBufferAttribute(normal, last)).normalize();
      normal.setXYZ(first, a.x, a.y, a.z);
      normal.setXYZ(last, a.x, a.y, a.z);
    }
    for (const row of [0, rows]) {
      a.set(0, 0, 0);
      for (let c = 0; c <= columns; c++) a.add(b.fromBufferAttribute(normal, row * stride + c));
      a.normalize();
      for (let c = 0; c <= columns; c++) normal.setXYZ(row * stride + c, a.x, a.y, a.z);
    }
    normal.needsUpdate = true;
    return geometry;
  }

  /** Bilinear LOLA height (km above 1737.4 km) between 0.5 degree cell centres. */
  heightKm(lat, lon) {
    if (!this.terrain) return 0;
    const { heights, width: W, height: H } = this.terrain;
    const x = (lon + 180) / 360 * W - .5, y = (90 - lat) / 180 * H - .5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const r0 = THREE.MathUtils.clamp(y0, 0, H - 1) * W, r1 = THREE.MathUtils.clamp(y0 + 1, 0, H - 1) * W;
    const c0 = ((x0 % W) + W) % W, c1 = (c0 + 1) % W;
    return (1 - fy) * ((1 - fx) * heights[r0 + c0] + fx * heights[r0 + c1]) + fy * ((1 - fx) * heights[r1 + c0] + fx * heights[r1 + c1]);
  }

  // ---------- markers and labels ----------
  addLabel({ key, kind, text, anchor, radius }) {
    const node = document.createElement('div');
    node.className = `label3d k-${kind}`;
    const name = document.createElement('span');
    name.className = 'label-name';
    name.textContent = text;
    node.append(name);
    this.labelLayer.append(node);
    const label = { key, kind, node, name, anchor, radius, size: null, visible: false };
    if (kind !== 'body' && kind !== 'distance') {
      node.addEventListener('click', (event) => { event.stopPropagation(); this.pick(this.markers.get(key)); });
      node.addEventListener('pointerenter', () => this.setHover(this.markers.get(key)));
      node.addEventListener('pointerleave', () => this.setHover(null));
    }
    return label;
  }

  addMarker({ key, kind, parent, item, text }) {
    const mesh = new THREE.Mesh(this.markerGeometry, new THREE.MeshBasicMaterial({ color: COLORS[kind] }));
    parent.add(mesh);
    const marker = { key, kind, parent, item, mesh };
    marker.label = this.addLabel({ key, kind, text, anchor: () => mesh.getWorldPosition(new THREE.Vector3()) });
    this.markers.set(key, marker);
    if (parent === this.moon) this.placeOnMoon(marker);
    this.dirty = true;
    return marker;
  }

  placeOnMoon(marker) {
    const { latitude, longitude } = marker.item;
    marker.mesh.position.copy(surface(latitude, longitude, 1 + (this.heightKm(latitude, longitude) + 1.5) / R));
  }

  removeMarker(key) {
    const marker = this.markers.get(key);
    if (!marker) return;
    marker.mesh.removeFromParent();
    marker.mesh.material.dispose();
    marker.label.node.remove();
    this.markers.delete(key);
    this.dirty = true;
  }

  setKind(marker, kind) {
    if (marker.kind === kind) return;
    marker.kind = marker.label.kind = kind;
    marker.mesh.material.color.setHex(COLORS[kind]);
    marker.label.node.className = `label3d k-${kind}`;
    marker.label.size = null;
  }

  setLabelText(label, text) {
    if (label.name.textContent === text) return;
    label.name.textContent = text;
    label.size = null;
  }

  /** Create site markers once from the curated catalog. */
  setCatalog(catalog) {
    for (const site of catalog.sites) {
      if (!this.markers.has(`site:${site.id}`)) this.addMarker({ key: `site:${site.id}`, kind: 'site', parent: this.moon, item: site, text: site.name });
    }
  }

  setSelection(ids) {
    this.selected = new Set(ids);
    for (const marker of this.markers.values()) {
      if (marker.key.startsWith('site:')) this.setKind(marker, this.selected.has(marker.item.id) ? 'siteSelected' : 'site');
    }
    this.refreshStatusDots();
    this.dirty = true;
  }

  /** Candidates and picked locations; markers are reused when keys persist. */
  setExtras(items = []) {
    const keep = new Set(items.map((item) => item.key));
    for (const key of [...this.markers.keys()]) if (key.startsWith('extra:') && !keep.has(key)) this.removeMarker(key);
    for (const item of items) {
      const kind = item.kind === 'picked' || item.kind === 'rejected' ? item.kind : item.passes ? 'candidate' : 'candidateFail';
      let marker = this.markers.get(item.key);
      if (!marker) marker = this.addMarker({ key: item.key, kind, parent: this.moon, item, text: item.label });
      marker.item = item;
      this.setKind(marker, kind);
      this.setLabelText(marker.label, item.label);
      this.placeOnMoon(marker);
    }
    this.dirty = true;
  }

  refreshStatusDots() {
    for (const marker of this.markers.values()) {
      if (!marker.key.startsWith('site:')) continue;
      const status = this.selected.has(marker.item.id) ? this.siteStatus.get(marker.item.id) : null;
      let dots = marker.label.node.querySelector('.label-dots');
      if (!status) {
        if (dots) { dots.remove(); marker.label.size = null; }
        continue;
      }
      if (!dots) {
        dots = document.createElement('span');
        dots.className = 'label-dots';
        dots.innerHTML = '<i class="dot-sun"></i><i class="dot-link"></i>';
        marker.label.node.prepend(dots);
        marker.label.size = null;
      }
      dots.children[0].classList.toggle('on', status.sun);
      dots.children[1].classList.toggle('on', status.link);
    }
  }

  // ---------- state ----------
  update(state) {
    this.state = state;
    const previousEarth = this.earth.position.clone();
    this.moon.quaternion.setFromRotationMatrix(bodyRotation(state.moon.fixedToJ2000));
    this.earth.quaternion.setFromRotationMatrix(bodyRotation(state.earth.fixedToJ2000));
    this.placeBodies();
    const sunDirection = toWorld(state.sun.positionKm).normalize();
    this.light.position.copy(sunDirection).multiplyScalar(1000);
    this.light.target.position.set(0, 0, 0);

    for (const station of state.stations) {
      const key = `station:${station.id}`;
      if (!this.markers.has(key)) this.addMarker({ key, kind: 'station', parent: this.earth, item: station, text: station.id });
      const marker = this.markers.get(key);
      marker.item = station;
      marker.mesh.position.copy(toWorld(station.fixedPositionKm)).multiplyScalar(1.004);
    }
    this.siteStatus = new Map(state.sites.map((s) => [s.id, { sun: s.sunVisible, link: s.anyStationVisible }]));
    this.refreshStatusDots();
    const km = Math.round(state.earthDistanceKm).toLocaleString('en-US');
    this.setLabelText(this.distanceLabel, `${km} km · ${(state.earthDistanceKm / 299792.458).toFixed(2)} light-seconds`);

    if (!this.initialized) {
      this.initialized = true;
      this.focus('moon', null, { instant: true });
    } else if (this.mode === 'earth') {
      // Follow Earth's orbital motion so its rotation under the Moon stays visible.
      const delta = this.earth.position.clone().sub(previousEarth);
      this.camera.position.add(delta);
      this.controls.target.add(delta);
      if (this.tween) { this.tween.from.target.add(delta); this.tween.to.target.add(delta); }
    }
    this.scene.updateMatrixWorld(true);
    this.dirty = true;
  }

  placeBodies() {
    if (!this.state) return;
    this.earth.position.copy(toWorld(this.state.earth.positionKm));
    this.sun.position.copy(toWorld(this.state.sun.positionKm));
    this.sun.scale.setScalar(1);
    if (!this.trueScale) {
      // Illustrative scale compresses distances only; lighting keeps the true Sun direction.
      this.earth.position.normalize().multiplyScalar(14);
      this.sun.position.normalize().multiplyScalar(this.mode === 'solar' ? 60 : 200);
      this.sun.scale.setScalar(.015);
    }
    this.distanceLine.geometry.setFromPoints([new THREE.Vector3(), this.earth.position]);
    this.distanceLine.computeLineDistances();
    const dash = this.earth.position.length() / 60;
    Object.assign(this.distanceLine.material, { dashSize: dash, gapSize: dash * .7 });
  }

  setTrueScale(value) {
    this.trueScale = value;
    this.placeBodies();
    this.focus(this.mode, this.focusItem);
  }

  setLabelsVisible(value) {
    this.showLabels = value;
    this.dirty = true;
  }

  // ---------- camera ----------
  /** Free screen area (px, relative to the container) not covered by panels. */
  setFreeArea(rect) {
    this.free = rect;
    this.applyViewOffset();
  }

  applyViewOffset() {
    const { width: W, height: H } = this;
    if (!W || !H) return;
    const f = this.free;
    if (f && f.right - f.left > 80 && f.bottom - f.top > 80) {
      this.camera.setViewOffset(W, H, W / 2 - (f.left + f.right) / 2, H / 2 - (f.top + f.bottom) / 2, W, H);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  freeSize() {
    const f = this.free;
    return f && f.right - f.left > 80 ? { w: f.right - f.left, h: f.bottom - f.top } : { w: this.width, h: this.height };
  }

  /** Distance at which a sphere of `radius` fills `fill` of the smaller free dimension. */
  fitDistance(radius, fill = .8) {
    const { w, h } = this.freeSize();
    const k = (fill * Math.min(w, h) / 2) / (this.height / 2) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return radius / Math.sin(Math.atan(k));
  }

  /** Distance at which a segment of `span` units spans `fill` of the free width (or height). */
  fitSpan(span, fill = .7) {
    const { w, h } = this.freeSize();
    const pixels = fill * Math.min(w, h * 1.6);
    return span * (this.height / pixels) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }

  focus(mode, item = null, { instant = false } = {}) {
    if (!this.state) return;
    const modeChanged = mode !== this.mode;
    this.mode = mode;
    this.focusItem = item;
    if (modeChanged) this.placeBodies();
    const north = new THREE.Vector3(0, 1, 0);
    let target = new THREE.Vector3(), direction, distance, up = north.clone();
    if (mode === 'moon') {
      up.applyQuaternion(this.moon.quaternion);
      // Default view leans south so the CLPS polar sites and the near side share the frame.
      direction = surface(item ? item.latitude : -48, item ? item.longitude : 18).applyQuaternion(this.moon.quaternion);
      // Sites open ~0.8 Moon radii above the surface; candidate grids pass a closer altitude.
      distance = item ? 1 + (item.altitude ?? .8) : this.fitDistance(1, .86);
      this.controls.minDistance = 1.04;
    } else if (mode === 'earth') {
      target.copy(this.earth.position);
      up.applyQuaternion(this.earth.quaternion);
      // Look from the Moon's side: the antennas that can see the Moon face the camera.
      direction = item ? surface(item.latitude, item.longitude).applyQuaternion(this.earth.quaternion) : this.earth.position.clone().negate().normalize();
      distance = item ? this.fitDistance(EARTH_RADIUS, .8) * .55 : this.fitDistance(EARTH_RADIUS, .82);
      this.controls.minDistance = EARTH_RADIUS * 1.05;
    } else {
      const far = mode === 'solar' ? this.sun.position : this.earth.position;
      target.copy(far).multiplyScalar(.5);
      direction = far.clone().normalize().cross(north).add(new THREE.Vector3(0, .32, 0)).normalize();
      distance = this.fitSpan(far.length(), mode === 'solar' ? .62 : .66);
      this.controls.minDistance = 1.03;
    }
    const to = { target, direction: direction.normalize(), distance, up };
    const offset = this.camera.position.clone().sub(this.controls.target);
    const from = { target: this.controls.target.clone(), direction: offset.clone().normalize(), distance: offset.length() || distance, up: this.camera.up.clone() };
    if (instant || reducedMotion() || !this.initializedCamera) {
      this.initializedCamera = true;
      this.tween = null;
      this.applyCamera(to);
    } else {
      this.tween = { from, to, start: performance.now(), duration: modeChanged ? 1300 : 950 };
      // Drop leftover orbit momentum so the view does not drift after the transition.
      this.controls._sphericalDelta?.set(0, 0, 0);
      this.controls._panOffset?.set(0, 0, 0);
      if ('_scale' in this.controls) this.controls._scale = 1;
      this.controls.enabled = false;
    }
    this.dirty = true;
  }

  recenter() {
    this.focus(this.mode, this.focusItem);
  }

  applyCamera({ target, direction, distance, up }) {
    this.controls.target.copy(target);
    this.camera.up.copy(up);
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.camera.lookAt(target);
    // OrbitControls caches its "up" rotation at construction; keep orbiting about the body's pole.
    if (this.controls._quat) {
      this.controls._quat.setFromUnitVectors(this.camera.up, new THREE.Vector3(0, 1, 0));
      this.controls._quatInverse.copy(this.controls._quat).invert();
    }
  }

  stepTween(now) {
    const { from, to, start, duration } = this.tween;
    const t = Math.min(1, (now - start) / duration), k = ease(t);
    const turn = new THREE.Quaternion().setFromUnitVectors(from.direction, to.direction);
    const direction = from.direction.clone().applyQuaternion(new THREE.Quaternion().slerp(turn, k));
    const upTurn = new THREE.Quaternion().setFromUnitVectors(from.up.clone().normalize(), to.up.clone().normalize());
    this.applyCamera({
      target: from.target.clone().lerp(to.target, k),
      direction,
      distance: Math.exp(THREE.MathUtils.lerp(Math.log(from.distance), Math.log(to.distance), k)),
      up: from.up.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(upTurn, k)),
    });
    if (t >= 1) { this.tween = null; this.controls.enabled = true; }
  }

  // ---------- picking ----------
  bindPointer() {
    const canvas = this.renderer.domElement;
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      down = null;
      const marker = this.markerAt(e.clientX, e.clientY);
      if (marker) return this.pick(marker);
      const box = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2((e.clientX - box.left) / box.width * 2 - 1, -(e.clientY - box.top) / box.height * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObject(this.moonMesh, false)[0];
      if (!hit || this.mode === 'solar') return;
      const local = this.moon.worldToLocal(hit.point.clone()).normalize();
      this.onPick({ type: 'point', latitude: THREE.MathUtils.radToDeg(Math.asin(local.y)), longitude: THREE.MathUtils.radToDeg(Math.atan2(-local.z, local.x)) });
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      this.setHover(this.markerAt(e.clientX, e.clientY));
    });
    canvas.addEventListener('pointerleave', () => this.setHover(null));
  }

  /** Nearest visible marker within 14 px of a screen point. */
  markerAt(x, y) {
    const box = this.renderer.domElement.getBoundingClientRect();
    let best = null, bestDistance = 14;
    for (const marker of this.markers.values()) {
      if (!marker.screen || marker.kind === 'rejected') continue;
      const d = Math.hypot(x - box.left - marker.screen.x, y - box.top - marker.screen.y);
      if (d < bestDistance) { best = marker; bestDistance = d; }
    }
    return best;
  }

  pick(marker) {
    if (!marker || marker.kind === 'rejected') return;  // Terrain-rejected grid points have no detail card.
    const [type] = marker.key.split(':');
    if (type === 'site') this.onPick({ type: 'site', id: marker.item.id });
    else if (type === 'station') this.onPick({ type: 'station', id: marker.item.id });
    else this.onPick({ type: marker.item.kind === 'picked' ? 'picked' : 'candidate', key: marker.key, item: marker.item });
  }

  setHover(marker) {
    if (this.hovered === marker) return;
    this.hovered?.label.node.classList.remove('hover');
    this.hovered = marker;
    marker?.label.node.classList.add('hover');
    this.renderer.domElement.style.cursor = marker ? 'pointer' : '';
    this.onHover(marker ? marker.key : null);
    this.dirty = true;
  }

  // ---------- frame loop ----------
  resize() {
    const box = this.container.getBoundingClientRect();
    this.width = box.width;
    this.height = box.height;
    if (!this.width || !this.height) return;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.applyViewOffset();
  }

  frame() {
    const now = performance.now();
    if (this.tween) { this.stepTween(now); this.dirty = true; }
    const moved = this.controls.enabled && this.controls.update();
    if (!this.dirty && !moved) return;
    this.dirty = false;
    const sunView = this.light.position.clone().normalize().transformDirection(this.camera.matrixWorldInverse);
    this.atmosphere.material.uniforms.sunDirection.value.copy(sunView);
    this.distanceLine.visible = this.mode === 'system';
    this.scaleMarkers();
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels();
  }

  worldPerPixel(point) {
    return 2 * this.camera.position.distanceTo(point) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / this.height;
  }

  scaleMarkers() {
    const p = new THREE.Vector3();
    for (const marker of this.markers.values()) {
      marker.mesh.getWorldPosition(p);
      const onEarth = marker.parent === this.earth;
      const pixels = marker.kind === 'siteSelected' || marker.kind === 'picked' ? 5.5 : marker.kind === 'station' ? 5 : marker.kind === 'rejected' ? 3 : 4.2;
      const cap = onEarth ? EARTH_RADIUS * .035 : .05;
      marker.mesh.scale.setScalar(Math.min(pixels * this.worldPerPixel(p), cap));
    }
  }

  /** Project labels, hide those on a body's far side, and place them without overlap. */
  layoutLabels() {
    const candidates = [];
    const p = new THREE.Vector3(), projected = new THREE.Vector3();
    const moonPixels = 1 / this.worldPerPixel(this.moon.position);
    const earthPixels = EARTH_RADIUS / this.worldPerPixel(this.earth.position);
    const consider = (label, marker) => {
      label.visible = false;
      if (marker) marker.screen = null;
      p.copy(label.anchor());
      projected.copy(p).project(this.camera);
      if (projected.z > 1 || projected.z < -1 || Math.abs(projected.x) > 1.05 || Math.abs(projected.y) > 1.05) return;
      const x = (projected.x * .5 + .5) * this.width, y = (-projected.y * .5 + .5) * this.height;
      if (!marker && !this.showLabels) return;
      if (label.kind === 'body') {
        const body = label.key.slice(5), pixels = body === 'moon' ? moonPixels : body === 'earth' ? earthPixels : label.radius() / this.worldPerPixel(p);
        // Body names only help when the body is small on screen.
        if ((body === 'moon' && this.mode === 'moon') || (body === 'earth' && this.mode === 'earth') || pixels > 120) return;
        candidates.push({ label, x: x + Math.max(pixels, 3) * .75 + 6, y, priority: PRIORITY.body });
        return;
      }
      if (label.kind === 'distance') {
        if (this.mode !== 'system') return;
        candidates.push({ label, x, y: y + 14, priority: PRIORITY.distance, centered: true });
        return;
      }
      if (!marker) return;
      const center = marker.parent === this.earth ? this.earth.position : this.moon.position;
      const facing = p.clone().sub(center).dot(this.camera.position.clone().sub(p)) > 0;
      const bodyPixels = marker.parent === this.earth ? earthPixels : moonPixels;
      if (!facing || bodyPixels < 45 || this.mode === 'solar') return;
      marker.screen = { x, y };  // Markers stay clickable even with labels hidden.
      if ((!this.showLabels && marker !== this.hovered) || !label.name.textContent) return;
      candidates.push({ label, x: x + 9, y, priority: PRIORITY[marker.kind] ?? 1 });
    };
    for (const label of [...this.bodyLabels, this.distanceLabel]) consider(label, null);
    for (const marker of this.markers.values()) consider(marker.label, marker);

    candidates.sort((a, b) => b.priority - a.priority);
    const placed = [];
    const overlaps = (r) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    for (const c of candidates) {
      const { label } = c;
      if (!label.size) {
        label.node.style.display = 'flex';
        label.size = { w: label.node.offsetWidth, h: label.node.offsetHeight };
      }
      const { w, h } = label.size;
      const left = c.centered ? c.x - w / 2 : c.x;
      let rect = null;
      for (const dy of [0, h + 3, -(h + 3), 2 * (h + 3), -2 * (h + 3)]) {
        const r = { x: left, y: c.y - h / 2 + dy, w, h };
        if (!overlaps(r)) { rect = r; break; }
      }
      const marker = this.markers.get(label.key);
      if (!rect && (c.priority >= PRIORITY.siteSelected || marker === this.hovered)) rect = { x: left, y: c.y - h / 2, w, h };
      if (!rect) continue;
      placed.push(rect);
      label.visible = true;
      label.node.classList.toggle('shifted', Math.abs(rect.y - (c.y - h / 2)) > 1);
      label.node.style.transform = `translate(${Math.round(rect.x)}px, ${Math.round(rect.y)}px)`;
    }
    for (const label of [...this.bodyLabels, this.distanceLabel, ...[...this.markers.values()].map((m) => m.label)]) {
      label.node.style.display = label.visible ? 'flex' : 'none';
    }
  }
}
