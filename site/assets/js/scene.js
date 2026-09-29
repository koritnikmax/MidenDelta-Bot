// The scroll-driven 3D story, lit like a product photograph: a softbox studio environment,
// AgX tone mapping, real shadows and monochrome materials. Everything is a function of story time
// `t` (0 → 12), except a few small idle motions.
//
//  0.0 – 0.7  hero: the glass piggy bank (your Hyperliquid account); on load one USDC coin drops
//             through the slot and the bank squashes and springs back (clock-driven, not scroll)
//  0.7 – 1.6  dive: the camera enters the piggy bank; the balance scale is inside
//  2.2 – 3.9  spot ETH tips the scale, the equal short perp levels it (delta 0)
//  4.3 – 5.1  ETH price swings, both legs move equally, the beam stays level
//  5.3 – 6.05 funding payments flow from the short leg into a growing stack
//  6.25 – 6.75 automation: ETH rises, the hedge drifts and the beam tips; the bot adds to the short and it levels
//  7.1 – 7.7  the scale steps back; the specifications chart (a DOM canvas) takes over
import * as THREE from "three";

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const bounce = (x) => {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};

const BASE_PRICE = 2500;
const SPOT_ETH = (10_000 * 0.75) / BASE_PRICE; // ETH bought for $10k at 3x: 1 / (1 + 1/3)

// ---------------------------------------------------------------- camera keyframes
const KF = [
  { t: 0.0, pos: [0.3, 1.2, 12], look: [0, 0.85, 0], sx: 0.32, sy: -0.02, msy: -0.3 },
  { t: 0.55, pos: [0.3, 1.2, 12], look: [0, 0.85, 0], sx: 0.32, sy: -0.02, msy: -0.3 },
  { t: 1.6, pos: [0, 0.7, 9.8], look: [0, 0.05, 0], sx: 0.26, sy: -0.02, msy: 0.3 },
  { t: 3.9, pos: [1.0, 0.9, 10.0], look: [0, 0.05, 0], sx: 0.26, sy: -0.02, msy: 0.3 },
  { t: 5.0, pos: [1.1, 0.7, 9.8], look: [0, -0.1, 0], sx: 0.26, sy: -0.02, msy: 0.3 },
  { t: 6.0, pos: [0.4, 0.5, 9.6], look: [0, -0.15, 0], sx: 0.26, sy: -0.02, msy: 0.3 },
  { t: 7.05, pos: [0.2, 0.7, 9.9], look: [0, 0.05, 0], sx: 0.26, sy: -0.02, msy: 0.3 },
  { t: 7.8, pos: [0, 0.6, 13], look: [0, 0.1, 0], sx: 0, sy: 0, msy: 0 },
  { t: 12, pos: [0, 0.6, 13], look: [0, 0.1, 0], sx: 0, sy: 0, msy: 0 },
];

function sampleKF(t, mobile) {
  let i = 0;
  while (i < KF.length - 2 && t > KF[i + 1].t) i++;
  const a = KF[i], b = KF[i + 1];
  const k = easeInOut(seg(t, a.t, b.t));
  const v = (p, q) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k), lerp(p[2], q[2], k)];
  return {
    pos: v(a.pos, b.pos),
    look: v(a.look, b.look),
    sx: mobile ? 0 : lerp(a.sx, b.sx, k),
    sy: mobile ? lerp(a.msy, b.msy, k) : lerp(a.sy, b.sy, k),
  };
}

// ---------------------------------------------------------------- studio lighting
// A dark room with strip softboxes: gives chrome and glass the long, clean reflections of a product shoot.
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, side: THREE.BackSide })));
  const box = (w, h, power, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  box(12, 2.2, 7, [0, 9, 1]);      // overhead strip
  box(2.4, 10, 5, [-10, 2, 5]);    // tall left strip
  box(2.4, 10, 3, [10, 1, -2]);    // tall right strip, weaker
  box(8, 3, 1.4, [0, 0.5, 12]);    // soft front fill
  box(24, 0.35, 5, [0, 2.5, -14]); // hairline rim behind
  box(26, 26, 0.35, [0, 9.8, 0]);  // faint ceiling bounce so metals never go fully black
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.015).texture;
  pm.dispose();
  return tex;
}

