// Writes apps/web/messages/<locale>/index.ts for every language: the JSON files of its folder, one namespace each.
//   node apps/web/scripts/i18n-index.mjs
// Run it after adding or removing a namespace file. It also checks every language against English: keys English has
// that a language lacks fall back to English (listed as missing), keys only a language has are listed as stray.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "messages");
const locales = fs.readdirSync(root).filter((d) => fs.statSync(path.join(root, d)).isDirectory()).sort();
const json = (l) => fs.readdirSync(path.join(root, l)).filter((f) => f.endsWith(".json")).sort();
const read = (l, f) => JSON.parse(fs.readFileSync(path.join(root, l, f), "utf8"));

for (const l of locales) {
  const files = json(l);
  const lines = ["// Written by apps/web/scripts/i18n-index.mjs from the JSON files of this folder; do not edit by hand.", 'import type { Catalog } from "@/lib/i18n/locales";'];
  files.forEach((f, i) => lines.push(`import n${i} from "./${f}";`));
  lines.push("", "const catalog: Catalog = {", ...files.map((f, i) => `  ${JSON.stringify(f.replace(/\.json$/, ""))}: n${i},`), "};", "export default catalog;", "");
  fs.writeFileSync(path.join(root, l, "index.ts"), lines.join("\n"));
}

const en = Object.fromEntries(json("en").map((f) => [f, read("en", f)]));
let missingAll = 0;
for (const l of locales.filter((x) => x !== "en")) {
  let missing = 0;
  const stray = [];
  // a plural form the language does not have ("_one" in Japanese) is not missing; one it has is not stray
  const forms = new Set(new Intl.PluralRules(l).resolvedOptions().pluralCategories);
  const form = (k) => /_(zero|one|two|few|many|other)$/.exec(k)?.[1];
  for (const [f, keys] of Object.entries(en)) {
    const own = fs.existsSync(path.join(root, l, f)) ? read(l, f) : {};
    for (const k of Object.keys(keys)) if (!(k in own) && (!form(k) || forms.has(form(k)))) missing++;
    for (const k of Object.keys(own)) {
      const base = form(k) ? k.slice(0, -form(k).length - 1) : null;
      const known = k in keys || (base && Object.keys(keys).some((e) => e.startsWith(`${base}_`)) && forms.has(form(k)));
      if (!known) stray.push(`${f}:${k}`);
    }
  }
  missingAll += missing;
  console.log(`${l.padEnd(6)} missing ${missing}${stray.length ? `, stray ${stray.length}: ${stray.slice(0, 8).join(" ")}` : ""}`);
}
console.log(`${Object.keys(en).length} namespaces, ${Object.values(en).reduce((n, o) => n + Object.keys(o).length, 0)} English keys; ${missingAll} missing across the other languages`);
