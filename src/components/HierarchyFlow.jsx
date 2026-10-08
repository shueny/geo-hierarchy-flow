// React Flow view of the site hierarchy. Layout comes from hierarchyLayout.js;
// React Flow handles pan/zoom, rendering and node clicks.
import { useEffect, useMemo } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { buildGraph } from "./hierarchyLayout";
import { countRacks } from "../data/sites";
import { useLang } from "../i18n";
import Icon from "./Icon";

const ICON = { country: "globe", site: "building", room: "server", rack: "rack" };

const subtitle = (kind, e, t) => {
  if (kind === "country") return t("count.sites", { n: e.sites.length });
  if (kind === "site") return t("count.siteDetail", { rooms: e.rooms.length, racks: countRacks(e) });
  if (kind === "room") return t("count.roomDetail", { floor: e.floor, racks: e.racks.length });
  return `${e.uUsed}/${e.uTotal}U · ${e.powerKw}kW`;
};

const DcNode = ({ data, selected }) => {
  const { t, pick } = useLang();
  const { kind, entity: e, highlighted, inGrid } = data;
  const pct = kind === "rack" ? Math.round((e.uUsed / e.uTotal) * 100) : null;
  return (
    <div
      className={`node node--${kind} node--${e.status}${selected || highlighted ? " is-selected" : ""}`}
      title={t(`status.${e.status}`)}
    >
      {kind !== "country" && !inGrid && <Handle type="target" position={Position.Top} />}
      <div className="node__title">
        <Icon name={ICON[kind]} />
        <span className="node__name">{pick(e.name)}</span>
        <span className="node__dot" />
      </div>
      <div className="node__sub">{subtitle(kind, e, t)}</div>
      {pct !== null && (
        <div className="node__bar" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="node__fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {kind !== "rack" && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
};

const nodeTypes = { dc: DcNode };

// Centre on a node selected from outside (map → graph sync).
// fitView({ nodes }) doesn't move when the controlled `nodes` array is replaced, so use setCenter.
const FocusOnNode = ({ nodeId, nodes }) => {
  const rf = useReactFlow();
  useEffect(() => {
    if (!nodeId || !nodes.some((n) => n.id === nodeId)) return undefined;
    const timer = setTimeout(() => {
      const n = rf.getInternalNode(nodeId);
      if (!n) return;
      const { x, y } = n.internals.positionAbsolute;
      rf.setCenter(x + (n.measured.width || 0) / 2, y + (n.measured.height || 0) / 2, { zoom: 1, duration: 600 });
    }, 30);
    return () => clearTimeout(timer);
  }, [nodeId, nodes, rf]);
  return null;
};

const HierarchyFlow = ({ graphSpec, highlightId, onNodeClick, className = "" }) => {
  const { nodes: baseNodes, edges } = useMemo(() => buildGraph(graphSpec), [graphSpec]);
  const nodes = useMemo(
    () => baseNodes.map((n) => (n.id === highlightId ? { ...n, data: { ...n.data, highlighted: true } } : n)),
    [baseNodes, highlightId],
  );
  return (
    <div className={`flow ${className}`}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          onNodeClick={(_, n) => onNodeClick && onNodeClick(n.data.kind, n.data.entity)}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <FocusOnNode nodeId={highlightId} nodes={nodes} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default HierarchyFlow;
