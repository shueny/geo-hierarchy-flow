// 2D floor plan of a hall in React Flow — the same layout the 3D scene draws.
//
// Node positions are simply tile coordinates × PX, so the floor plan maps 1:1 onto
// hallLayout.js. Racks are draggable and snap to the tile grid; cooling units,
// PDUs, the cold aisles and the room outline are fixed background nodes.
// While a rack is dragged, it turns red where it wouldn't fit; dropping there
// sends it back.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, applyNodeChanges } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { canPlace, footprint } from "./hallLayout";
import { useLang } from "../i18n";

export const PX = 44; // pixels per 600 mm tile

const toTile = (p) => ({ x: Math.round(p.x / PX), z: Math.round(p.y / PX) });

// front edge of the rack, in screen terms: +z is down in the plan
const FRONT = ["bottom", "right", "top", "left"];

const RoomNode = ({ data }) => (
  <div className="plan-room" style={{ width: data.w, height: data.h, "--tile": `${PX}px` }}>
    <span className="plan-room__door" style={{ left: data.doorX }} />
  </div>
);

const ZoneNode = ({ data }) => (
  <div className={`plan-zone plan-zone--${data.kind}`} style={{ width: data.w, height: data.h }}>
    <span>{data.label}</span>
  </div>
);

const RackNode = ({ data, selected }) => {
  const { rack: r, rot, invalid, colorMode, w, h } = data;
  const pct = r.uUsed / r.uTotal;
  return (
    <div
      className={`plan-rack plan-rack--${r.status} plan-rack--front-${FRONT[rot]}${selected ? " is-selected" : ""}${invalid ? " is-invalid" : ""}${colorMode === "usage" ? ` plan-rack--usage${pct > 0.55 ? " plan-rack--usage-dark" : ""}` : ""}`}
      style={{ width: w, height: h, "--usage": pct }}
    >
      <span className="plan-rack__name">{r.name}</span>
      <span className="plan-rack__u">{Math.round(pct * 100)}%</span>
    </div>
  );
};

const nodeTypes = { room: RoomNode, zone: ZoneNode, rack: RackNode };

const buildNodes = (layout, racks, selectedId, colorMode, t) => {
  const nodes = [{
    id: "__room", type: "room", position: { x: 0, y: 0 }, draggable: false, selectable: false, zIndex: -2,
    data: { w: layout.width * PX, h: layout.depth * PX, doorX: 5 * PX },
  }];
  layout.coldAisles.forEach((a, i) => nodes.push({
    id: `__cold-${i}`, type: "zone", position: { x: a.x * PX, y: a.z * PX }, draggable: false, selectable: false, zIndex: -1,
    data: { kind: "cold", w: a.w * PX, h: a.d * PX, label: t("hall.coldAisle") },
  }));
  layout.fixtures.forEach((f) => nodes.push({
    id: `__${f.id}`, type: "zone", position: { x: f.x * PX, y: f.z * PX }, draggable: false, selectable: false,
    data: { kind: f.kind, w: f.w * PX, h: f.d * PX, label: f.kind === "crac" ? t("hall.crac") : "PDU" },
  }));
  Object.entries(layout.racks).forEach(([id, p]) => {
    const { w, d } = footprint(p.rot);
    nodes.push({
      id, type: "rack", position: { x: p.x * PX, y: p.z * PX }, selected: id === selectedId,
      data: { rack: racks[id], rot: p.rot, w: w * PX, h: d * PX, colorMode, invalid: false },
    });
  });
  return nodes;
};

const HallFlowInner = ({ layout, racks, selectedId, colorMode, onSelect, onMove, onBlocked, className }) => {
  const { t } = useLang();
  const built = useMemo(
    () => buildNodes(layout, racks, selectedId, colorMode, t),
    [layout, racks, selectedId, colorMode, t],
  );
  // local copy so React Flow can move a node while it is dragged; reset whenever the layout changes
  const [nodes, setNodes] = useState(built);
  useEffect(() => setNodes(built), [built]);

  const onNodesChange = useCallback((changes) => {
    // keep drag movement, drop React Flow's own selection/removal: selection comes from props
    const allowed = changes.filter((c) => c.type === "position" || c.type === "dimensions");
    if (allowed.length) setNodes((ns) => applyNodeChanges(allowed, ns));
  }, []);

  const onNodeDrag = useCallback((_, node) => {
    if (node.type !== "rack") return;
    const pos = { ...toTile(node.position), rot: layout.racks[node.id].rot };
    const invalid = !canPlace(layout, node.id, pos);
    // keep the carried rack above its neighbours, and mark it red where it won't fit
    setNodes((ns) => ns.map((n) => (n.id === node.id && (n.data.invalid !== invalid || n.zIndex !== 10)
      ? { ...n, zIndex: 10, data: { ...n.data, invalid } }
      : n)));
  }, [layout]);

  const onNodeDragStop = useCallback((_, node) => {
    if (node.type !== "rack") return;
    const cur = layout.racks[node.id];
    const pos = { ...toTile(node.position), rot: cur.rot };
    onSelect(node.id);
    if (pos.x === cur.x && pos.z === cur.z) { setNodes(built); return; }
    if (canPlace(layout, node.id, pos)) onMove(node.id, pos);
    else {
      onBlocked();
      setNodes(built); // back to the last valid spot
    }
  }, [layout, built, onMove, onBlocked, onSelect]);

  const extent = [[0, 0], [layout.width * PX, layout.depth * PX]];

  return (
    <div className={`plan ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, n) => onSelect(n.type === "rack" ? n.id : null)}
        onPaneClick={() => onSelect(null)}
        snapToGrid
        snapGrid={[PX, PX]}
        nodeExtent={extent}
        translateExtent={[[-PX * 6, -PX * 6], [layout.width * PX + PX * 6, layout.depth * PX + PX * 6]]}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.3}
        maxZoom={3}
        nodesConnectable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        selectNodesOnDrag={false}
      >
        <Background variant={BackgroundVariant.Lines} gap={PX} color="#e3e7ee" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

const HallFlow = (props) => (
  <ReactFlowProvider>
    <HallFlowInner {...props} />
  </ReactFlowProvider>
);

export default HallFlow;
