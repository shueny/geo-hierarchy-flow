// Colours shared by the 3D views (globe markers, hall racks).
import { Color } from "three";

export const STATUS_COLOR = { normal: "#2ab57d", warning: "#f5a524", critical: "#e5484d" };

const LOW = new Color("#cfe0ff");
const HIGH = new Color("#1d4ed8");

/** U usage 0…1 → light-to-dark blue (sequential: more used = darker). */
export const usageColor = (pct) => new Color().lerpColors(LOW, HIGH, Math.min(1, Math.max(0, pct)));
