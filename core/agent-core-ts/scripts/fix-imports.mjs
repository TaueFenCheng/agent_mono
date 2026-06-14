import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

const root = new URL("../dist", import.meta.url).pathname;
for (const f of walk(root)) {
  if (extname(f) !== ".js" && !f.endsWith(".d.ts")) continue;
  const content = readFileSync(f, "utf-8");
  const replaced = content.replace(
    /((?:from|export\s*\*\s*from)\s+")(\.\.?\/[^"]+)(")/g,
    (_, prefix, path, suffix) => path.endsWith(".js") ? _ : `${prefix}${path}.js${suffix}`
  );
  if (replaced !== content) {
    writeFileSync(f, replaced, "utf-8");
    console.log(`  fixed: ${f.replace(root, "")}`);
  }
}
