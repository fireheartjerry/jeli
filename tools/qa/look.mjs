// Record that a take's sheets were looked at, and what was seen. The ledger
// keeps this apart from what was measured: a take with no flags that nobody
// has looked at has only been measured.
//   node tools/qa/look.mjs <take id or prefix> "what was seen"     (QA_OUT picks the ledger)
//   node tools/qa/look.mjs                                         list what has and has not been looked at
import fs from "node:fs";
import path from "node:path";
import { OUT } from "./lib.mjs";

const file = path.join(OUT, "ledger.json");
const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
const [id, ...words] = process.argv.slice(2);
if (id) {
  const hit = Object.keys(ledger.takes).filter((k) => k === id || k.startsWith(id));
  if (!hit.length) throw new Error(`no take matches ${id}`);
  for (const k of hit) ledger.takes[k].looked = words.join(" ") || "looked at, nothing to note";
  fs.writeFileSync(file, JSON.stringify(ledger, null, 1));
}
const all = Object.values(ledger.takes);
const seen = all.filter((t) => t.looked);
console.log(`${seen.length} of ${all.length} takes looked at (${seen.reduce((n, t) => n + t.frames, 0)} of ${all.reduce((n, t) => n + t.frames, 0)} frames)`);
for (const t of all.filter((t) => !t.looked)) console.log(`  not yet: ${t.id}`);
