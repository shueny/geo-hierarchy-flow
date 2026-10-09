// A small replacement for R3F's <Canvas>, built on its documented `createRoot` API.
//
// Why: <Canvas> calls `extend(THREE)`, which registers the WHOLE three namespace for JSX and
// stops the bundler from tree-shaking three at all (+~430 kB). R3F's own source says to use
// createRoot to avoid that. Here only the classes this scene declares in JSX are registered
// (hall3d/elements.js — and read its note about ColorManagement).
//
// What it keeps from <Canvas>: size tracking, pointer events, the props we use. What it drops:
// Suspense, a context bridge into the scene (nothing inside reads app context), and R3F's
// error rethrow — a failing scene shows `fallback` instead of unmounting the whole app.
import { Component, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot, events, extend, unmountComponentAtNode } from "@react-three/fiber";
import useMeasure from "react-use-measure";
import { ELEMENTS } from "./elements";

extend(ELEMENTS);

class Boundary extends Component {
  componentDidCatch(error) {
    console.error("[3D scene]", error);
    this.props.onError(error);
  }

  render() {
    return this.props.failed ? null : this.props.children;
  }
}

/** Props are the subset of <Canvas> this app uses: gl/shadows/dpr/frameloop/camera/onPointerMissed. */
const SlimCanvas = ({ children, fallback, onPointerMissed, ...config }) => {
  const [measureRef, rect] = useMeasure({ scroll: true, debounce: { scroll: 50, resize: 0 } });
  const [failed, setFailed] = useState(false);
  const divRef = useRef(null);
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const missed = useRef(onPointerMissed);
  missed.current = onPointerMissed; // always call the latest handler without reconfiguring the root

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rect.width <= 0 || rect.height <= 0) return;
    if (!rootRef.current) rootRef.current = createRoot(canvas);
    rootRef.current.configure({
      ...config,
      events,
      size: rect,
      onPointerMissed: (e) => missed.current?.(e),
      onCreated: (state) => state.events.connect?.(divRef.current),
    });
    rootRef.current.render(
      <Boundary failed={failed} onError={() => setFailed(true)}>{children}</Boundary>,
    );
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => { rootRef.current = null; unmountComponentAtNode(canvas); };
  }, []);

  if (failed) return fallback;
  return (
    <div ref={divRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <div ref={measureRef} style={{ width: "100%", height: "100%" }}>
        <canvas ref={canvasRef} style={{ display: "block" }} />
      </div>
    </div>
  );
};

export default SlimCanvas;