// ---------------------------------------------------------------- canvas textures
function canvasTex(draw, { srgb = true, w = 512, h = w } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function spun(g, c, n, dark = 0.07, light = 0.06) {
  for (let i = 0; i < n; i++) {
    g.strokeStyle = Math.random() < 0.5 ? `rgba(255,255,255,${Math.random() * light})` : `rgba(0,0,0,${Math.random() * dark})`;
    g.lineWidth = Math.random() * 1.3;
    g.beginPath(); g.arc(0, 0, Math.random() * c * 0.99, 0, Math.PI * 2); g.stroke();
  }
}

// USDC emblem (the two arcs and the dollar), used as colour and as a stamped relief.
function usdcEmblem(g, s, color) {
  const c = s / 2;
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = s * 0.055;
  g.beginPath(); g.arc(c, c, s * 0.33, Math.PI * 0.64, Math.PI * 1.36); g.stroke();
  g.beginPath(); g.arc(c, c, s * 0.33, -Math.PI * 0.36, Math.PI * 0.36); g.stroke();
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `600 ${s * 0.34}px Geist, Arial, sans-serif`;
  g.fillText("$", c, c + s * 0.012);
  g.lineWidth = s * 0.012;
  g.beginPath(); g.arc(c, c, s * 0.47, 0, Math.PI * 2); g.stroke();
}
const usdcFaceTexture = () => canvasTex((g, s) => {
  const c = s / 2;
  g.save(); g.translate(c, c);
  const base = g.createRadialGradient(-c * 0.3, -c * 0.35, 10, 0, 0, c);
  base.addColorStop(0, "#f2f2f2"); base.addColorStop(0.6, "#bdbdbd"); base.addColorStop(1, "#8a8a8a");
  g.fillStyle = base; g.beginPath(); g.arc(0, 0, c, 0, Math.PI * 2); g.fill();
  spun(g, c, 700);
  g.restore();
  usdcEmblem(g, s, "rgba(40,40,40,.85)");
});
const usdcBumpTexture = () => canvasTex((g, s) => { g.fillStyle = "#000"; g.fillRect(0, 0, s, s); usdcEmblem(g, s, "#fff"); }, { srgb: false });

// Tangential anisotropy directions: gives the coin faces the radial light streak of spun metal.
const spunAnisotropyTexture = () => {
  const s = 256, data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const a = Math.atan2(y - s / 2 + 0.5, x - s / 2 + 0.5), i = (y * s + x) * 4;
    data[i] = (-Math.sin(a) * 0.5 + 0.5) * 255; data[i + 1] = (Math.cos(a) * 0.5 + 0.5) * 255; data[i + 2] = 255; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, s, s);
  tex.needsUpdate = true;
  return tex;
};

const reededTexture = (repeat) => {
  const t = canvasTex((g, w, h) => {
    for (let x = 0; x < w; x++) { const v = x % 4 < 2 ? 220 : 110; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, h); }
  }, { srgb: false, w: 64, h: 4 });
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(repeat, 1);
  return t;
};

const radialTexture = (stops) => canvasTex((g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  stops.forEach(([o, c]) => grd.addColorStop(o, c));
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
}, { w: 256 });

