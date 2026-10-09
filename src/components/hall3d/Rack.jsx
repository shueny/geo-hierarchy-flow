// One rack. Purely presentational: the parent decides where it stands and what a
// pointer does; this component only draws the rack and forwards the handlers.
import { Html } from "@react-three/drei";
import { TILE } from "../hallLayout";
import { STATUS_COLOR, usageColor } from "../colors";
import { RACK_H } from "./units";

const HOVER_GLOW = "#14264d";
const LIFT = 0.06; // a rack being carried floats slightly above the floor

export const Rack = ({ data, transform, lifted, selected, hovered, colorMode, labelVisible, assets, handlers }) => {
  const capColor = colorMode === "usage" ? usageColor(data.uUsed / data.uTotal) : STATUS_COLOR[data.status];
  const status = STATUS_COLOR[data.status];
  return (
    <group position={[transform.x, lifted ? LIFT : 0, transform.z]} rotation-y={transform.yaw} {...handlers}>
      <mesh geometry={assets.rackBody} position-y={RACK_H / 2} castShadow receiveShadow>
        <meshStandardMaterial color="#2b3038" roughness={0.6} metalness={0.3} emissive={hovered ? HOVER_GLOW : "#000000"} />
      </mesh>
      <mesh geometry={assets.rackDoor} material={assets.doorMat} position={[0, RACK_H / 2, TILE - 0.005]} />
      <mesh geometry={assets.rackCap} position-y={RACK_H + 0.016}>
        <meshStandardMaterial color={capColor} roughness={0.5} />
      </mesh>
      <mesh geometry={assets.rackLed} position={[0, RACK_H - 0.12, TILE + 0.005]}>
        <meshStandardMaterial color={status} emissive={status} emissiveIntensity={1.4} />
      </mesh>
      {selected && <lineSegments geometry={assets.rackOutline} material={assets.outlineMat} position-y={RACK_H / 2} />}

      {/* The label's box floats over the canvas even when invisible. R3F turns a pointer position into
          a ray from event.offsetX/Y, which are relative to the event TARGET — so a box that can be hit
          corrupts every pointer event over it (clicks "miss"). drei's `pointerEvents` prop is ignored
          outside `transform` mode, hence the explicit style. */}
      <Html position={[0, RACK_H + 0.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className={`hall-label${labelVisible ? " is-visible" : ""}${selected ? " is-selected" : ""}`}>{data.name}</div>
      </Html>
    </group>
  );
};
