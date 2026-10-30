/* An inner page opens on its own world: the planet you clicked, seen from close, its limb under
   the page title and lit from the sun out of frame. Arriving from the solar system, the camera
   starts against the surface (where the home page's transition ended) and pulls back. */
import * as THREE from "../vendor/three.module.js";

const host = document.querySelector("[data-world]");
const canvas = host && host.querySelector(".world__canvas");
if (canvas) start();

function start() {
  const key = host.dataset.world;
  // Each page frames its world its own way: where the planet sits, how big, and where its light falls.
  const WORLDS = {
    technology: { pos: [6.5, -11.2], narrow: [2.2, -12.4], r: 9, light: [-1, 0.55, -0.35], sky: [0.12, 0.08] },
    products: { pos: [5.4, -0.5], narrow: [0, -1.4], r: 2.8, light: [-1, 0.35, 0.25], sky: [-0.02, -0.06] },
    partner: { pos: [8.4, 6.2], narrow: [3.2, 7.4], r: 6.2, light: [-0.85, -0.5, -0.1], sky: [0.2, 0.14] },
    about: { pos: [2, -18.6], narrow: [0.5, -19.8], r: 15.5, light: [-1, 0.7, -0.2], sky: [-0.08, 0.1] },
    contact: { pos: [6.4, 2.4], narrow: [0.4, 0.2], r: 1.9, light: [-1, 0.25, 0.6], sky: [0.16, -0.08] },
  };
  const cfg = WORLDS[key] || WORLDS.technology;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (e) {
    return; // the poster image stays
  }

  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const token = (name) => {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  };
  const C = { paper: token("--color-paper"), ink: token("--color-ink"), sun: token("--color-sun"), night: token("--color-night") };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(C.paper, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  const loader = new THREE.TextureLoader();
  const pending = [];
  const tex = (url, srgb = true) => {
    let done;
    pending.push(new Promise((res) => { done = res; }));
    const t = loader.load(url, () => done(), undefined, () => done());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };

  // The same real sky as the home page, dimmer here: this is a page you read.
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uSky: { value: tex(window.innerWidth < 960 ? "assets/img/sky-sm.jpg" : "assets/img/sky.jpg") }, uView: { value: new THREE.Vector2(1, 1) }, uImg: { value: 3200 / 1800 }, uShift: { value: new THREE.Vector2(cfg.sky[0], cfg.sky[1]) }, uI: { value: 0.42 }, uLeft: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSky; uniform vec2 uView; uniform float uImg; uniform vec2 uShift; uniform float uI; uniform float uLeft; varying vec2 vUv;
      void main() {
        float va = uView.x / uView.y;
        vec2 s = va > uImg ? vec2(1.0, uImg / va) : vec2(va / uImg, 1.0);
        // Slide the window over the plate, but never past its edge (that smears the last row of pixels).
        vec2 h = s * 0.35;
        vec2 uv = (vUv - 0.5) * s * 0.7 + 0.5 + clamp(uShift, h - 0.5, 0.5 - h);
        vec3 sky = max(texture2D(uSky, uv).rgb - 0.012, 0.0) * uI;
        // On a wide screen the words sit on the left, so the sky there falls away to near-black.
        sky *= mix(1.0, mix(0.02, 1.0, smoothstep(0.3, 0.75, vUv.x)), uLeft);
        gl_FragColor = vec4(sky, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // The world: a big sphere whose limb rises from the lower right, lit from the upper left.
  // How finely each surface tiles across the sphere: fine for the frost, wide for the gas bands.
  const REPEAT = { technology: [3, 1.5], products: [7, 3.5], partner: [4, 2], about: [2, 1], contact: [3, 1.5] };
  const map = tex(`assets/tex/${key}.jpg`);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(...(REPEAT[key] || [3, 1.5]));
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 2.2, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEdge = { value: C.sun.clone().lerp(C.ink, 0.5) };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uEdge;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  float swEdge = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 4.0);\n  totalEmissiveRadiance += uEdge * swEdge * 0.35;");
  };
  // The sphere's poles point at the camera, down below the frame, so the texture never pinches
  // into a star where you can see it; the world turns about that axis.
  const R = cfg.r;
  const planet = new THREE.Group();
  planet.rotation.set(Math.PI / 2 - 0.25, 0, 0.32);
  const body = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), mat);
  planet.add(body);
  scene.add(planet);

  // The sun sits out of frame to the upper left and a little behind, so the world shows a real
  // shadow line. Its light is whiter here than at home, so each surface keeps its own colour.
  const sun = new THREE.DirectionalLight(C.sun.clone().lerp(C.ink, 0.6), 3.2);
  sun.position.set(...cfg.light);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(C.night, 0.1));

  // Where the camera rests, and where it starts when you arrive from the orbit.
  const REST = new THREE.Vector3(0, 0, 30);
  const NEAR = new THREE.Vector3();
  const LOOK = new THREE.Vector3();
  const ORIGIN = new THREE.Vector3(0, 0, 0);
  let arriving = null;
  try {
    if (!reduced && sessionStorage.getItem("sw-from") === key) arriving = { t0: performance.now() };
  } catch (e) { arriving = null; }
  // Landing here first, behind the age gate: the pull-back waits for Yes, like the Big Bang at home.
  const gated = document.documentElement.dataset.gate === "open";
  if (gated && !reduced) arriving = { t0: Infinity, waiting: true };
  let texturesReady = false;
  const settle = () => {
    if (!texturesReady || (arriving && arriving.waiting)) return;
    if (arriving) arriving.t0 = performance.now();
    host.classList.remove("is-arriving");
    kick();
  };
  document.addEventListener("sw:gate-passed", () => { if (arriving) arriving.waiting = false; settle(); });

  let W = 1, H = 1;
  const layout = () => {
    W = Math.max(1, canvas.clientWidth);
    H = Math.max(1, canvas.clientHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    skyMat.uniforms.uView.value.set(W, H);
    // The limb sits low and to the right of the words, whatever the shape of the screen.
    const narrow = window.innerWidth < 960;
    skyMat.uniforms.uLeft.value = narrow ? 0 : 1;
    const at = narrow ? cfg.narrow : cfg.pos;
    planet.position.set(at[0], at[1], 0);
    // Arriving from the orbit, the camera starts just off this world's surface, facing it.
    NEAR.copy(REST).sub(planet.position).setLength(R + 1.4).add(planet.position);
  };

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  let raf = 0, clock = 0, last = performance.now(), onScreen = true, visible = true;
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduced) clock += dt;
    body.rotation.y = 0.8 + clock * ((Math.PI * 2) / 240);
    if (arriving) {
      const t = arriving.waiting ? 0 : Math.min(1, Math.max(0, (now - arriving.t0) / 1600));
      camera.position.copy(NEAR).lerp(REST, ease(t));
      LOOK.copy(planet.position).lerp(ORIGIN, ease(t));
      if (t >= 1) arriving = null;
    } else {
      camera.position.copy(REST);
      LOOK.copy(ORIGIN);
    }
    camera.lookAt(LOOK);
    renderer.render(scene, camera);
    if ((!reduced || arriving) && visible && onScreen) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) kick(); });
  if ("IntersectionObserver" in window) new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; if (onScreen) kick(); }).observe(host);
  window.addEventListener("resize", () => { layout(); kick(); });

  layout();
  if (arriving) host.classList.add("is-arriving");
  Promise.all(pending).then(() => {
    texturesReady = true;
    renderer.render(scene, camera);
    host.classList.add("is-live");
    settle();
  });
}
