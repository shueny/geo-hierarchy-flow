// 3D data hall in react-three-fiber (see docs/decisions/0001-react-three-fiber-for-3d-scenes.md).
//
// The room is declared in JSX (hall3d/Room, hall3d/Rack); this file owns what changes:
// pointer gestures, drag state, hover, and the camera. The floor plan itself (positions,
// collisions) lives in hallLayout.js; this scene only draws it and turns gestures into
// "move rack X to tile (x, z)" requests for the parent.
//
// Gestures:
//   click                 select a rack (or nothing, on empty floor)
//   drag, view mode       orbit the whole room — anywhere, racks included
//   drag, edit mode       on a rack: move it (camera holds still); on the floor: orbit
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { TILE, canPlace, footprint } from "./hallLayout";
import { easeInOutCubic } from "./globeMath";
import { hasWebGL } from "./webgl";
import { Room } from "./hall3d/Room";
import { Rack } from "./hall3d/Rack";
import SlimCanvas from "./hall3d/SlimCanvas";
import { useHallAssets } from "./hall3d/useHallAssets";
import { cameraPreset, rackTransform, rayToTile, roomFrame } from "./hall3d/units";

const DRAG_THRESHOLD_PX = 4; // below this a press is a click, not a drag

// Footprint under a rack being carried: green where it fits, red where it doesn't.
const DropMarker = ({ drag, frame }) => {
  const { w, d } = footprint(drag.pos.rot);
  const t = rackTransform(drag.pos, frame);
  return (
    <mesh position={[t.x, 0.005, t.z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[w * TILE, d * TILE]} />
      <meshBasicMaterial color={drag.ok ? "#2ab57d" : "#e5484d"} transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
};

// Animates to the "3D" / "top" presets. OrbitControls keeps ownership of the camera otherwise.
const CameraRig = ({ view, frame, controlsRef }) => {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const tween = useRef(null);
  const placed = useRef(false);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const preset = cameraPreset(view, frame);
    if (!placed.current) {
      placed.current = true;
      camera.position.copy(preset.pos);
      controls.target.copy(preset.target);
      controls.update();
      invalidate();
      return;
    }
    // Flush leftover orbit inertia first, or momentum from a quick spin would kick in
    // after the tween and skew the preset.
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    tween.current = {
      t0: performance.now(), dur: 900,
      fromPos: camera.position.clone(), fromTarget: controls.target.clone(),
      toPos: preset.pos, toTarget: preset.target,
    };
    invalidate();
  }, [view, frame, camera, controlsRef, invalidate]);

  useFrame(() => {
    const tw = tween.current;
    const controls = controlsRef.current;
    if (!tw || !controls) return;
    const t = Math.min(1, (performance.now() - tw.t0) / tw.dur);
    const k = easeInOutCubic(t);
    camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
    controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
    camera.lookAt(controls.target);
    if (t >= 1) tween.current = null;
    else invalidate(); // frameloop is "demand": keep asking for frames while animating
  });
  return null;
};

