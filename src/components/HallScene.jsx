// 3D data hall: raised floor, cut-away walls, hot/cold aisles, cooling units,
// PDUs, overhead cable trays — and racks you can drag to a new tile.
//
// Units are metres (1 tile = TILE = 0.6 m). The floor plan itself (positions,
// collisions) lives in hallLayout.js; this file only draws it and turns pointer
// gestures into "move rack X to tile (x, z)" requests for the parent to apply.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TILE, canPlace, footprint } from "./hallLayout";
import { easeInOutCubic } from "./globeMath";
import { STATUS_COLOR } from "./GlobeMap";

const WALL_H = 3.0;
const RACK_H = 2.0;
const TRAY_Y = 2.45;
const PX_PER_TILE = 64;

// U usage → light-to-dark blue ramp (sequential: more used = darker)
const usageColor = (pct) => new THREE.Color().lerpColors(new THREE.Color("#cfe0ff"), new THREE.Color("#1d4ed8"), pct);

const canvasTexture = (w, h, draw, repeat) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
};

// raised floor: 600 mm tiles with seams; perforated tiles in the cold aisles
const floorTexture = (layout) =>
  canvasTexture(layout.width * PX_PER_TILE, layout.depth * PX_PER_TILE, (ctx, w, h) => {
    ctx.fillStyle = "#d9dde3";
    ctx.fillRect(0, 0, w, h);
    layout.coldAisles.forEach((a) => {
      for (let x = a.x; x < a.x + a.w; x += 1) {
        for (let z = a.z; z < a.z + a.d; z += 1) {
          const px = x * PX_PER_TILE;
          const pz = z * PX_PER_TILE;
          ctx.fillStyle = "#c6ccd5";
          ctx.fillRect(px, pz, PX_PER_TILE, PX_PER_TILE);
          ctx.fillStyle = "#8e98a6";
          for (let i = 8; i < PX_PER_TILE - 4; i += 7) {
            for (let j = 8; j < PX_PER_TILE - 4; j += 7) {
              ctx.beginPath();
              ctx.arc(px + i, pz + j, 1.8, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    });
    ctx.strokeStyle = "#a9b0ba";
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += PX_PER_TILE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let z = 0; z <= h; z += PX_PER_TILE) {
      ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(w, z); ctx.stroke();
    }
  });

// rack front door: perforated steel with a handle
const doorTexture = () =>
  canvasTexture(128, 432, (ctx, w, h) => {
    ctx.fillStyle = "#23272e";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a4049";
    for (let y = 16; y < h - 16; y += 6) {
      for (let x = 12; x < w - 12; x += 6) ctx.fillRect(x, y, 3, 3);
    }
    ctx.fillStyle = "#9aa3ad";
    ctx.fillRect(w - 16, h * 0.42, 5, h * 0.16);
  });

// cooling unit front: horizontal grille
const grilleTexture = () =>
  canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#e9ecef";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b9c0c8";
    for (let y = 40; y < h - 20; y += 8) ctx.fillRect(10, y, w - 20, 3);
    ctx.fillStyle = "#4b5563";
    ctx.fillRect(14, 12, 36, 16);
  });

const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

/**
 * @param layout       { width, depth, racks: {id: {x,z,rot}}, fixtures, coldAisles } (tile units)
 * @param racks        { id: rackData } — status, uUsed, uTotal, name
 * @param selectedId   selected rack id or null
 * @param colorMode    "status" | "usage" — colour of each rack's top panel
 * @param showLabels   show every rack's name, not only hovered/selected
 * @param view         "perspective" | "top" — camera preset (animates on change)
 * @param onSelect     (id | null) => void
 * @param onMove       (id, {x,z,rot}) => void — only called for valid drops
 * @param onBlocked    () => void — a drop landed somewhere it can't go
 */
const HallScene = ({
  layout, racks, selectedId, colorMode = "status", showLabels = false, view = "perspective",
  onSelect, onMove, onBlocked, fallback, className = "",
}) => {
  const hostRef = useRef(null);
  const labelsRef = useRef(null);
  const apiRef = useRef(null);
  const live = useRef({});
  live.current = { layout, racks, selectedId, colorMode, showLabels, onSelect, onMove, onBlocked };
  const webgl = useRef(hasWebGL()).current;

  // —— build the room once per hall (the parent remounts via key) ——
  useEffect(() => {
    if (!webgl) return undefined;
    const host = hostRef.current;
    const labelsHost = labelsRef.current;
    const L = live.current.layout;
    const W = L.width * TILE;
    const D = L.depth * TILE;
    // tile (x, z) → world (centre of the room at the origin)
    const wx = (x) => x * TILE - W / 2;
    const wz = (z) => z * TILE - D / 2;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef1f5");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.1; // never go under the floor
    controls.minDistance = 2;
    controls.maxDistance = Math.max(W, D) * 2.5;

    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };

    // lights: soft sky fill + one shadow-casting "ceiling" light
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa5b1, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(W * 0.3, 9, D * 0.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const half = Math.max(W, D) * 0.7;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 30 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // floor
    const floorTex = keep(floorTexture(L));
    const floor = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(W, D)),
      keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // floor edge, so the raised floor reads as a slab
    const slab = new THREE.Mesh(keep(new THREE.BoxGeometry(W, 0.3, D)), keep(new THREE.MeshStandardMaterial({ color: "#b8bec7" })));
    slab.position.y = -0.151;
    scene.add(slab);

    // walls face inward with FrontSide only: the ones between camera and room
    // are back-facing and get culled, giving a dollhouse cut-away from any angle
    const wallMat = keep(new THREE.MeshStandardMaterial({ color: "#f4f5f7", roughness: 0.95 }));
    const wallGeoW = keep(new THREE.PlaneGeometry(W, WALL_H));
    const wallGeoD = keep(new THREE.PlaneGeometry(D, WALL_H));
    [
      [wallGeoW, 0, -D / 2, 0],
      [wallGeoW, 0, D / 2, Math.PI],
      [wallGeoD, -W / 2, 0, Math.PI / 2],
      [wallGeoD, W / 2, 0, -Math.PI / 2],
    ].forEach(([g, x, z, ry]) => {
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(x, WALL_H / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      scene.add(m);
    });
    // entry door on the front wall, in the entry aisle
    const door = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.2, 2.2)), keep(new THREE.MeshStandardMaterial({ color: "#8a94a3" })));
    door.position.set(wx(5.5), 1.1, D / 2 - 0.01);
    door.rotation.y = Math.PI;
    scene.add(door);

    // fixtures: CRAC units and PDUs
    const grille = keep(grilleTexture());
    const cracSide = keep(new THREE.MeshStandardMaterial({ color: "#e3e6ea", roughness: 0.6 }));
    const cracFront = keep(new THREE.MeshStandardMaterial({ map: grille, roughness: 0.6 }));
    const pduMat = keep(new THREE.MeshStandardMaterial({ color: "#4a515b", roughness: 0.5, metalness: 0.2 }));
    L.fixtures.forEach((f) => {
      const w = f.w * TILE;
      const d = f.d * TILE;
      const h = f.kind === "crac" ? 1.95 : 1.8;
      const geo = keep(new THREE.BoxGeometry(w - 0.04, h, d - 0.04));
      // CRAC grille faces into the room (+x)
      const mats = f.kind === "crac" ? [cracFront, cracSide, cracSide, cracSide, cracSide, cracSide] : pduMat;
      const m = new THREE.Mesh(geo, mats);
      m.position.set(wx(f.x) + w / 2, h / 2, wz(f.z) + d / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    });

    // cold-aisle containment roof (glass) + overhead cable trays over every row
    const glass = keep(new THREE.MeshStandardMaterial({ color: "#bfe3ff", transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }));
    L.coldAisles.forEach((a) => {
      const roof = new THREE.Mesh(keep(new THREE.BoxGeometry((a.w - 1) * TILE, 0.02, a.d * TILE)), glass);
      roof.position.set(wx(a.x) + ((a.w - 1) * TILE) / 2, RACK_H + 0.01, wz(a.z) + (a.d * TILE) / 2);
      scene.add(roof);
    });
    const trayMat = keep(new THREE.MeshStandardMaterial({ color: "#f2c94c", roughness: 0.5, metalness: 0.3 }));
    const rowsZ = [...new Set(Object.values(L.racks).map((p) => p.z))];
    rowsZ.forEach((z) => {
      const xs = Object.values(L.racks).filter((p) => p.z === z).map((p) => p.x);
      const x0 = Math.min(...xs);
      const len = (Math.max(...xs) - x0 + 1) * TILE;
      const tray = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 0.08, 0.3)), trayMat);
      tray.position.set(wx(x0) + len / 2, TRAY_Y, wz(z) + TILE);
      tray.castShadow = true;
      scene.add(tray);
    });

    // racks
    const doorTex = keep(doorTexture());
    const bodyGeo = keep(new THREE.BoxGeometry(TILE - 0.02, RACK_H, TILE * 2 - 0.02));
    const doorGeo = keep(new THREE.PlaneGeometry(TILE - 0.06, RACK_H - 0.08));
    const capGeo = keep(new THREE.BoxGeometry(TILE - 0.04, 0.03, TILE * 2 - 0.04));
    const ledGeo = keep(new THREE.BoxGeometry(0.3, 0.025, 0.01));
    const outlineGeo = keep(new THREE.EdgesGeometry(new THREE.BoxGeometry(TILE + 0.04, RACK_H + 0.04, TILE * 2 + 0.04)));
    const outlineMat = keep(new THREE.LineBasicMaterial({ color: "#2f6bff" }));
    const doorMat = keep(new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.55, metalness: 0.35 }));

    const rackObjs = {};
    Object.keys(L.racks).forEach((id) => {
      const data = live.current.racks[id];
      const g = new THREE.Group();
      g.userData.rackId = id;
      const bodyMat = keep(new THREE.MeshStandardMaterial({ color: "#2b3038", roughness: 0.6, metalness: 0.3 }));
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = RACK_H / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      const front = new THREE.Mesh(doorGeo, doorMat);
      front.position.set(0, RACK_H / 2, TILE - 0.005);
      const capMat = keep(new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.5 }));
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = RACK_H + 0.016;
      const ledMat = keep(new THREE.MeshStandardMaterial({ color: STATUS_COLOR[data.status], emissive: STATUS_COLOR[data.status], emissiveIntensity: 1.4 }));
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0, RACK_H - 0.12, TILE + 0.005);
      const outline = new THREE.LineSegments(outlineGeo, outlineMat);
      outline.position.y = RACK_H / 2;
      outline.visible = false;
      g.add(body, front, cap, led, outline);
      scene.add(g);

      const label = document.createElement("div");
      label.className = "hall-label";
      label.textContent = data.name;
      labelsHost.appendChild(label);
      rackObjs[id] = { g, body, bodyMat, cap, capMat, outline, label };
    });

    // drop marker: shows the footprint under a dragged rack, green or red
    const markerMat = keep(new THREE.MeshBasicMaterial({ color: "#2ab57d", transparent: true, opacity: 0.35, depthWrite: false }));
    const marker = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), markerMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.005;
    marker.visible = false;
    scene.add(marker);

    const placeGroup = (g, pos) => {
      const { w, d } = footprint(pos.rot);
      g.position.set(wx(pos.x) + (w * TILE) / 2, 0, wz(pos.z) + (d * TILE) / 2);
      g.rotation.y = (pos.rot * Math.PI) / 2;
    };
    const placeMarker = (pos, ok) => {
      const { w, d } = footprint(pos.rot);
      marker.scale.set(w * TILE, d * TILE, 1);
      marker.position.x = wx(pos.x) + (w * TILE) / 2;
      marker.position.z = wz(pos.z) + (d * TILE) / 2;
      markerMat.color.set(ok ? "#2ab57d" : "#e5484d");
      marker.visible = true;
    };

    const syncLayout = () => {
      const { layout: lay } = live.current;
      Object.entries(rackObjs).forEach(([id, o]) => lay.racks[id] && placeGroup(o.g, lay.racks[id]));
    };
    const syncStyle = () => {
      const { racks: data, selectedId: sel, colorMode: mode } = live.current;
      Object.entries(rackObjs).forEach(([id, o]) => {
        const r = data[id];
        o.capMat.color.set(mode === "usage" ? usageColor(r.uUsed / r.uTotal) : STATUS_COLOR[r.status]);
        o.outline.visible = id === sel;
      });
    };
    syncLayout();
    syncStyle();

    // camera presets
    let tween = null;
    const presets = () => {
      const span = Math.max(W, D);
      return {
        perspective: { pos: new THREE.Vector3(W * 0.55, span * 0.85, D * 0.95), target: new THREE.Vector3(0, 0.6, 0) },
        top: { pos: new THREE.Vector3(0, span * 1.45, 0.01), target: new THREE.Vector3(0, 0, 0) },
      };
    };
    const setView = (name, animate = true) => {
      const p = presets()[name] || presets().perspective;
      if (!animate) {
        camera.position.copy(p.pos);
        controls.target.copy(p.target);
        return;
      }
      tween = { t0: performance.now(), dur: 900, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos: p.pos, toTarget: p.target };
    };
    setView("perspective", false);

    // —— pointer: click selects, drag moves (snapped to tiles) ——
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    // drag on the plane of the rack tops, so the part you grabbed stays under the cursor
    const grabPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -RACK_H);
    const hitPoint = new THREE.Vector3();
    const bodies = Object.values(rackObjs).map((o) => o.body);
    const setRay = (ev) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };
    const rackUnder = () => {
      const hit = raycaster.intersectObjects(bodies)[0];
      return hit ? hit.object.parent.userData.rackId : null;
    };
    const grabTile = () => {
      if (!raycaster.ray.intersectPlane(grabPlane, hitPoint)) return null;
      return { x: (hitPoint.x + W / 2) / TILE, z: (hitPoint.z + D / 2) / TILE };
    };

    let press = null; // { id, start:[x,y], grab:{dx,dz}, dragging, pos, ok }
    let hoverId = null;
    const el = renderer.domElement;

    const onDown = (ev) => {
      if (ev.button !== 0) return;
      setRay(ev);
      const id = rackUnder();
      const tile = grabTile();
      press = { id, start: [ev.clientX, ev.clientY], dragging: false };
      if (id && tile) {
        const p = live.current.layout.racks[id];
        press.grab = { dx: p.x - tile.x, dz: p.z - tile.z };
        controls.enabled = false; // pressing a rack never orbits the camera
        el.setPointerCapture(ev.pointerId);
      }
    };
    const onMovePointer = (ev) => {
      setRay(ev);
      if (press && press.id && press.grab) {
        const moved = Math.hypot(ev.clientX - press.start[0], ev.clientY - press.start[1]) > 4;
        if (!press.dragging && moved) press.dragging = true;
        if (press.dragging) {
          const tile = grabTile();
          if (!tile) return;
          const cur = live.current.layout.racks[press.id];
          const pos = { x: Math.round(tile.x + press.grab.dx), z: Math.round(tile.z + press.grab.dz), rot: cur.rot };
          const ok = canPlace(live.current.layout, press.id, pos);
          press.pos = pos;
          press.ok = ok;
          placeGroup(rackObjs[press.id].g, pos);
          rackObjs[press.id].g.position.y = 0.06; // lifted while carried
          placeMarker(pos, ok);
          el.style.cursor = "grabbing";
        }
        return;
      }
      hoverId = rackUnder();
      el.style.cursor = hoverId ? "grab" : "";
    };
    const onUp = (ev) => {
      if (!press) return;
      const p = press;
      press = null;
      controls.enabled = true;
      marker.visible = false;
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
      el.style.cursor = "";
      const cb = live.current;
      if (p.dragging && p.id) {
        const cur = cb.layout.racks[p.id];
        const changed = p.pos && (p.pos.x !== cur.x || p.pos.z !== cur.z);
        if (changed && p.ok) {
          rackObjs[p.id].g.position.y = 0; // stays where it was dropped; the new layout confirms it
          cb.onMove?.(p.id, p.pos);
        } else {
          if (changed) cb.onBlocked?.();
          syncLayout(); // snap back to the last valid spot
        }
        cb.onSelect?.(p.id);
        return;
      }
      if (Math.hypot(ev.clientX - p.start[0], ev.clientY - p.start[1]) <= 4) cb.onSelect?.(p.id || null);
    };
    const onLeave = () => { hoverId = null; };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMovePointer);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const v = new THREE.Vector3();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (tween) {
        const t = Math.min(1, (performance.now() - tween.t0) / tween.dur);
        const k = easeInOutCubic(t);
        camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
        camera.lookAt(controls.target);
        if (t >= 1) tween = null;
      } else {
        controls.update();
      }
      const w = host.clientWidth;
      const h = host.clientHeight;
      const { selectedId: sel, showLabels: all } = live.current;
      const dragId = press && press.dragging ? press.id : null;
      Object.entries(rackObjs).forEach(([id, o]) => {
        o.bodyMat.emissive.set(id === hoverId || id === dragId ? "#14264d" : "#000000");
        v.set(o.g.position.x, RACK_H + 0.25, o.g.position.z).project(camera);
        const onScreen = v.z < 1;
        o.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
        o.label.classList.toggle("is-visible", onScreen && (all || id === sel || id === hoverId || id === dragId));
        o.label.classList.toggle("is-selected", id === sel);
      });
      renderer.render(scene, camera);
    };
    tick();

    apiRef.current = { syncLayout, syncStyle, setView };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMovePointer);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      Object.values(rackObjs).forEach((o) => o.label.remove());
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      el.remove();
      apiRef.current = null;
    };
    // the scene is built once per hall; later prop changes go through apiRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { apiRef.current?.syncLayout(); }, [layout]);
  useEffect(() => { apiRef.current?.syncStyle(); }, [selectedId, colorMode, racks]);
  useEffect(() => { apiRef.current?.setView(view); }, [view]);

  if (!webgl) return <div className={`hall-scene hall-scene--fallback ${className}`}>{fallback}</div>;
  return (
    <div className={`hall-scene ${className}`}>
      <div ref={hostRef} className="hall-scene__canvas" />
      <div ref={labelsRef} className="hall-scene__labels" />
    </div>
  );
};

export default HallScene;
