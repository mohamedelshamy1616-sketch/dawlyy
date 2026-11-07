import { readFileSync } from "node:fs";

const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const load = (l) => new Set(flat(JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8"))));
const ar = load("ar");
const en = load("en");
const missingInEn = [...ar].filter((k) => !en.has(k));
const missingInAr = [...en].filter((k) => !ar.has(k));
console.log(`ar keys: ${ar.size}, en keys: ${en.size}, missing in en: [${missingInEn}], missing in ar: [${missingInAr}]`);
process.exit(missingInEn.length || missingInAr.length ? 1 : 0);
