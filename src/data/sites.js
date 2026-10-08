// Demo data: country → site → hall → rack. Every name and number here is invented.
//
// Racks are generated from a seeded PRNG so the page looks the same on every reload.

const seeded = (seed) => {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

export const STATUSES = ["normal", "warning", "critical"];
const RANK = { normal: 0, warning: 1, critical: 2 };
export const worstStatus = (list) =>
  list.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), "normal");

const makeRacks = (hallId, count, seed) => {
  const rnd = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const r = rnd();
    const status = r > 0.93 ? "critical" : r > 0.8 ? "warning" : "normal";
    const uUsed = Math.round(10 + rnd() * 30);
    return {
      id: `${hallId}-R${String(i + 1).padStart(2, "0")}`,
      name: `${String.fromCharCode(65 + Math.floor(i / 6))}${(i % 6) + 1}`,
      uTotal: 42,
      uUsed,
      powerKw: Math.round((1.5 + rnd() * 6) * 10) / 10,
      deviceCount: Math.round(uUsed / 2.5),
      status,
    };
  });
};

const hall = (id, letter, floor, rackCount, seed) => {
  const racks = makeRacks(id, rackCount, seed);
  return {
    id,
    name: { en: `Hall ${letter}`, zh: `${letter} 機房` },
    floor,
    racks,
    status: worstStatus(racks.map((r) => r.status)),
  };
};

const site = (id, en, zh, lat, lng, halls) => ({
  id,
  name: { en, zh },
  lat,
  lng,
  rooms: halls,
  status: worstStatus(halls.map((h) => h.status)),
});

const country = (id, numeric, en, zh, sites) => ({
  id,
  numeric, // ISO 3166-1 numeric, matches world-atlas feature ids (null = no polygon at 110m)
  name: { en, zh },
  sites,
  status: worstStatus(sites.map((s) => s.status)),
});

export const COUNTRIES = [
  country("TW", "158", "Taiwan", "台灣", [
    site("TPE1", "Taipei DC-1", "台北一號機房", 25.06, 121.56, [
      hall("TPE1-A", "A", "1F", 12, 11),
      hall("TPE1-B", "B", "1F", 6, 12),
      hall("TPE1-C", "C", "2F", 10, 13),
    ]),
    site("TPE2", "Taipei DC-2", "台北二號機房", 24.99, 121.45, [
      hall("TPE2-A", "A", "B1", 14, 21),
    ]),
    site("TXG1", "Taichung DC", "台中機房", 24.16, 120.65, [
      hall("TXG1-A", "A", "3F", 8, 31),
      hall("TXG1-B", "B", "3F", 8, 32),
    ]),
    site("KHH1", "Kaohsiung DC", "高雄機房", 22.62, 120.3, [
      hall("KHH1-A", "A", "1F", 9, 41),
    ]),
  ]),
  country("JP", "392", "Japan", "日本", [
    site("TYO1", "Tokyo DC", "東京機房", 35.65, 139.75, [
      hall("TYO1-A", "A", "5F", 12, 51),
      hall("TYO1-B", "B", "5F", 12, 52),
    ]),
    site("OSA1", "Osaka DC", "大阪機房", 34.69, 135.5, [
      hall("OSA1-A", "A", "2F", 8, 61),
    ]),
  ]),
  // Singapore is too small to have a polygon in the 110m dataset, so there's nothing to tint
  country("SG", null, "Singapore", "新加坡", [
    site("SIN1", "Singapore DC", "新加坡機房", 1.33, 103.74, [
      hall("SIN1-A", "A", "L1", 10, 71),
      hall("SIN1-B", "B", "L2", 10, 72),
    ]),
  ]),
  country("AU", "036", "Australia", "澳洲", [
    site("SYD1", "Sydney DC", "雪梨機房", -33.87, 151.21, [
      hall("SYD1-A", "A", "1F", 10, 75),
    ]),
  ]),
  country("US", "840", "United States", "美國", [
    site("SJC1", "San Jose DC", "聖荷西機房", 37.34, -121.89, [
      hall("SJC1-A", "A", "1F", 14, 81),
    ]),
    site("IAD1", "Ashburn DC", "亞什本機房", 39.04, -77.49, [
      hall("IAD1-A", "A", "1F", 12, 91),
      hall("IAD1-B", "B", "1F", 12, 92),
    ]),
  ]),
  country("DE", "276", "Germany", "德國", [
    site("FRA1", "Frankfurt DC", "法蘭克福機房", 50.11, 8.68, [
      hall("FRA1-A", "A", "1F", 10, 101),
    ]),
  ]),
];

export const ALL_SITES = COUNTRIES.flatMap((c) =>
  c.sites.map((s) => ({ ...s, countryId: c.id, countryName: c.name })),
);

export const HIGHLIGHT_NUMERIC = new Set(COUNTRIES.map((c) => c.numeric).filter(Boolean));

export const findSite = (id) => ALL_SITES.find((s) => s.id === id) || null;

export const countRacks = (s) => s.rooms.reduce((n, r) => n + r.racks.length, 0);
