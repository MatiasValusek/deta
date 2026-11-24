// Corre todas las verificaciones del motor (src/lib/**/*Verification.ts).
// Usa el soporte de TypeScript de Node, sin dependencias nuevas.
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

function resolveTypeScriptFile(base) {
  return [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;

    if (specifier.startsWith("@/")) {
      base = path.join(src, specifier.slice(2));
    } else if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith("file:") &&
      fileURLToPath(context.parentURL).startsWith(src)
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }

    const file = base ? resolveTypeScriptFile(base) : null;

    if (!file) {
      return nextResolve(specifier, context);
    }

    // El proyecto no declara "type": "module"; el código de src siempre es ESM.
    return {
      ...nextResolve(pathToFileURL(file).href, context),
      format: "module-typescript",
    };
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);

    if (!url.startsWith(pathToFileURL(src).href) || loaded.source == null) {
      return loaded;
    }

    // Las verificaciones traen un arranque de CommonJS que acá no debe ejecutarse.
    return {
      ...loaded,
      source: Buffer.from(loaded.source)
        .toString("utf8")
        .replace(/\brequire\.main === module\b/g, "false"),
    };
  },
});

function findVerificationFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return findVerificationFiles(entryPath);
    }

    return entry.name.endsWith("Verification.ts") ? [entryPath] : [];
  });
}

let suites = 0;
let checks = 0;
const failures = [];

for (const file of findVerificationFiles(path.join(src, "lib")).sort()) {
  const label = path.relative(src, file).replaceAll("\\", "/");

  try {
    const module = await import(`@/${path.relative(src, file).replaceAll("\\", "/")}`.replace(/\.ts$/, ""));
    const runners = Object.entries(module).filter(
      ([name, value]) =>
        /^run\w+Verifications$/.test(name) && typeof value === "function",
    );

    for (const [name, run] of runners) {
      suites += 1;
      const output = await run();
      const results = Array.isArray(output) ? output : output?.results;

      if (!Array.isArray(results)) {
        failures.push(`${label} ${name}: no devolvió una lista de resultados`);
        continue;
      }

      checks += results.length;
      for (const result of results) {
        if (result?.status !== "passed") {
          failures.push(`${label} ${name}: ${result?.name ?? "sin nombre"}`);
        }
      }
      console.log(`OK  ${label} (${results.length})`);
    }
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`\n${suites} grupos, ${checks} verificaciones, ${failures.length} fallas.`);

if (failures.length > 0) {
  console.error(failures.map((failure) => `FALLA  ${failure}`).join("\n"));
  process.exit(1);
}
