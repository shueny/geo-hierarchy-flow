// WebGL globe that unfolds into a flat map.
//
// One 256×128 grid mesh; each vertex's uv is its (lon, lat). The vertex shader
// mixes the sphere position s(lon, lat) with the plane position p = (lon, lat, 1)
// by uMorph — 0 is the globe, 1 is the flat map — so the switch is one continuous
// animation instead of swapping two maps. Country borders come from world-atlas
// (Natural Earth 110m), drawn into an equirectangular canvas used as the texture.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import { LON0, surfacePoint, unwrapRing, easeInOutCubic } from "./globeMath";
import { STATUS_COLOR } from "./colors";
import { hasWebGL } from "./webgl";

const FOV = 40;
const GLOBE_DIST = 3.4;
const FLAT_W = Math.PI * 2;

const buildTexture = (highlight) => {
  const W = 4096;
  const H = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#dfe8f3";
  ctx.fillRect(0, 0, W, H);

  // graticule every 30°
  ctx.strokeStyle = "rgba(80,110,150,0.18)";
  ctx.lineWidth = 2;
  for (let lng = -180; lng <= 180; lng += 30) {
    const x = ((lng + 180) / 360) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  const toXY = ([lng, lat]) => [((lng + 180) / 360) * W, ((90 - lat) / 180) * H];
  feature(world, world.objects.countries).features.forEach((f) => {
    const g = f.geometry;
    const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
    ctx.beginPath();
    polys.forEach((rings) => rings.forEach((ring) => {
      const pts = unwrapRing(ring).map(toXY);
      // draw each ring three times (shifted ±360°) so unwrapped rings still cover both edges
      [-W, 0, W].forEach((dx) => {
        pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x + dx, y) : ctx.lineTo(x + dx, y)));
        ctx.closePath();
      });
    }));
    ctx.fillStyle = highlight.has(f.id) ? "#c9d7fb" : "#ffffff";
    ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(90,110,140,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

const vertexShader = /* glsl */ `
  uniform float uMorph;
  varying vec2 vUv;
  varying vec3 vNormal;
  const float PI = 3.141592653589793;
  void main() {
    float lon = (uv.x - 0.5) * 2.0 * PI;
    float lat = (uv.y - 0.5) * PI;
    vec3 s = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
    vec3 p = vec3(lon, lat, 1.0);
    vNormal = normalize(mix(s, vec3(0.0, 0.0, 1.0), uMorph));
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(s, p, uMorph), 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uLon0;
  uniform float uMorph;
  varying vec2 vUv;
  varying vec3 vNormal;
  const float PI = 3.141592653589793;
  void main() {
    vec4 c = texture2D(uMap, vec2(fract(vUv.x + uLon0 / (2.0 * PI)), vUv.y));
    float light = 0.72 + 0.28 * max(dot(vNormal, normalize(vec3(0.35, 0.45, 1.0))), 0.0);
    gl_FragColor = vec4(c.rgb * mix(light, 1.0, uMorph), 1.0);
  }
`;

/**
 * @param mode       "3d" | "2d"
 * @param sites      [{ id, lat, lng, status }]
 * @param labelOf    (site) => string — label text, re-applied when it changes (language switch)
 * @param highlight  Set of ISO numeric country ids to tint
 * @param selectedId selected site (enlarged, label pinned)
 * @param focusId    site to fly the camera to (flies on change)
 * @param onSelect   (siteId) => void
 * @param fallback   text shown when WebGL is unavailable
 */
const GlobeMap = ({ mode = "3d", sites, labelOf, highlight, selectedId, focusId, onSelect, fallback, className = "" }) => {
  const hostRef = useRef(null);
  const labelsRef = useRef(null);
  const apiRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const stateRef = useRef({ selectedId, hoverId: null });
  stateRef.current.selectedId = selectedId;
  const webgl = useRef(hasWebGL()).current;

  useEffect(() => {
    if (!webgl) return undefined;
    const host = hostRef.current;
    const labelsHost = labelsRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
    camera.position.set(0, 0.35, GLOBE_DIST);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.4;
    controls.maxDistance = 8;
    controls.screenSpacePanning = true;

    const texture = buildTexture(highlight || new Set());
    const uniforms = { uMorph: { value: 0 }, uLon0: { value: LON0 }, uMap: { value: texture } };
    const geometry = new THREE.PlaneGeometry(1, 1, 256, 128);
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide });
    const earth = new THREE.Mesh(geometry, material);
    earth.frustumCulled = false; // the bounding sphere is the 1×1 plane's, wrong once displaced
    scene.add(earth);

    const markerGeo = new THREE.SphereGeometry(0.018, 16, 12);
    const markers = sites.map((s) => {
      const mat = new THREE.MeshBasicMaterial({ color: STATUS_COLOR[s.status] || STATUS_COLOR.normal });
      const mesh = new THREE.Mesh(markerGeo, mat);
      mesh.userData.siteId = s.id;
      scene.add(mesh);
      const label = document.createElement("div");
      label.className = "globe-label";
      labelsHost.appendChild(label);
      return { site: s, mesh, label };
    });

    let morph = 0;
    let tween = null;
    // Render on demand (docs/decisions/0003-…): the loop below runs only while something moves
    // (a tween, a drag, damping inertia); everything else that changes what is on screen calls wake().
    let raf = 0;
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

    const startTween = ({ toMorph = morph, toPos, toTarget, dur = 1200 }) => {
      tween = {
        t0: performance.now(), dur,
        fromMorph: morph, toMorph,
        fromPos: camera.position.clone(), toPos: toPos || camera.position.clone(),
        fromTarget: controls.target.clone(), toTarget: toTarget || controls.target.clone(),
      };
      wake();
    };

    // camera distance at which the whole 2π-wide plane fits the viewport
    const flatDist = () => (FLAT_W / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / camera.aspect * 1.04;

    const setMode = (m) => {
      if (m === "2d") {
        controls.enableRotate = false;
        controls.enablePan = true;
        startTween({ toMorph: 1, toPos: new THREE.Vector3(0, 0, 1 + flatDist()), toTarget: new THREE.Vector3(0, 0, 1) });
      } else {
        controls.enableRotate = true;
        controls.enablePan = false;
        startTween({ toMorph: 0, toPos: new THREE.Vector3(0, 0.35, GLOBE_DIST), toTarget: new THREE.Vector3(0, 0, 0) });
      }
    };

    const focus = (siteId) => {
      const s = sites.find((x) => x.id === siteId);
      if (!s) return;
      const target = tween ? tween.toMorph : morph;
      const { pos } = surfacePoint(s.lat, s.lng, target);
      if (target > 0.5) {
        startTween({ toPos: new THREE.Vector3(pos.x, pos.y, 2.6), toTarget: new THREE.Vector3(pos.x, pos.y, 1), dur: 900 });
      } else {
        startTween({ toPos: pos.clone().normalize().multiplyScalar(2.2), toTarget: new THREE.Vector3(0, 0, 0), dur: 900 });
      }
    };

    const setLabels = (fn) => markers.forEach((m) => { m.label.textContent = fn ? fn(m.site) : m.site.id; });

    // picking — a drag is not a click
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downAt = null;
    const pick = (ev) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(markers.filter((m) => m.mesh.visible).map((m) => m.mesh))[0];
      return hit ? hit.object.userData.siteId : null;
    };
    const onDown = (ev) => { downAt = [ev.clientX, ev.clientY]; };
    const onUp = (ev) => {
      if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
      const id = pick(ev);
      if (id && onSelectRef.current) onSelectRef.current(id);
    };
    const onMove = (ev) => {
      const id = pick(ev);
      renderer.domElement.style.cursor = id ? "pointer" : "";
      if (id !== stateRef.current.hoverId) { stateRef.current.hoverId = id; wake(); }
    };
    const onLeave = () => {
      if (stateRef.current.hoverId !== null) { stateRef.current.hoverId = null; wake(); }
    };
    for (const type of ["start", "change", "end"]) controls.addEventListener(type, wake);
    const el = renderer.domElement;
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      wake(); // setSize clears the canvas
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const v = new THREE.Vector3();
    const tick = () => {
      raf = 0;
      let moving = false; // ask for another frame only while this one changed the view
      if (tween) {
        moving = true;
        const t = Math.min(1, (performance.now() - tween.t0) / tween.dur);
        const k = easeInOutCubic(t);
        morph = THREE.MathUtils.lerp(tween.fromMorph, tween.toMorph, k);
        // interpolate direction and distance separately so the camera never cuts through the globe
        const fromLen = tween.fromPos.length();
        const toLen = tween.toPos.length();
        camera.position.copy(tween.fromPos).lerp(tween.toPos, k);
        if (camera.position.lengthSq() > 1e-6) camera.position.setLength(THREE.MathUtils.lerp(fromLen, toLen, k));
        controls.target.copy(tween.fromTarget).lerp(tween.toTarget, k);
        if (t >= 1) tween = null;
      } else {
        moving = controls.update();
      }
      uniforms.uMorph.value = morph;
      camera.lookAt(controls.target);

      const w = host.clientWidth;
      const h = host.clientHeight;
      const { selectedId: sel, hoverId } = stateRef.current;
      markers.forEach(({ site: s, mesh, label }) => {
        const { pos, normal } = surfacePoint(s.lat, s.lng, morph, 0.012);
        mesh.position.copy(pos);
        const facing = v.copy(camera.position).sub(pos).dot(normal) > 0;
        mesh.visible = facing;
        const active = s.id === sel || s.id === hoverId;
        mesh.scale.setScalar(active ? 1.8 : 1);
        v.copy(pos).project(camera);
        label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
        label.classList.toggle("is-visible", facing && active);
        label.classList.toggle("is-selected", s.id === sel);
      });
      renderer.render(scene, camera);
      if (moving) wake();
    };
    resize(); // sizes the canvas and asks for the first frame

    apiRef.current = { setMode, focus, setLabels, wake };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      markers.forEach(({ mesh, label }) => { mesh.material.dispose(); label.remove(); });
      markerGeo.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      el.remove();
      apiRef.current = null;
    };
    // sites/highlight are static demo data; the scene is built once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { apiRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { if (focusId) apiRef.current?.focus(focusId); }, [focusId]);
  useEffect(() => { apiRef.current?.setLabels(labelOf); }, [labelOf]);
  useEffect(() => { apiRef.current?.wake(); }, [selectedId]); // the enlarged marker is drawn by the next frame

  if (!webgl) return <div className={`globe globe--fallback ${className}`}>{fallback}</div>;
  return (
    <div className={`globe ${className}`}>
      <div ref={hostRef} className="globe__canvas" />
      <div ref={labelsRef} className="globe__labels" />
    </div>
  );
};

export default GlobeMap;
