import { readFileSync } from "node:fs";

// src/version.ts y dist/version.js están al mismo nivel respecto a package.json.
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export const VERSION: string = pkg.version;
