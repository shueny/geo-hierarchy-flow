// The static shell of the hall: floor slab, walls, door, cooling units, PDUs,
// cold-aisle containment roof and cable trays. Nothing here moves or reacts to the pointer.
import { TILE } from "../hallLayout";
import { TRAY_Y, RACK_H, WALL_H } from "./units";

const CRAC_H = 1.95;
const PDU_H = 1.8;

export const Room = ({ layout, frame, assets }) => {
  const { W, D, wx, wz } = frame;
  // Walls face inward and are single-sided: the ones between the camera and the room are
  // back-facing and get culled, which gives a dollhouse cut-away from any angle.
  const walls = [
    { size: [W, WALL_H], pos: [0, -D / 2], ry: 0 },
    { size: [W, WALL_H], pos: [0, D / 2], ry: Math.PI },
    { size: [D, WALL_H], pos: [-W / 2, 0], ry: Math.PI / 2 },
    { size: [D, WALL_H], pos: [W / 2, 0], ry: -Math.PI / 2 },
  ];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={assets.floorTex} roughness={0.85} />
      </mesh>
      {/* floor edge, so the raised floor reads as a slab */}
      <mesh position={[0, -0.151, 0]}>
        <boxGeometry args={[W, 0.3, D]} />
        <meshStandardMaterial color="#b8bec7" />
      </mesh>

      {walls.map((w, i) => (
        <mesh key={i} position={[w.pos[0], WALL_H / 2, w.pos[1]]} rotation-y={w.ry} material={assets.wallMat} receiveShadow>
          <planeGeometry args={w.size} />
        </mesh>
      ))}
      {/* entry door on the front wall, in the entry aisle */}
      <mesh position={[wx(5.5), 1.1, D / 2 - 0.01]} rotation-y={Math.PI}>
        <planeGeometry args={[1.2, 2.2]} />
        <meshStandardMaterial color="#8a94a3" />
      </mesh>

      {layout.fixtures.map((f) => {
        const w = f.w * TILE;
        const d = f.d * TILE;
        const h = f.kind === "crac" ? CRAC_H : PDU_H;
        return (
          <mesh
            key={f.id}
            position={[wx(f.x) + w / 2, h / 2, wz(f.z) + d / 2]}
            material={f.kind === "crac" ? assets.cracMaterials : assets.pduMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[w - 0.04, h, d - 0.04]} />
          </mesh>
        );
      })}

      {/* cold-aisle containment roof (glass) */}
      {layout.coldAisles.map((a, i) => (
        <mesh
          key={`roof-${i}`}
          position={[wx(a.x) + ((a.w - 1) * TILE) / 2, RACK_H + 0.01, wz(a.z) + (a.d * TILE) / 2]}
          material={assets.glassMat}
        >
          <boxGeometry args={[(a.w - 1) * TILE, 0.02, a.d * TILE]} />
        </mesh>
      ))}

      {/* overhead cable trays follow the planned rows and stay put when racks move */}
      {layout.trays.map((t, i) => (
        <mesh
          key={`tray-${i}`}
          position={[wx(t.x) + (t.w * TILE) / 2, TRAY_Y, wz(t.z) + (t.d * TILE) / 2]}
          material={assets.trayMat}
          castShadow
        >
          <boxGeometry args={[t.w * TILE, 0.08, 0.3]} />
        </mesh>
      ))}
    </group>
  );
};
