/**
 * Renders the generated map layout to an SVG file for visual inspection.
 * Run: npx tsx tools/render-map-svg.ts [output.svg]
 */
import { writeFileSync } from "node:fs";
import { DEFAULT_RULES } from "@mogul/engine";
import layout from "../packages/client/src/map-layout.generated.json" with { type: "json" };

const output = process.argv[2] ?? "/tmp/mogul-map.svg";
const R = DEFAULT_RULES;
const vb = layout.viewBox;
const parts: string[] = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" width="${vb.width}" height="${vb.height}">`,
  `<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="#1a1612"/>`,
];

for (const region of R.map.regions) {
  const geom = layout.regions[region.id];
  parts.push(
    `<polygon points="${geom.polygon.map((p) => `${p.x},${p.y}`).join(" ")}" fill="#2b251d" fill-opacity="0.55" stroke="#4a4032" stroke-width="1" stroke-dasharray="5 5"/>`,
    `<text x="${geom.label.x}" y="${geom.label.y}" fill="#a89a7f" font-size="12" font-family="Georgia,serif" letter-spacing="2" text-anchor="middle">${region.name.toUpperCase()}</text>`,
  );
}

for (const e of R.map.edges) {
  const key = `${e.from}:${e.to}`;
  const geom = layout.edges[key];
  const cross = geom.kind === "cross";
  const d = geom.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  parts.push(
    `<path d="${d}" fill="none" stroke="${cross ? "#9a7442" : "#5a4a30"}" stroke-width="${cross ? 1.8 : 1.6}" ${cross ? 'stroke-dasharray="8 4"' : ""}/>`,
    `<text x="${geom.label.x}" y="${geom.label.y - 3}" fill="${cross ? "#d1a15b" : "#9c8d72"}" font-size="10" text-anchor="middle" font-family="Georgia,serif">${e.cost}</text>`,
  );
}

for (const c of R.map.cities) {
  const pos = layout.cities[c.id];
  parts.push(
    `<circle cx="${pos.x}" cy="${pos.y}" r="9" fill="#221d16" stroke="#6b5736" stroke-width="1.5"/>`,
    `<text x="${pos.x}" y="${pos.y + 27}" fill="#d8ccb0" font-size="10.5" text-anchor="middle" font-family="Georgia,serif">${c.name}</text>`,
  );
  for (let i = 0; i < c.slots; i++) {
    parts.push(`<circle cx="${pos.x + (i - (c.slots - 1) / 2) * 13}" cy="${pos.y + 14}" r="3.2" fill="none" stroke="#6b5736" stroke-width="1"/>`);
  }
}

parts.push("</svg>");
writeFileSync(output, parts.join("\n"));
console.log(`wrote ${output} (${vb.width.toFixed(0)}x${vb.height.toFixed(0)})`);