const Scene = ({ layout, racks, selectedId, colorMode, showLabels, view, editable, onSelect, onMove, onBlocked }) => {
  const { width, depth } = layout;
  const frame = useMemo(() => roomFrame({ width, depth }), [width, depth]);
  const assets = useHallAssets(layout);
  const controls = useThree((s) => s.controls);
  const gl = useThree((s) => s.gl);
  const controlsRef = useRef();
  const sunRef = useRef();
  const press = useRef(null); // gesture in progress: { id, start, grab, dragging, pos, ok }
  const [hoverId, setHoverId] = useState(null);
  const [drag, setDrag] = useState(null); // { id, pos, ok, dropped } — what the carried rack shows

  // a new layout means the drop (if any) has been applied: stop overriding the rack's position
  useEffect(() => setDrag(null), [layout]);

  // the shadow camera is configured through props after construction
  const half = Math.max(frame.W, frame.D) * 0.7;
  useLayoutEffect(() => sunRef.current.shadow.camera.updateProjectionMatrix(), [half]);

  // cursor on the canvas only (not the whole page)
  const carrying = !!drag && !drag.dropped;
  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = carrying ? "grabbing" : hoverId ? (editable ? "grab" : "pointer") : "";
    return () => { el.style.cursor = ""; };
  }, [gl, carrying, hoverId, editable]);

  // The browser can take a drag away without a pointerup (pointercancel: window switch, system
  // gesture; lostpointercapture). R3F does not forward these to object handlers, so listen on the
  // canvas itself — otherwise a rack drag that never ends leaves the camera locked (enabled = false).
  useEffect(() => {
    const el = gl.domElement;
    const abort = () => {
      if (!press.current?.grab) return; // only rack drags hold the camera
      press.current = null;
      if (controls) controls.enabled = true;
      setDrag(null);
    };
    el.addEventListener("pointercancel", abort);
    el.addEventListener("lostpointercapture", abort);
    return () => {
      el.removeEventListener("pointercancel", abort);
      el.removeEventListener("lostpointercapture", abort);
    };
  }, [gl, controls]);

  const endPress = (e) => {
    const pr = press.current;
    press.current = null;
    if (controls) controls.enabled = true;
    if (pr?.grab) {
      try { e.target.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    return pr;
  };

  const down = (e, id) => {
    e.stopPropagation(); // only the nearest rack under the pointer reacts
    if (e.button !== 0) return; // right-drag pans: leave it to OrbitControls
    setDrag(null);
    press.current = { id, start: [e.clientX, e.clientY], grab: null, dragging: false, pos: null, ok: false };
    if (!editable) return; // view mode: the press falls through and orbits the room
    const tile = rayToTile(e.ray, frame);
    if (!tile) return;
    const p = layout.racks[id];
    press.current.grab = { dx: p.x - tile.x, dz: p.z - tile.z };
    // OrbitControls listens on the same element, registered after R3F's own handlers, so this
    // runs first and the camera never starts orbiting.
    if (controls) controls.enabled = false;
    e.target.setPointerCapture(e.pointerId);
  };

  const move = (e, id) => {
    const pr = press.current;
    if (!pr || pr.id !== id || !pr.grab) return;
    e.stopPropagation();
    if (!pr.dragging && Math.hypot(e.clientX - pr.start[0], e.clientY - pr.start[1]) <= DRAG_THRESHOLD_PX) return;
    pr.dragging = true;
    const tile = rayToTile(e.ray, frame);
    if (!tile) return;
    const pos = { x: Math.round(tile.x + pr.grab.dx), z: Math.round(tile.z + pr.grab.dz), rot: layout.racks[id].rot };
    pr.pos = pos;
    pr.ok = canPlace(layout, id, pos);
    // re-render only when the snapped tile changes
    setDrag((d) => (d && d.id === id && d.pos.x === pos.x && d.pos.z === pos.z ? d : { id, pos, ok: pr.ok, dropped: false }));
  };

  const up = (e, id) => {
    const pr = press.current;
    if (!pr || pr.id !== id) return;
    e.stopPropagation();
    endPress(e);
    if (!pr.dragging) return; // a plain click: onClick selects
    const cur = layout.racks[id];
    const changed = !!pr.pos && (pr.pos.x !== cur.x || pr.pos.z !== cur.z);
    if (changed && pr.ok) {
      setDrag((d) => d && { ...d, dropped: true }); // stay where it was dropped until the new layout arrives
      onMove?.(id, pr.pos);
    } else {
      if (changed) onBlocked?.();
      setDrag(null); // back to the last valid spot
    }
    onSelect?.(id);
  };

  const bind = (id) => ({
    onPointerDown: (e) => down(e, id),
    onPointerMove: (e) => move(e, id),
    onPointerUp: (e) => up(e, id),
    // a click that is really the end of a drag (or an orbit) must not select
    onClick: (e) => { e.stopPropagation(); if (e.delta <= DRAG_THRESHOLD_PX) onSelect?.(id); },
    onPointerOver: (e) => { e.stopPropagation(); setHoverId(id); },
    onPointerOut: () => setHoverId((h) => (h === id ? null : h)),
  });

  const dragId = carrying ? drag.id : null;
  return (
    <>
      <color attach="background" args={["#eef1f5"]} />
      <hemisphereLight args={[0xffffff, 0x9aa5b1, 1.1]} />
      <directionalLight
        ref={sunRef}
        position={[frame.W * 0.3, 9, frame.D * 0.4]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />

      <Room layout={layout} frame={frame} assets={assets} />

      {Object.keys(layout.racks).map((id) => {
        const pos = drag && drag.id === id ? drag.pos : layout.racks[id];
        return (
          <Rack
            key={id}
            data={racks[id]}
            transform={rackTransform(pos, frame)}
            lifted={dragId === id}
            selected={id === selectedId}
            hovered={id === hoverId || id === dragId}
            colorMode={colorMode}
            labelVisible={showLabels || id === selectedId || id === hoverId || id === dragId}
            assets={assets}
            handlers={bind(id)}
          />
        );
      })}
      {carrying && <DropMarker drag={drag} frame={frame} />}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI / 2.1} // never go under the floor
        minDistance={2}
        maxDistance={Math.max(frame.W, frame.D) * 2.5}
      />
      <CameraRig view={view} frame={frame} controlsRef={controlsRef} />
    </>
  );
};

/**
 * @param layout       { width, depth, racks: {id: {x,z,rot}}, fixtures, coldAisles, trays } (tile units)
 * @param racks        { id: rackData } — status, uUsed, uTotal, name
 * @param selectedId   selected rack id or null
 * @param colorMode    "status" | "usage" — colour of each rack's top panel
 * @param showLabels   show every rack's name, not only hovered/selected
 * @param view         "perspective" | "top" — camera preset (animates on change)
 * @param editable     false: every drag orbits the whole room (click still selects);
 *                     true: dragging a rack moves it, dragging the floor still orbits
 * @param onSelect     (id | null) => void
 * @param onMove       (id, {x,z,rot}) => void — only called for valid drops
 * @param onBlocked    () => void — a drop landed somewhere it can't go
 * @param fallback     content shown when WebGL is unavailable
 */
const HallScene = ({ fallback, className = "", onSelect, ...scene }) => {
  const handleMissed = useCallback(() => onSelect?.(null), [onSelect]);
  if (!hasWebGL()) return <div className={`hall-scene hall-scene--fallback ${className}`}>{fallback}</div>;
  return (
    <div className={`hall-scene ${className}`}>
      {/* "demand": render only when something changed — the room is static between gestures */}
      <SlimCanvas
        shadows="soft"
        dpr={[1, 2]}
        frameloop="demand"
        camera={{ fov: 45, near: 0.1, far: 200 }}
        onPointerMissed={handleMissed}
        fallback={fallback}
      >
        <Scene onSelect={onSelect} {...scene} />
      </SlimCanvas>
    </div>
  );
};

export default HallScene;