// Data labels in the scene: filled mark = long, hollow = short, ring = net.
function labelSprite(title, sub, mark) {
  const tex = canvasTex((g, w, h) => {
    g.fillStyle = "rgba(0,0,0,.72)"; g.strokeStyle = "rgba(255,255,255,.28)"; g.lineWidth = 2;
    g.beginPath(); g.roundRect(3, 3, w - 6, h - 6, 30); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineWidth = 3;
    g.beginPath(); g.arc(44, h / 2 - 20, 9, 0, Math.PI * 2);
    if (mark === "fill") g.fill(); else g.stroke();
    if (mark === "ring") { g.beginPath(); g.arc(44, h / 2 - 20, 3, 0, Math.PI * 2); g.fill(); }
    g.font = "500 38px Geist, sans-serif"; g.textBaseline = "middle";
    g.fillText(title, 68, h / 2 - 20);
    g.fillStyle = "#a8a8a8"; g.font = "400 30px 'Geist Mono', monospace";
    g.fillText(sub, 34, h / 2 + 28);
  }, { w: 540, h: 140 });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false, opacity: 0 });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.45, 0.376, 1);
  s.renderOrder = 20;
  return s;
}

// ---------------------------------------------------------------- scene
export async function createScene(canvas, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 1.35;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  scene.add(camera);

  // Backdrop glued to the camera: a graphite sweep with a faint dot lattice, so glass has something to refract.
  const backdropMat = new THREE.ShaderMaterial({
    depthWrite: false, toneMapped: false,
    uniforms: {
      uC1: { value: new THREE.Color("#2b2b2b") }, uC2: { value: new THREE.Color("#000000") },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 }, uGrid: { value: 0 }, uDpr: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uC1; uniform vec3 uC2; uniform vec2 uCenter; uniform float uAspect; uniform float uGrid; uniform float uDpr;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 d = (vUv - uCenter) * vec2(uAspect, 1.);
        float r = length(d);
        vec3 col = mix(uC1, uC2, smoothstep(0.0, 0.68, r));
        vec2 k = (vUv - uCenter - vec2(0.12, 0.24)) * vec2(uAspect, 1.);
        col += uC1 * 0.55 * exp(-dot(k, k) * 18.);
        vec2 g = fract(gl_FragCoord.xy / (24. * uDpr)) - .5;
        float dotm = smoothstep(.1, .04, length(g));
        col += vec3(.05) * dotm * uGrid * (1. - smoothstep(.05, .75, r));
        col += (hash(gl_FragCoord.xy) - .5) / 180.;
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMat);
  backdrop.position.z = -80;
  backdrop.renderOrder = -10;
  camera.add(backdrop);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(-5, 3, -5); scene.add(rim);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.6, 96), new THREE.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.61; floor.receiveShadow = true;
  scene.add(floor);

  // ------------------------------------------------ materials
  const pigGlass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.55, ior: 1.5,
    attenuationColor: new THREE.Color("#e8e8e8"), attenuationDistance: 8,
    clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMapIntensity: 1.35, transparent: true,
  });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0b, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true });
  const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x080808, roughness: 0.12, clearcoat: 1, transparent: true });
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f4, metalness: 1, roughness: 0.07 });
  const satin = new THREE.MeshPhysicalMaterial({ color: 0xbdbdbd, metalness: 1, roughness: 0.34, clearcoat: 0.4 });
  const spunDir = spunAnisotropyTexture();
  const usdcFace = new THREE.MeshPhysicalMaterial({
    map: usdcFaceTexture(), bumpMap: usdcBumpTexture(), bumpScale: 1.4, metalness: 1, roughness: 0.3,
    anisotropy: 0.7, anisotropyMap: spunDir,
  });
  const usdcSide = new THREE.MeshStandardMaterial({ color: 0xdadada, metalness: 1, roughness: 0.3, bumpMap: reededTexture(14), bumpScale: 2 });
  const usdcMats = [usdcSide, usdcFace, usdcFace];
  const pigMats = [pigGlass, lacquer, darkMat];

  const addTo = (parent, geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], shadow = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p); m.rotation.set(...r); m.scale.set(...s);
    m.castShadow = shadow;
    parent.add(m); return m;
  };

  // ------------------------------------------------ piggy bank (the vault)
  const pigRoot = new THREE.Group();
  pigRoot.position.y = -0.15;
  scene.add(pigRoot);
  const pig = new THREE.Group();
  pig.rotation.y = -2.6;
  pigRoot.add(pig);

  addTo(pig, new THREE.SphereGeometry(1, 96, 64), pigGlass, [0, 0, 0], [0, 0, 0], [1.3, 1.05, 1.08]);
  const snoutGeo = new THREE.LatheGeometry([[0, 0.29], [0.2, 0.285], [0.31, 0.26], [0.36, 0.2], [0.375, 0.08], [0.37, -0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 64).rotateZ(-Math.PI / 2);
  addTo(pig, snoutGeo, pigGlass, [1.27, 0.02, 0]);
  addTo(pig, new THREE.SphereGeometry(0.055, 16, 12), darkMat, [1.56, 0.03, 0.11], [0, 0, 0], [0.6, 1.3, 1]);
  addTo(pig, new THREE.SphereGeometry(0.055, 16, 12), darkMat, [1.56, 0.03, -0.11], [0, 0, 0], [0.6, 1.3, 1]);
  addTo(pig, new THREE.SphereGeometry(0.065, 20, 16), darkMat, [0.98, 0.42, 0.42]);
  addTo(pig, new THREE.SphereGeometry(0.065, 20, 16), darkMat, [0.98, 0.42, -0.42]);
  const earGeo = new THREE.SphereGeometry(0.24, 32, 24).scale(1, 1.25, 0.38).translate(0, 0.16, 0);
  addTo(pig, earGeo, pigGlass, [0.62, 0.86, 0.44], [0.45, 0.5, -0.5]);
  addTo(pig, earGeo, pigGlass, [0.62, 0.86, -0.44], [-0.45, -0.5, -0.5]);
  for (const [x, z] of [[0.62, 0.42], [0.62, -0.42], [-0.62, 0.42], [-0.62, -0.42]])
    addTo(pig, new THREE.CapsuleGeometry(0.18, 0.28, 8, 24), pigGlass, [x, -0.9, z]);
  addTo(pig, new THREE.TorusGeometry(0.1, 0.035, 12, 32, 5), pigGlass, [-1.33, 0.22, 0], [0, Math.PI / 2, 0]);
  addTo(pig, new THREE.BoxGeometry(0.62, 0.05, 0.1), darkMat, [0, 1.035, 0]);
  addTo(pig, new THREE.BoxGeometry(0.72, 0.03, 0.18), chrome, [0, 1.02, 0]);

  // intro coin, in pig-local space so it lines up with the slot (axis along z = edge-on to the slot)
  const introCoin = addTo(pig, new THREE.CylinderGeometry(0.26, 0.26, 0.055, 64).rotateX(Math.PI / 2), usdcMats, [0, 0, 0], [0, 0, 0], [1, 1, 1], true);
  const INTRO = { delay: 0.55, fall: 0.8, sink: 0.42 }; // seconds
  const PIG_BOTTOM = -1.08; // lowest point of the feet, kept on the plinth while squashing
  let introAt = null; // clock time when the intro starts; null until the first visible frame

  // glow once the coin is in: the glass lights from within, a soft light inside, a halo behind
  pigGlass.emissive = new THREE.Color(0xffffff);
  pigGlass.emissiveIntensity = 0;
  const pigLight = new THREE.PointLight(0xffffff, 0, 4.5, 2);
  pigLight.position.set(0, -0.35, 0);
  pigRoot.add(pigLight);
  const haloMat = new THREE.SpriteMaterial({ map: radialTexture([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,.35)"], [1, "rgba(255,255,255,0)"]]), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(6.2, 5.2, 1);
  halo.position.set(0, 0.05, -1.4);
  halo.renderOrder = -1;
  pigRoot.add(halo);

  // black lacquer plinth with a soft contact shadow where the glass feet stand
  const plinth = addTo(pigRoot, new THREE.CylinderGeometry(1.95, 1.95, 0.26, 128), lacquer, [0, -1.29, 0], [0, 0, 0], [1, 1, 1], true);
  plinth.receiveShadow = true;
  const contactMat = new THREE.MeshBasicMaterial({ map: radialTexture([[0, "rgba(0,0,0,.7)"], [0.5, "rgba(0,0,0,.3)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false });
  addTo(pigRoot, new THREE.PlaneGeometry(3.4, 2.6), contactMat, [0, -1.155, 0], [-Math.PI / 2, 0, 0.5]);
  pigMats.push(contactMat);

  // ------------------------------------------------ balance scale (the strategy)
  const scaleRoot = new THREE.Group();
  scene.add(scaleRoot);
  const S = (geo, mat, p, r) => addTo(scaleRoot, geo, mat, p, r, [1, 1, 1], true);
  S(new THREE.CylinderGeometry(0.75, 0.86, 0.12, 96), lacquer, [0, -1.55, 0]).receiveShadow = true;
  S(new THREE.CylinderGeometry(0.42, 0.6, 0.1, 96), satin, [0, -1.44, 0]).receiveShadow = true;
  S(new THREE.CylinderGeometry(0.04, 0.065, 2.4, 48), chrome, [0, -0.3, 0]);
  S(new THREE.SphereGeometry(0.1, 48, 32), chrome, [0, 0.93, 0]);
  const beam = new THREE.Group();
  beam.position.y = 0.9;
  scaleRoot.add(beam);
  addTo(beam, new THREE.CylinderGeometry(0.03, 0.03, 3.0, 32).rotateZ(Math.PI / 2), chrome, [0, 0, 0], [0, 0, 0], [1, 1, 1], true);
  addTo(beam, new THREE.SphereGeometry(0.055, 24, 16), chrome, [-1.5, 0, 0]);
  addTo(beam, new THREE.SphereGeometry(0.055, 24, 16), chrome, [1.5, 0, 0]);
  addTo(beam, new THREE.ConeGeometry(0.045, 0.36, 24), chrome, [0, 0.26, 0]);

  const panGeo = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.45, 0.015), new THREE.Vector2(0.6, 0.08), new THREE.Vector2(0.64, 0.13), new THREE.Vector2(0.62, 0.135)], 96);
  const panMat = new THREE.MeshPhysicalMaterial({ color: 0xe8e8e8, metalness: 1, roughness: 0.16, side: THREE.DoubleSide });
  const panL = S(panGeo, panMat); panL.receiveShadow = true;
  const panR = S(panGeo, panMat); panR.receiveShadow = true;
  const strGeo = new THREE.BufferGeometry();
  strGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
  scaleRoot.add(new THREE.LineSegments(strGeo, new THREE.LineBasicMaterial({ color: 0xbdbdbd, transparent: true, opacity: 0.7 })));

  const ethTop = new THREE.ConeGeometry(0.3, 0.5, 4, 1).translate(0, 0.25, 0);
  const ethBot = new THREE.ConeGeometry(0.3, 0.32, 4, 1).rotateX(Math.PI).translate(0, -0.16, 0);
  const makeEth = (mat, edges) => {
    const g = new THREE.Group();
    for (const geo of [ethTop, ethBot]) {
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m);
      if (edges) g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })));
    }
    return g;
  };
  // long = polished silver, short = black obsidian: the same object, inverted
  const spotEth = makeEth(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, flatShading: true }));
  const perpEth = makeEth(new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, metalness: 0, roughness: 0.05, clearcoat: 1, flatShading: true }), true);
  scaleRoot.add(spotEth, perpEth);

  const labelSpot = labelSprite("Spot ETH", "long   Δ +1", "fill");
  const labelPerp = labelSprite("ETH-PERP", "short  Δ −1", "hollow");
  const labelNet = labelSprite("Net delta", "Δ = 0.00", "ring");
  const labelFund = labelSprite("Funding", "paid to shorts", "fill");
  const labelDrift = labelSprite("Hedge drift", "Δ = +0.021", "ring");
  const labelFix = labelSprite("Bot rebalanced", "Δ = 0.00  maker", "ring");
  scaleRoot.add(labelSpot, labelPerp, labelNet, labelFund, labelDrift, labelFix);

  const FUND = 16;
  const fundGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.028, 48).rotateX(Math.PI / 2);
  const fundCoins = Array.from({ length: FUND }, () => { const m = addTo(scaleRoot, fundGeo, usdcMats, [0, 0, 0], [0, 0, 0], [1, 1, 1], true); m.visible = false; return m; });

  // ------------------------------------------------ state
  let tTarget = 0, tNow = 0, visible = true, mobile = false, aspect = 1;
  let theta = 0, thetaV = 0;
  let onTick = null;
  const clock = new THREE.Clock();
  const tmpLook = new THREE.Vector3();
  const cHero = new THREE.Color("#2e2e2e"), cInside = new THREE.Color("#1a1a1a"), cSpec = new THREE.Color("#121212");

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    mobile = w < 820;
    aspect = w / h;
    const dpr = Math.min(devicePixelRatio, mobile ? 1.5 : 1.75);
    key.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const hh = 2 * 80 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.6;
    backdrop.scale.set(hh * aspect, hh, 1);
    backdropMat.uniforms.uAspect.value = aspect;
    backdropMat.uniforms.uDpr.value = dpr;
  }
  resize();
  addEventListener("resize", resize);

  function setPigOpacity(o) {
    for (const m of pigMats) m.opacity = o;
    pigRoot.visible = o > 0.01;
  }

  function update(dt, time) {
    const t = tNow;
    const idle = reducedMotion ? 0 : 1;

    // camera + framing (subject offset so copy can sit beside it)
    const k = sampleKF(t, mobile);
    const distScale = aspect < 1.2 ? Math.pow(Math.min(2.2, 1.2 / aspect), 0.8) : 1;
    tmpLook.set(...k.look);
    camera.position.set(
      k.look[0] + (k.pos[0] - k.look[0]) * distScale + Math.sin(time * 0.21) * 0.06 * idle,
      k.look[1] + (k.pos[1] - k.look[1]) * distScale + Math.sin(time * 0.29) * 0.04 * idle,
      k.look[2] + (k.pos[2] - k.look[2]) * distScale,
    );
    camera.lookAt(tmpLook);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = -k.sx;
    camera.projectionMatrix.elements[9] = -k.sy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    backdropMat.uniforms.uCenter.value.set(0.5 + k.sx * 0.5, 0.5 + k.sy * 0.5 + 0.05);

    const inside = smooth(seg(t, 1.1, 1.6));
    const spec = smooth(seg(t, 7.1, 7.7));
    backdropMat.uniforms.uC1.value.copy(cHero).lerp(cInside, inside).lerp(cSpec, spec);
    backdropMat.uniforms.uGrid.value = 0.35 + inside * 0.65 - spec * 0.6;

    // piggy bank: the camera dives in (0.7 → 1.6)
    const diveIn = easeIn(seg(t, 0.7, 1.6));
    const pigFade = 1 - smooth(seg(t, 1.2, 1.55));
    pigRoot.scale.setScalar(lerp(1, 7, diveIn));
    setPigOpacity(pigFade);
    plinth.castShadow = diveIn < 0.1;
    pig.rotation.y = -2.6 + Math.sin(time * 0.3) * 0.05 * idle + seg(t, 0.2, 1.2) * 0.25;

    // intro: one coin falls into the slot, the bank reacts
    if (introAt === null) introAt = reducedMotion || t > 0.4 ? -1e9 : time;
    const it = time - introAt - INTRO.delay;
    const top = mobile ? 3.1 : 5.4;
    if (it < 0) {
      introCoin.visible = false;
    } else if (it < INTRO.fall) {
      const k = it / INTRO.fall;
      introCoin.visible = true;
      introCoin.position.set(0, lerp(top, 1.05, k * k), 0);
      introCoin.rotation.set(0, (1 - k) * (1 - k) * 7, 0); // spins, then settles edge-on over the slot
    } else {
      const k = Math.min(1, (it - INTRO.fall) / INTRO.sink);
      const land = bounce(k);
      introCoin.visible = true;
      introCoin.position.set(0.08 * land, lerp(1.05, -0.86, land), 0.04 * land);
      introCoin.rotation.set(lerp(0, Math.PI / 2, easeOut(k)), 0, 0.35 * land); // tips over and lies flat on the bottom
    }
    introCoin.visible &&= pigFade > 0.9;
    // squash and stretch on impact: a damped spring, pivoting on the feet so it stays on the plinth
    const hit = it - INTRO.fall;
    const squash = hit > 0 ? Math.exp(-3.6 * hit) * Math.sin(hit * 15) * 0.085 : 0;
    const sy = 1 - squash, sxz = 1 + squash * 0.55;
    pig.scale.set(sxz, sy, sxz);
    pig.position.y = PIG_BOTTOM * (1 - sy) + (hit > 0 ? Math.max(0, Math.sin(Math.min(1, hit / 0.5) * Math.PI)) * 0.06 * Math.exp(-2 * hit) : 0);
    pig.rotation.z = hit > 0 ? Math.exp(-3 * hit) * Math.sin(hit * 11) * 0.035 : 0;

    // glow: rises as the coin lands, peaks, then settles into a faint breathing afterglow
    const rise = smooth(clamp01((hit - 0.1) / 0.4));
    const decay = hit > 0.5 ? Math.exp(-(hit - 0.5) / 1.2) : 1;
    const breathe = 1 + 0.25 * Math.sin(time * 1.5) * idle;
    const glowK = rise * (0.2 * breathe + 0.8 * decay) * pigFade;
    pigGlass.emissiveIntensity = 0.32 * glowK;
    pigLight.intensity = 9 * glowK;
    haloMat.opacity = 0.22 * glowK;
    halo.visible = glowK > 0.002;

    // balance scale
    const grow = easeOut(seg(t, 1.05, 1.75));
    const shrink = easeIn(seg(t, 7.1, 7.7));
    const sc = t < 4 ? lerp(0.13, 1, grow) : lerp(1, 0.13, shrink);
    scaleRoot.visible = t > 1.05 && t < 7.7;
    scaleRoot.scale.setScalar(sc * (mobile ? 0.82 : 1));

    const spotLand = bounce(seg(t, 2.2, 2.75));
    const perpLand = bounce(seg(t, 3.2, 3.75));
    // automation: ETH rises, the spot leg outweighs the short (drift), the bot adds to the short and the beam levels
    const drift = smooth(seg(t, 6.25, 6.45)), fix = smooth(seg(t, 6.55, 6.75));
    const target = 0.2 * smooth(seg(t, 2.55, 2.7)) - 0.2 * smooth(seg(t, 3.55, 3.7)) + 0.075 * drift - 0.075 * fix;
    if (reducedMotion) { theta = target; thetaV = 0; }
    else {
      const h = Math.min(dt, 0.05);
      thetaV += (55 * (target - theta) - 6 * thetaV) * h; theta += thetaV * h;
    }
    beam.rotation.z = theta;
    const endL = [-1.5 * Math.cos(theta), 0.9 - 1.5 * Math.sin(theta)];
    const endR = [1.5 * Math.cos(theta), 0.9 + 1.5 * Math.sin(theta)];
    panL.position.set(endL[0], endL[1] - 1.2, 0);
    panR.position.set(endR[0], endR[1] - 1.2, 0);
    const sp = strGeo.attributes.position.array;
    let o = 0;
    for (const [end, pan] of [[endL, panL], [endR, panR]])
      for (let j = 0; j < 3; j++) {
        const a = (j / 3) * Math.PI * 2 + Math.PI / 2;
        sp.set([end[0], end[1], 0, pan.position.x + Math.cos(a) * 0.62, pan.position.y + 0.13, Math.sin(a) * 0.62], o); o += 6;
      }
    strGeo.attributes.position.needsUpdate = true;

    // ETH price swing (4.3 → 5.1): both legs grow and shrink together
    const swing = seg(t, 4.3, 5.1);
    const price = BASE_PRICE * (1 + 0.3 * Math.sin(swing * Math.PI * 2));
    const k2 = 1 + (price / BASE_PRICE - 1) * 0.9;
    const hover = Math.sin(time * 1.6) * 0.02 * idle;
    spotEth.visible = spotLand > 0;
    spotEth.position.set(panL.position.x, panL.position.y + 0.36 * k2 + lerp(3.2, 0, spotLand) + hover, 0);
    spotEth.scale.setScalar(k2 * (1 + 0.1 * drift));
    spotEth.rotation.y = time * 0.4 * idle + t;
    perpEth.visible = perpLand > 0;
    perpEth.position.set(panR.position.x, panR.position.y + 0.36 * k2 + lerp(3.2, 0, perpLand) + hover, 0);
    const kp = k2 * (1 + 0.1 * fix);
    perpEth.scale.set(kp, -kp, kp);
    perpEth.rotation.y = -time * 0.4 * idle - t;

    const lblOut = 1 - seg(t, 7.0, 7.2);
    labelSpot.material.opacity = smooth(seg(t, 2.55, 2.8)) * lblOut;
    labelPerp.material.opacity = smooth(seg(t, 3.55, 3.8)) * lblOut;
    // the net-delta label hands over to the drift and rebalance labels during the automation step
    labelNet.material.opacity = smooth(seg(t, 3.75, 4.0)) * (1 - smooth(seg(t, 6.22, 6.32)));
    labelDrift.material.opacity = smooth(seg(t, 6.3, 6.4)) * (1 - smooth(seg(t, 6.55, 6.62)));
    labelFix.material.opacity = smooth(seg(t, 6.62, 6.72)) * lblOut;
    labelDrift.position.set(0, 1.95, 0.2);
    labelFix.position.set(0, 1.95, 0.2);
    labelFund.material.opacity = smooth(seg(t, 5.3, 5.55)) * lblOut;
    labelSpot.position.set(panL.position.x, panL.position.y + 1.35, 0.2);
    labelPerp.position.set(panR.position.x, panR.position.y + 1.35, 0.2);
    labelNet.position.set(0, 1.95, 0.2);
    labelFund.position.set(1.15, -1.0, 1.0);

    // funding: coins arc from the short leg into a stack in front of the scale (5.3 → 6.05)
    const fu = seg(t, 5.3, 6.05) * (FUND + 1.5);
    const start = new THREE.Vector3(panR.position.x, panR.position.y + 0.3, 0);
    fundCoins.forEach((m, i) => {
      const f = clamp01((fu - i) / 1.5);
      m.visible = f > 0;
      if (!m.visible) return;
      const e = easeInOut(f);
      m.position.set(lerp(start.x, 0, e), lerp(start.y, -1.47 + i * 0.03, e) + Math.sin(Math.PI * e) * 0.9, lerp(start.z, 1.0, e));
      m.rotation.set(lerp(0, Math.PI / 2, e), 0, (1 - e) * 8);
    });

    if (onTick) onTick({ t, price, spotPnl: SPOT_ETH * (price - BASE_PRICE) });
  }

  let raf = 0, last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!visible) return;
    // damped follow: scroll input feels weighted, like a camera on a dolly
    tNow = reducedMotion ? tTarget : tNow + (tTarget - tNow) * (1 - Math.exp(-dt * 4));
    if (Math.abs(tTarget - tNow) < 0.0005) tNow = tTarget;
    update(dt, clock.getElapsedTime());
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    setProgress(t) { tTarget = t; },
    jump(t) { tTarget = tNow = t; },
    setVisible(v) { visible = v; },
    onTick(cb) { onTick = cb; },
    get t() { return tNow; },
    destroy() { cancelAnimationFrame(raf); removeEventListener("resize", resize); renderer.dispose(); },
  };
}
