// Searchable materials cache for service-upgrade takeoff / purchase lists.
// Aliases include common alternate names so field crew can find items quickly.

export const MATERIAL_CATALOG = [
  {
    id: "end-box",
    name: "End-line box (NYC / Con Ed)",
    aliases: ["end box", "endline", "end line box", "service box", "con ed box", "termination box"],
    unit: "ea",
    group: "service",
  },
  {
    id: "meter-pan-100-1",
    name: "Meter pan / socket 100A single-phase",
    aliases: ["meter socket", "meter base", "100a pan", "ring type meter pan", "meter enclosure"],
    unit: "ea",
    group: "meter",
  },
  {
    id: "meter-pan-100-3",
    name: "Meter pan / socket 100A three-phase",
    aliases: ["3 phase meter pan", "100a 3ph pan", "polyphase meter socket"],
    unit: "ea",
    group: "meter",
  },
  {
    id: "meter-pan-200-1",
    name: "Meter pan / socket 200A single-phase",
    aliases: ["200a meter base", "200 amp pan", "200a socket"],
    unit: "ea",
    group: "meter",
  },
  {
    id: "meter-pan-200-3",
    name: "Meter pan / socket 200A three-phase",
    aliases: ["200a 3ph pan", "200 three phase meter"],
    unit: "ea",
    group: "meter",
  },
  {
    id: "meter-pan-400-3",
    name: "Meter pan / CT cabinet 400A three-phase",
    aliases: ["400a pan", "ct cabinet", "400 amp meter", "current transformer cabinet"],
    unit: "ea",
    group: "meter",
  },
  {
    id: "panel-100",
    name: "Load center / panel 100A",
    aliases: ["panelboard", "breaker panel", "loadcentre", "load center", "100a panel"],
    unit: "ea",
    group: "panel",
  },
  {
    id: "panel-200",
    name: "Load center / panel 200A",
    aliases: ["200a panel", "200 amp load center", "panelboard 200"],
    unit: "ea",
    group: "panel",
  },
  {
    id: "panel-400",
    name: "Panel / main disconnect 400A",
    aliases: ["400a disconnect", "main switch", "400 amp panel"],
    unit: "ea",
    group: "panel",
  },
  {
    id: "lugs-connectors",
    name: "Connectors / lugs / hubs set",
    aliases: ["mechanical lugs", "set screw lug", "hub", "myers hub", "connector kit"],
    unit: "set",
    group: "hardware",
  },
  {
    id: "wire-se",
    name: "Service entrance / feeder wire (pan to panel)",
    aliases: ["ser", "seu", "thhn", "feeder", "service cable", "al ser", "cu ser"],
    unit: "ft",
    group: "wire",
  },
  {
    id: "gec",
    name: "Grounding electrode conductor + clamps",
    aliases: ["ground wire", "grounding wire", "gec", "ground clamp", "acorn clamp"],
    unit: "set",
    group: "ground",
  },
  {
    id: "ground-rod",
    name: "Ground rod",
    aliases: ["grounding rod", "earth rod", "cu clad rod"],
    unit: "ea",
    group: "ground",
  },
  {
    id: "service-outlet",
    name: "Service outlet",
    aliases: ["site outlet", "gfci service", "temporary outlet permanent service"],
    unit: "ea",
    group: "always",
  },
  {
    id: "service-light",
    name: "Service light",
    aliases: ["site light", "yard light", "photocell light", "service lamp"],
    unit: "ea",
    group: "always",
  },
  {
    id: "conduit-2",
    name: 'Underground conduit 2"',
    aliases: ["2 inch conduit", "2\" pvc", "sch 40 2", "raceway 2"],
    unit: "ft",
    group: "conduit",
  },
  {
    id: "conduit-4",
    name: 'Underground conduit 4"',
    aliases: ["4 inch conduit", "4\" pvc", "sch 40 4"],
    unit: "ft",
    group: "conduit",
  },
  {
    id: "overhead-pipe",
    name: "Overhead service pipe / riser",
    aliases: ["mast", "riser", "overhead pipe", "weatherhead pipe"],
    unit: "ea",
    group: "conduit",
  },
  {
    id: "removal",
    name: "Removal and disposal of old metering equipment",
    aliases: ["demo meter", "remove old pan", "scrap meter", "disposal"],
    unit: "lot",
    group: "optional",
  },
];

export function searchMaterials(query, limit = 20) {
  const q = String(query || "")
    .toLowerCase()
    .trim();
  if (!q) return MATERIAL_CATALOG.slice(0, limit);
  const scored = MATERIAL_CATALOG.map((m) => {
    const hay = [m.name, m.id, ...(m.aliases || [])].join(" ").toLowerCase();
    let score = 0;
    if (hay.includes(q)) score += 50;
    for (const tok of q.split(/\s+/).filter(Boolean)) {
      if (hay.includes(tok)) score += 10;
    }
    return { m, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);
  return scored;
}

/** Build default takeoff checklist from estimator materialsHint + catalog. */
export function defaultTakeoffItems(materialsHint = []) {
  const items = [];
  for (const g of materialsHint) {
    for (const name of g.items || []) {
      items.push({
        id: "hint-" + items.length,
        name,
        qty: 1,
        unit: "ea",
        checked: false,
        custom: false,
        group: g.group || "Job",
      });
    }
  }
  // always catalog always-group
  for (const m of MATERIAL_CATALOG.filter((x) => x.group === "always")) {
    if (!items.some((i) => i.name === m.name)) {
      items.push({
        id: m.id,
        name: m.name,
        qty: 1,
        unit: m.unit,
        checked: false,
        custom: false,
        group: "Always",
      });
    }
  }
  return items;
}
