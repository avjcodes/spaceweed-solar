/* The Space Weed solar system.
   The real bud photograph is the sun; the five destinations orbit it and work as the navigation.
   The <nav> in the page is the source of truth: every planet mirrors one of its links, so the
   page still works as plain links with WebGL off, scripts off or motion reduced. */
import * as THREE from "../vendor/three.module.js";

const root = document.querySelector(".system");
const canvas = root && root.querySelector(".system__canvas");
const labelEls = root ? [...root.querySelectorAll("[data-planet]")] : [];
if (canvas && labelEls.length) start();

function start() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = matchMedia("(hover: none), (pointer: coarse)").matches;
  if (touch) document.documentElement.classList.add("is-touch");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (e) {
    return; // the labels stay a plain list of links
  }
  root.classList.add("is-scene");

  /* Colours come from the page's tokens, so the scene and the CSS are one palette. */
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const token = (name) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = v;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  };
  const C = { paper: token("--color-paper"), ink: token("--color-ink"), sun: token("--color-sun"), sunDeep: token("--color-sun-deep"), night: token("--color-night") };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(C.paper, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  const ELEVATION = 0.36; // low over the orbit plane, like a camera inside the system
  const OUTER = 7.15;

  /* ---------- Light: one warm sun at the bud; space itself stays dark ---------- */
  const sunLight = new THREE.PointLight(C.sun, 3.6, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(C.night, 0.16));
  const FILL = 0.3; // a faint light from the viewer, so a world's night side still shows its surface
  const fill = new THREE.DirectionalLight(C.ink, FILL); // and it brightens the chosen world as it fills the screen
  scene.add(fill);
  scene.add(fill.target);

  /* ---------- Stars: two sparse layers of fine points, barely moving with the pointer ---------- */
  const seed = (n) => { const x = Math.sin(n * 9301.17 + 49297.3) * 233280.7; return x - Math.floor(x); };
  const starLayer = (count, radius, size, opacity, offset) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = seed(i + offset) * 2 - 1;
      const th = seed(i + offset + 5000) * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([radius * s * Math.cos(th), radius * u, radius * s * Math.sin(th) - radius * 0.25], i * 3);
      const warm = seed(i + offset + 9000);
      const c = C.ink.clone().lerp(warm > 0.7 ? C.sun : C.night, warm > 0.7 ? 0.25 : 0.12);
      const k = 0.55 + seed(i + offset + 13000) * 0.45;
      col.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity, depthWrite: false, toneMapped: false });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -1;
    scene.add(pts);
    return pts;
  };
  // The photograph carries the far stars; one sparse near layer gives the pointer some depth.
  const starsNear = starLayer(160, 110, 1.5, 0.55, 7);

  /* ---------- The system: an orbit plane that holds the worlds and their paths ---------- */
  const plane = new THREE.Group();
  plane.rotation.z = -0.1;
  scene.add(plane);

  const loader = new THREE.TextureLoader();
  const pending = [];
  const tex = (url, srgb = true) => {
    let done;
    pending.push(new Promise((res) => { done = res; }));
    const t = loader.load(url, () => done(), undefined, () => done());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  };

  /* The sky: the galactic core from NASA's Deep Star Maps 2020, the real sky built from the Gaia,
     Hipparcos and Tycho surveys (credited in the footer), cut from the 16K map so every star is a
     sharp point. Darker behind the words, with the sun's light scattering into the dust around it. */
  const SKY = 0.38;
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uSky: { value: tex(window.innerWidth < 960 ? "assets/img/sky-sm.jpg" : "assets/img/sky.jpg") }, uView: { value: new THREE.Vector2(1, 1) }, uImg: { value: 3200 / 1800 },
      uShift: { value: new THREE.Vector2(0, 0) }, uI: { value: SKY }, uSun: { value: C.sun }, uSunPos: { value: new THREE.Vector2(0.7, 0.5) }, uLeft: { value: 1 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSky; uniform vec2 uView; uniform float uImg; uniform vec2 uShift; uniform float uI; uniform vec3 uSun; uniform vec2 uSunPos; uniform float uLeft; varying vec2 vUv;
      void main() {
        float va = uView.x / uView.y;
        vec2 s = va > uImg ? vec2(1.0, uImg / va) : vec2(va / uImg, 1.0);
        vec2 uv = (vUv - 0.5) * s * 0.86 + 0.5 + uShift;
        vec3 sky = texture2D(uSky, uv).rgb;
        sky = max(sky - 0.012, 0.0) * uI; // the plate is graded to black already; this only cleans the last grain
        sky *= mix(1.0, mix(0.06, 1.0, smoothstep(0.3, 0.64, vUv.x)), uLeft); // the words sit on near-black
        // A vignette brings the edges back to black, so the system sits in dark space.
        vec2 q = (vUv - vec2(0.62, 0.5)) * vec2(va, 1.0);
        sky *= mix(0.22, 1.0, smoothstep(1.0, 0.25, length(q)));
        vec2 d = (vUv - uSunPos) * vec2(va, 1.0);
        float r = length(d);
        sky *= mix(0.45, 1.0, smoothstep(0.08, 0.42, r)); // the sun's glare darkens the sky around it
        vec3 haze = uSun * (exp(-r * 6.0) * 0.03 + exp(-r * 16.0) * 0.045);
        gl_FragColor = vec4(sky + haze, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  /* The Sun Nug: the photograph on a finely divided plane, pushed into relief by its depth map
     and swayed a few degrees, so every pixel stays the real flower. */
  const NUG = 5.4;
  const nugMaps = tex("assets/img/nug-a-maps.png", false);
  const nugColor = tex("assets/img/nug-a.webp");
  const nugGlow = tex("assets/img/nug-a-glow.png", false);
  const sunGroup = new THREE.Group();
  scene.add(sunGroup);
  const sway = new THREE.Group();
  sunGroup.add(sway);

  const nugMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: nugColor }, uMaps: { value: nugMaps }, uDepth: { value: 0.85 }, uSun: { value: C.sun }, uRim: { value: 0.2 }, uDim: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform sampler2D uMaps; uniform float uDepth; varying vec2 vUv;
      void main() {
        vUv = uv;
        float d = texture2D(uMaps, uv).r;
        vec3 p = position + vec3(0.0, 0.0, d * uDepth);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uColor; uniform sampler2D uMaps; uniform vec3 uSun; uniform float uRim; uniform float uDim; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uColor, vUv);
        if (c.a < 0.02) discard;
        float rim = texture2D(uMaps, vUv).g;
        // Lift the photograph like a body lit from within, then let the corona's light wrap its edge.
        vec3 col = pow(c.rgb, vec3(0.86)) * vec3(1.1, 1.02, 0.92) * 1.32;
        col = mix(col, 1.0 - (1.0 - col) * (1.0 - uSun * 0.8), smoothstep(0.0, 1.0, rim) * 0.32);
        col += uSun * pow(rim, 2.4) * uRim;
        gl_FragColor = vec4(col * uDim, c.a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: true,
  });
  const nug = new THREE.Mesh(new THREE.PlaneGeometry(NUG, NUG, 160, 160), nugMat);
  nug.renderOrder = 2;
  sway.add(nug);

  /* The corona: the bud's own silhouette, blurred wide and laid behind it. Noticed second. */
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: nugGlow }, uA: { value: C.sun }, uB: { value: C.sunDeep }, uTime: { value: 0 }, uI: { value: 0.72 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uGlow; uniform vec3 uA; uniform vec3 uB; uniform float uTime; uniform float uI; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y); }
      void main() {
        float g = texture2D(uGlow, vUv).r; g *= g;
        vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float flick = n(vec2(a * 3.0, uTime * 0.035)) * 0.6 + n(vec2(a * 8.0 + 3.1, uTime * 0.05)) * 0.4;
        // Uneven on purpose: real corona light streams out in places instead of tracing the outline.
        float body = g * (0.5 + 0.9 * flick);
        float wide = exp(-r * 5.5) * 0.07;
        float fade = smoothstep(0.98, 0.62, r); // nothing reaches the plane's edge, so no square ever shows
        vec3 col = mix(uB, uA, clamp(g * 1.6, 0.0, 1.0)) * (body * 0.42 + wide) * uI * fade;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(NUG * 2, NUG * 2), coronaMat);
  corona.position.z = -0.35;
  corona.renderOrder = 1;
  sway.add(corona);

  /* ---------- The worlds: one per destination in the nav ---------- */
  const DEFS = {
    // Starting places are set so the first view shows most worlds side-lit, with a real terminator.
    technology: { r: 0.55, a: 3.75, period: 66, phase: 5.75, tilt: 0.28, spin: 70 },
    products: { r: 0.65, a: 4.6, period: 82, phase: 3.5, tilt: 0.12, spin: 95 },
    partner: { r: 0.47, a: 5.4, period: 98, phase: 1.15, tilt: 0.42, spin: 64 },
    about: { r: 0.86, a: 6.3, period: 114, phase: 0.3, tilt: 0.06, spin: 140 },
    contact: { r: 0.36, a: OUTER, period: 130, phase: 1.95, tilt: 0.33, spin: 86 },
  };

  const haloTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 28, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.42, "rgba(255,255,255,0.55)");
    grd.addColorStop(0.62, "rgba(255,255,255,0.12)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  const planets = labelEls.map((el) => {
    const key = el.dataset.planet;
    const d = DEFS[key];
    const map = tex(`assets/tex/${key}.jpg`);
    map.wrapS = THREE.RepeatWrapping;
    map.repeat.set(2, 1);
    const mat = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.4, roughness: 0.93, metalness: 0 });
    // A faint edge, the way a thin atmosphere catches light, so a world reads against the dark.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uEdge = { value: C.night.clone().lerp(C.ink, 0.35) };
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uEdge;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  float swEdge = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);\n  totalEmissiveRadiance += uEdge * swEdge * 0.22;");
    };
    const body = new THREE.Mesh(new THREE.SphereGeometry(d.r, 64, 48), mat);
    body.rotation.z = d.tilt;
    const holder = new THREE.Group();
    holder.add(body);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: C.sun, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(d.r * 3.3);
    holder.add(halo);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(d.r * 1.9, touch ? 0.95 : 0.5), 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.key = key;
    holder.add(hit);
    plane.add(holder);

    // The path: a hairline at single-digit opacity.
    const pts = [];
    for (let i = 0; i <= 256; i++) { const t = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * d.a, 0, Math.sin(t) * d.a)); }
    const path = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.12, depthWrite: false }));
    path.renderOrder = 3;
    plane.add(path);

    return { key, el, href: el.getAttribute("href"), d, body, mat, holder, halo, hit, path, k: 0, dim: 0, w: 120, world: new THREE.Vector3() };
  });
  const byKey = Object.fromEntries(planets.map((p) => [p.key, p]));
  const hits = planets.map((p) => p.hit);

  /* ---------- Layout: the sun sits right of the words on wide screens, centred on narrow ones ---------- */
  let W = 1, H = 1, narrow = false;
  const layout = () => {
    W = Math.max(1, canvas.clientWidth);
    H = Math.max(1, canvas.clientHeight);
    narrow = window.innerWidth < 960;
    renderer.setSize(W, H, false);
    // Wide screens: the system keeps its place inside the page's container; only the dark grows.
    const cw = Math.min(W, parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--container")) || 1440);
    // Wide screens: the orbit fills the free width right of the words, with a margin at the edge.
    const copy = document.querySelector(".system__copy");
    const copyRight = copy && !narrow ? copy.getBoundingClientRect().right : 0;
    const spanL = copyRight + 24, spanR = W - 88 - (W - cw) / 2;
    const cx = narrow ? 0.5 : (spanL + spanR) / 2 / W;
    const cy = narrow ? 0.54 : 0.52;
    const radius = narrow ? Math.min(W * 0.47, H * 0.62) : Math.min((spanR - spanL) / 2, H * 0.72);
    skyMat.uniforms.uView.value.set(W, H);
    skyMat.uniforms.uLeft.value = narrow ? 0 : 1;
    const dist = (OUTER * (H / 2)) / (radius * Math.tan(THREE.MathUtils.degToRad(15)));
    // On a phone the plane tips further toward you, so the orbits use the height too.
    const elev = narrow ? 0.78 : ELEVATION;
    camera.aspect = W / H;
    rest.cx = cx; rest.cy = cy; rest.dist = dist; rest.elev = elev;
    // The Big Bang starts where the gate's point of light was: the middle, 40% down the screen.
    start.cy = Math.min(0.9, Math.max(0.1, (0.4 * window.innerHeight) / H));
    aim(intro ? introS : 1);
    measureLabels();
    needsRender = true;
  };
  /* The camera between two poses: s = 0 is inside the system just after the bang (close to the
     sun, low over the orbit plane, the sun where the point of light was), s = 1 is the hero. */
  const rest = { cx: 0.67, cy: 0.52, dist: 28, elev: ELEVATION };
  const start = { cx: 0.5, cy: 0.4, f: 0.2, elev: 0.12 }; // between the third and fourth orbits
  const aim = (s) => {
    const cx = start.cx + (rest.cx - start.cx) * s;
    const cy = start.cy + (rest.cy - start.cy) * s;
    const dist = rest.dist * (start.f + (1 - start.f) * s);
    const elev = start.elev + (rest.elev - start.elev) * s;
    camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(W, H, (0.5 - cx) * W, (0.5 - cy) * H, W, H);
    camera.updateProjectionMatrix();
  };

  /* The intro: when the age gate is answered Yes, the universe forms from that point of light. */
  const gated = document.documentElement.dataset.gate === "open";
  let intro = gated && !reduced ? { started: false, t0: 0, go: null } : null;
  let introS = 0, flash = 0, texturesReady = false;
  if (gated) {
    root.classList.add("is-intro");
    skyMat.uniforms.uI.value = 0;
  }
  document.addEventListener("sw:gate-passed", () => {
    if (!intro) { root.classList.remove("is-intro"); skyMat.uniforms.uI.value = SKY; kick(); return; }
    intro.go = () => { intro.started = true; intro.t0 = performance.now(); kick(); };
    if (texturesReady) intro.go();
  });
  const measureLabels = () => planets.forEach((p) => { const n = p.el.querySelector(".planet-label__name"); p.w = (n ? n.offsetWidth : 0) + 16 || p.w; });

  /* ---------- Interaction: hover or focus approaches a world; click carries you into it ---------- */
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  let hovered = null, focused = null, tapped = null, near = null;
  let needsRender = true;
  const state = { entering: null, returning: null, orbitSpeed: 1 };

  const pick = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    return hit ? hit.object.userData.key : null;
  };
  const setNear = () => {
    const next = state.entering ? state.entering.key : focused || tapped || hovered;
    if (next === near) return;
    near = next;
    planets.forEach((p) => {
      p.el.classList.toggle("is-near", p.key === near);
      p.el.classList.toggle("is-dim", !!near && p.key !== near);
    });
    canvas.style.cursor = hovered ? "pointer" : "";
    requestAnimationFrame(measureLabels);
    needsRender = true;
    startLoop();
  };

  if (!touch) {
    root.addEventListener("pointermove", (e) => {
      const r = root.getBoundingClientRect();
      parallax.tx = (e.clientX - r.left) / r.width - 0.5;
      parallax.ty = (e.clientY - r.top) / r.height - 0.5;
      if (e.target === canvas) { hovered = pick(e.clientX, e.clientY); setNear(); }
    }, { passive: true });
    canvas.addEventListener("pointerleave", () => { hovered = null; setNear(); });
    canvas.addEventListener("click", (e) => { const key = pick(e.clientX, e.clientY); if (key) enter(key); });
  } else {
    canvas.addEventListener("pointerup", (e) => {
      const key = pick(e.clientX, e.clientY);
      if (key && key === tapped) { enter(key); return; }
      tapped = key;
      setNear();
    });
    // A tap anywhere else lets go of the world you were looking at.
    document.addEventListener("pointerup", (e) => {
      if (tapped && e.target !== canvas && !e.target.closest("[data-planet]")) { tapped = null; setNear(); }
    });
  }

  planets.forEach((p) => {
    p.el.addEventListener("pointerenter", () => { if (!touch) { hovered = p.key; setNear(); } });
    p.el.addEventListener("pointerleave", () => { if (!touch && hovered === p.key) { hovered = null; setNear(); } });
    p.el.addEventListener("focus", () => { focused = p.key; setNear(); });
    p.el.addEventListener("blur", () => { if (focused === p.key) { focused = null; setNear(); } });
    p.el.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      if (touch && tapped !== p.key) { tapped = p.key; setNear(); return; }
      enter(p.key);
    });
  });
  root.querySelectorAll("[data-enter]").forEach((a) => a.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    enter(a.dataset.enter, a.getAttribute("href"));
  }));

  const warp = document.querySelector(".warp");
  function enter(key, href) {
    const p = byKey[key];
    if (!p || state.entering) return;
    const go = href || p.href;
    try { sessionStorage.setItem("sw-from", key); } catch (e) { /* the return trip just starts in orbit */ }
    if (reduced) { location.href = go; return; }
    state.entering = { p, t0: performance.now(), go, from: p.holder.position.clone(), navigated: false };
    setNear();
    startLoop();
  }

  /* Coming back: the world you left shrinks back into its orbit. */
  const playReturn = () => {
    let from = null;
    try { from = sessionStorage.getItem("sw-from"); sessionStorage.removeItem("sw-from"); } catch (e) { from = null; }
    if (warp) warp.classList.remove("is-on");
    if (state.entering) { state.entering = null; fill.intensity = FILL; }
    if (from && byKey[from] && !reduced) state.returning = { p: byKey[from], t0: performance.now() };
    setNear();
    needsRender = true;
    startLoop();
  };
  /* ---------- The frame ---------- */
  const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const camDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const right = new THREE.Vector3();
  let last = performance.now(), clock = 0, orbitClock = 0;

  const place = (dt) => {
    scene.updateMatrixWorld();
    // Orbits: each world keeps its own slow period; everything eases to a near stop while you look.
    state.orbitSpeed = damp(state.orbitSpeed, near ? 0.08 : 1, 2.2, dt);
    orbitClock += dt * state.orbitSpeed;
    camera.getWorldDirection(camDir);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);

    planets.forEach((p) => {
      const isNear = p.key === near;
      p.k = reduced ? (isNear ? 1 : 0) : damp(p.k, isNear ? 1 : 0, 4.2, dt);
      p.dim = reduced ? (near && !isNear ? 1 : 0) : damp(p.dim, near && !isNear ? 1 : 0, 3.6, dt);
      const th = p.d.phase + (reduced ? 0 : (orbitClock / p.d.period) * Math.PI * 2);
      p.holder.position.set(Math.cos(th) * p.d.a, 0, Math.sin(th) * p.d.a);
      // Approach: grow about 18% and come toward the camera, like an object you lean in to.
      p.holder.updateMatrixWorld();
      p.holder.getWorldPosition(p.world);
      const toward = tmp.copy(camera.position).sub(p.world).normalize().multiplyScalar(0.9 * p.k);
      p.holder.position.add(p.holder.parent.worldToLocal(p.world.clone().add(toward)).sub(p.holder.position));
      p.holder.scale.setScalar(1 + 0.18 * p.k);
      p.body.rotation.y = reduced ? 0.6 : (clock / p.d.spin) * Math.PI * 2;
      p.mat.color.setScalar(1 - 0.55 * p.dim);
      p.halo.material.opacity = 0.42 * p.k;
      p.path.material.opacity = 0.12 * (1 - 0.5 * p.dim) + 0.08 * p.k;
    });

    // The way in: the chosen world comes to the camera and fills the screen, then the page opens on it.
    if (state.entering) {
      const e = state.entering;
      const t = Math.min(1, (performance.now() - e.t0) / 1150);
      const s = ease(t);
      const p = e.p;
      p.holder.updateMatrixWorld();
      const start = p.holder.parent.localToWorld(e.from.clone());
      const end = camera.position.clone().add(camDir.clone().multiplyScalar(p.d.r * 1.6));
      const pos = start.lerp(end, s);
      p.holder.position.copy(p.holder.parent.worldToLocal(pos));
      fill.intensity = FILL + 1.4 * s;
      if (t >= 1 && !e.navigated) {
        e.navigated = true;
        if (warp) warp.classList.add("is-on");
        setTimeout(() => { location.href = e.go; }, 380);
      }
    }
    if (state.returning) {
      const rt = state.returning;
      const t = Math.min(1, (performance.now() - rt.t0) / 1100);
      const s = 1 - ease(1 - t);
      const p = rt.p;
      p.holder.updateMatrixWorld();
      const orbitPos = p.holder.parent.localToWorld(p.holder.position.clone());
      const startPos = camera.position.clone().add(camDir.clone().multiplyScalar(p.d.r * 1.6));
      p.holder.position.copy(p.holder.parent.worldToLocal(startPos.lerp(orbitPos, s)));
      if (t >= 1) state.returning = null;
    }

    // The fill light always comes from the viewer.
    fill.position.copy(camera.position);
    fill.target.position.set(0, 0, 0);

    // The sun: a slow float, a turn of a few degrees each way over two minutes, a little roll.
    sunGroup.quaternion.copy(camera.quaternion);
    if (!reduced) {
      sway.rotation.set(0.07 * Math.sin((clock / 83) * Math.PI * 2), 0.21 * Math.sin((clock / 120) * Math.PI * 2), 0.06 * Math.sin((clock / 95) * Math.PI * 2));
      sway.position.y = 0.07 * Math.sin((clock / 23) * Math.PI * 2);
      coronaMat.uniforms.uTime.value = clock;
    }
    nugMat.uniforms.uDim.value = (1 - 0.12 * Math.max(...planets.map((p) => p.dim))) * (1 + 1.1 * flash);

    // The sky and the near stars drift a hair with the pointer; the sun's haze follows the sun.
    parallax.x = damp(parallax.x, parallax.tx, 2, dt);
    parallax.y = damp(parallax.y, parallax.ty, 2, dt);
    starsNear.rotation.set(parallax.y * 0.02, -parallax.x * 0.028, 0);
    skyMat.uniforms.uShift.value.set(-0.035 - parallax.x * 0.008, -0.03 + parallax.y * 0.006);
    tmp.set(0, 0, 0).project(camera);
    skyMat.uniforms.uSunPos.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
  };

  /* Labels ride beside their worlds; a world behind the sun dims its label. */
  const nugScreen = { x: 0, y: 0, rx: 0, ry: 0 };
  const placeLabels = () => {
    tmp.set(0, 0, 0).project(camera);
    nugScreen.x = (tmp.x * 0.5 + 0.5) * W;
    nugScreen.y = (-tmp.y * 0.5 + 0.5) * H;
    const edge = tmp.set(NUG * 0.42, 0, 0).applyQuaternion(camera.quaternion).project(camera);
    nugScreen.rx = Math.abs((edge.x * 0.5 + 0.5) * W - nugScreen.x);
    nugScreen.ry = nugScreen.rx * 0.6;
    planets.forEach((p) => {
      p.holder.getWorldPosition(p.world);
      const v = tmp.copy(p.world).project(camera);
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H;
      const edgeV = p.world.clone().add(right.clone().multiplyScalar(p.d.r * p.holder.scale.x)).project(camera);
      const pr = Math.abs((edgeV.x * 0.5 + 0.5) * W - x);
      const behind = p.world.distanceTo(camera.position) > camera.position.length();
      const dx = (x - nugScreen.x) / nugScreen.rx, dy = (y - nugScreen.y) / nugScreen.ry;
      // Behind the sun, or close enough behind it that the label would sit on the bud: hide it.
      const hidden = behind && dx * dx + dy * dy < 1.9;
      // The label sits on the world's outer side, away from the sun (under it on a phone, or over
      // it when under would run into the words). Near a screen edge it moves to the other side.
      let left = x < nugScreen.x;
      if (!narrow && !left && x + pr + 8 + p.w > W - 8) left = true;
      if (!narrow && left && x - pr - 8 - p.w < 8) left = false;
      const lx = Math.min(W - p.w - 8, Math.max(8, narrow ? x - p.w / 2 : left ? x - pr - 8 - p.w : x + pr + 8));
      const ly = narrow ? (y + pr + 26 > H ? y - pr - 34 : y + pr - 6) : y - 18;
      p.el.style.setProperty("--x", `${lx.toFixed(1)}px`);
      p.el.style.setProperty("--y", `${ly.toFixed(1)}px`);
      p.el.classList.toggle("is-hidden", hidden && p.key !== near);
    });
  };

  let raf = 0, visible = true, onScreen = true;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduced) clock += dt;
    if (intro) {
      // About three and a half seconds from the burst to the hero: the light floods out and
      // settles, the sky turns on, and the camera lingers inside the system, then pulls back
      // out to where the page rests.
      const t = intro.started ? Math.min(1, (now - intro.t0) / 3600) : 0;
      introS = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      flash = intro.started ? 1 - smooth(0, 0.3, t) : 0;
      renderer.toneMappingExposure = 1 + 2.4 * flash;
      skyMat.uniforms.uI.value = SKY * smooth(0.1, 0.55, t);
      coronaMat.uniforms.uI.value = 0.72 * (1 + 1.6 * flash);
      aim(introS);
      if (t >= 1) {
        intro = null;
        flash = 0;
        renderer.toneMappingExposure = 1;
        coronaMat.uniforms.uI.value = 0.72;
        root.classList.remove("is-intro");
        requestAnimationFrame(measureLabels);
      }
    }
    place(dt);
    renderer.render(scene, camera);
    placeLabels();
    needsRender = false;
    const animating = !reduced || state.entering || state.returning || (intro && intro.started);
    if (animating && visible && onScreen) startLoop();
  };
  function startLoop() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const kick = () => { needsRender = true; startLoop(); };

  document.addEventListener("visibilitychange", () => { visible = !document.hidden; if (visible) kick(); });
  if ("IntersectionObserver" in window) new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; if (onScreen) kick(); }).observe(root);
  // A resize redraws on the spot, so the picture never stretches while the next frame is pending.
  window.addEventListener("resize", () => { layout(); place(0); renderer.render(scene, camera); placeLabels(); kick(); });

  const navType = (performance.getEntriesByType("navigation")[0] || {}).type;
  if (navType === "back_forward") playReturn();
  else { try { sessionStorage.removeItem("sw-from"); } catch (e) { /* nothing to clear */ } }
  window.addEventListener("pageshow", (e) => { if (e.persisted) playReturn(); });

  layout();
  Promise.all(pending).then(() => {
    texturesReady = true;
    renderer.render(scene, camera);
    root.classList.add("is-live");
    if (intro && intro.go && !intro.started) intro.go();
    kick();
  });
  kick();
}
