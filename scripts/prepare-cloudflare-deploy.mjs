import { readFile, writeFile } from "node:fs/promises";

const generatedPath = new URL("../dist/server/wrangler.json", import.meta.url);
const directPath = new URL(process.argv[2] ?? "../wrangler.direct.jsonc", import.meta.url);

const [generated, direct] = await Promise.all([
  readFile(generatedPath, "utf8").then(JSON.parse),
  readFile(directPath, "utf8").then(JSON.parse),
]);

generated.name = direct.name;
generated.workers_dev = direct.workers_dev;
generated.preview_urls = direct.preview_urls;
generated.d1_databases = direct.d1_databases.map((database) => ({
  ...database,
  migrations_dir: "../../drizzle",
}));
generated.r2_buckets = direct.r2_buckets;
generated.triggers = direct.triggers;
generated.routes = direct.routes;
generated.observability = direct.observability;
generated.assets = {
  ...generated.assets,
  binding: direct.assets.binding,
};

await writeFile(generatedPath, `${JSON.stringify(generated, null, 2)}\n`);
