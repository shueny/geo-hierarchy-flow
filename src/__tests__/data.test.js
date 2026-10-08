import { describe, expect, test } from "vitest";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import { COUNTRIES, ALL_SITES, STATUSES, worstStatus } from "../data/sites";
import { messages } from "../i18n/messages";

describe("demo data", () => {
  test("every country's ISO numeric id exists in world-atlas (otherwise it won't be tinted)", () => {
    const ids = new Set(feature(world, world.objects.countries).features.map((f) => f.id));
    COUNTRIES.filter((c) => c.numeric !== null)
      .forEach((c) => expect(ids, `${c.id} → ${c.numeric}`).toContain(c.numeric));
  });

  test("every name has both languages", () => {
    const names = [
      ...COUNTRIES.map((c) => c.name),
      ...ALL_SITES.map((s) => s.name),
      ...ALL_SITES.flatMap((s) => s.rooms.map((r) => r.name)),
    ];
    names.forEach((n) => {
      expect(n.zh).toBeTruthy();
      expect(n.en).toBeTruthy();
    });
  });

  test("coordinates are valid and statuses come from the known set", () => {
    ALL_SITES.forEach((s) => {
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.lng)).toBeLessThanOrEqual(180);
      expect(STATUSES).toContain(s.status);
      s.rooms.flatMap((r) => r.racks).forEach((r) => {
        expect(STATUSES).toContain(r.status);
        expect(r.uUsed).toBeLessThanOrEqual(r.uTotal);
      });
    });
  });

  test("worstStatus rolls up correctly, including the empty case", () => {
    expect(worstStatus([])).toBe("normal");
    expect(worstStatus(["normal", "warning"])).toBe("warning");
    expect(worstStatus(["warning", "critical", "normal"])).toBe("critical");
  });
});

describe("i18n", () => {
  test("zh and en have the same keys", () => {
    expect(Object.keys(messages.zh).sort()).toEqual(Object.keys(messages.en).sort());
  });
});

describe("format", () => {
  test("fills values and picks singular/plural", async () => {
    const { format } = await import("../i18n/index.jsx");
    const s = messages.en["count.siteDetail"];
    expect(format(s, { rooms: 1, racks: 10 })).toBe("1 hall · 10 racks");
    expect(format(s, { rooms: 3, racks: 1 })).toBe("3 halls · 1 rack");
    expect(format(messages.zh["count.siteDetail"], { rooms: 1, racks: 10 })).toBe("1 間機房・10 座機櫃");
  });
});
