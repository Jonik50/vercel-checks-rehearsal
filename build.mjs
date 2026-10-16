// Builds a static page that shows which commit a deployment was built from,
// so an unauthenticated GET of the production alias tells which commit is
// live. Uses only Vercel's documented system environment variables; no
// dependencies, no secrets.
import { mkdirSync, writeFileSync } from "node:fs";

const sha = process.env.VERCEL_GIT_COMMIT_SHA || "local";
const env = process.env.VERCEL_ENV || "local";
const builtAt = new Date().toISOString();
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/sha.txt", `${sha}\n`);
writeFileSync(
  "dist/index.html",
  `<!doctype html>
<meta charset="utf-8">
<title>vercel-checks-rehearsal</title>
<p>commit: <code id="sha">${escape(sha)}</code></p>
<p>environment: <code>${escape(env)}</code></p>
<p>built at: <code>${escape(builtAt)}</code></p>
`,
);
console.log(`built ${sha} (${env}) at ${builtAt}`);
