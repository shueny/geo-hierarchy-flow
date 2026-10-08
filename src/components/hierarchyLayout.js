// Tidy-tree layout for country → site → hall → rack, computed by hand.
// Four fixed levels with fixed node widths don't need dagre/elk.
// Racks would make a row far too wide, so they wrap into a grid under their hall.

export const NODE_W = { country: 170, site: 190, room: 190, rack: 92 };
export const NODE_H = { country: 64, site: 72, room: 64, rack: 68 };
export const GAP_X = 28;
export const GAP_Y = 80;
export const RACK_COLS = 4;
export const RACK_GAP = 10;

const rackLeaves = (room) => room.racks.map((r) => ({ kind: "rack", id: r.id, data: r }));
const roomNode = (room, withRacks) => ({
  kind: "room", id: room.id, data: room, racks: withRacks ? rackLeaves(room) : null,
});
const siteNode = (site, depth) => ({
  kind: "site", id: site.id, data: site,
  children: depth > 0 ? site.rooms.map((r) => roomNode(r, depth > 1)) : [],
});
const countryNode = (c, depth) => ({
  kind: "country", id: c.id, data: c, children: c.sites.map((s) => siteNode(s, depth - 1)),
});

const measure = (n) => {
  if (n.racks) {
    const cols = Math.min(RACK_COLS, n.racks.length);
    n.w = Math.max(NODE_W.room, cols * NODE_W.rack + (cols - 1) * RACK_GAP);
  } else if (n.children && n.children.length) {
    n.children.forEach(measure);
    n.w = Math.max(NODE_W[n.kind], n.children.reduce((a, c) => a + c.w, 0) + GAP_X * (n.children.length - 1));
  } else {
    n.w = NODE_W[n.kind];
  }
};

const place = (n, x, y, nodes, edges, parentId) => {
  nodes.push({
    id: n.id, type: "dc",
    position: { x: x + (n.w - NODE_W[n.kind]) / 2, y },
    data: { kind: n.kind, entity: n.data },
  });
  if (parentId) edges.push({ id: `${parentId}->${n.id}`, source: parentId, target: n.id, type: "smoothstep" });
  const childY = y + NODE_H[n.kind] + GAP_Y;
  if (n.racks) {
    const cols = Math.min(RACK_COLS, n.racks.length);
    const gridW = cols * NODE_W.rack + (cols - 1) * RACK_GAP;
    const x0 = x + (n.w - gridW) / 2;
    n.racks.forEach((r, i) => {
      nodes.push({
        id: r.id, type: "dc",
        position: {
          x: x0 + (i % cols) * (NODE_W.rack + RACK_GAP),
          y: childY - GAP_Y / 2 + Math.floor(i / cols) * (NODE_H.rack + RACK_GAP),
        },
        data: { kind: "rack", entity: r.data, inGrid: true },
      });
    });
    // no edges into the rack grid: a dozen lines per hall is just noise
    return;
  }
  if (!n.children) return;
  const total = n.children.reduce((a, c) => a + c.w, 0) + GAP_X * (n.children.length - 1);
  let cx = x + (n.w - total) / 2;
  n.children.forEach((c) => {
    place(c, cx, childY, nodes, edges, n.id);
    cx += c.w + GAP_X;
  });
};

/**
 * { countries, depth } → the global tree; { site, depth } → one site.
 * depth counts levels below a site: 1 = halls, 2 = halls + racks.
 */
export const buildGraph = ({ countries, site, depth = 2 }) => {
  const roots = countries ? countries.map((c) => countryNode(c, depth + 1)) : [siteNode(site, depth)];
  const nodes = [];
  const edges = [];
  let x = 0;
  roots.forEach((r) => {
    measure(r);
    place(r, x, 0, nodes, edges, null);
    x += r.w + GAP_X * 2;
  });
  return { nodes, edges };
};
