// Local tests for /api/build-id (node --test). No network, no Vercel needed.
import { test as nodeTest } from "node:test";

const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { buildIdResponse, toResponse, HEADERS } from "../lib/build-id.mjs";
import handler from "../api/build-id.mjs";

const SHA = "057416fb7ce11a7a65447253a4878e71d01c55c4";
const DPL = "dpl_6dWQtY859KnpNRas1wUUBVUmYYqN";
const good = { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: SHA, VERCEL_DEPLOYMENT_ID: DPL };
const NO_STORE = "no-store, max-age=0";

test("valid metadata returns exactly sha and deploymentId", () => {
  const r = buildIdResponse({ ...good, SECRET_CANARY: "do-not-leak", VERCEL_URL: "x.vercel.app" }, "GET");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { sha: SHA, deploymentId: DPL });
  assert.equal(r.headers["Cache-Control"], NO_STORE);
  assert.equal(r.headers["CDN-Cache-Control"], "no-store");
  assert.equal(r.headers["Vercel-CDN-Cache-Control"], "no-store");
  assert.equal(r.headers["X-Content-Type-Options"], "nosniff");
});

for (const [name, env] of [
  ["missing sha", { ...good, VERCEL_GIT_COMMIT_SHA: undefined }],
  ["empty sha", { ...good, VERCEL_GIT_COMMIT_SHA: "" }],
  ["short sha", { ...good, VERCEL_GIT_COMMIT_SHA: SHA.slice(0, 7) }],
  ["uppercase sha", { ...good, VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase() }],
  ["sha with newline", { ...good, VERCEL_GIT_COMMIT_SHA: `${SHA}\n` }],
  ["sha with injected text", { ...good, VERCEL_GIT_COMMIT_SHA: `${SHA}","x":"y` }],
  ["sha 'local'", { ...good, VERCEL_GIT_COMMIT_SHA: "local" }],
  ["41-char sha", { ...good, VERCEL_GIT_COMMIT_SHA: `${SHA}0` }],
  ["64-char sha", { ...good, VERCEL_GIT_COMMIT_SHA: "a".repeat(64) }],
  ["bare dpl_ prefix", { ...good, VERCEL_DEPLOYMENT_ID: "dpl_" }],
  ["missing deployment id", { ...good, VERCEL_DEPLOYMENT_ID: undefined }],
  ["deployment id without dpl_ prefix", { ...good, VERCEL_DEPLOYMENT_ID: "6dWQtY859KnpNRas1wUUBVUmYYqN" }],
  ["deployment id with dash", { ...good, VERCEL_DEPLOYMENT_ID: "dpl_abc-def" }],
  ["deployment id too long", { ...good, VERCEL_DEPLOYMENT_ID: `dpl_${"a".repeat(65)}` }],
  ["not on Vercel", { ...good, VERCEL: undefined }],
  ["VERCEL=true instead of 1", { ...good, VERCEL: "true" }],
]) {
  test(`fails closed: ${name}`, () => {
    const r = buildIdResponse(env, "GET");
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { error: "build_metadata_unavailable" });
    assert.equal(r.headers["Cache-Control"], NO_STORE);
    assert.ok(!JSON.stringify(r.body).includes(SHA.slice(0, 7)));
  });
}

for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
  test(`rejects ${method} with 405`, () => {
    const r = buildIdResponse(good, method);
    assert.equal(r.status, 405);
    assert.equal(r.headers.Allow, "GET, HEAD");
    assert.equal(r.headers["Cache-Control"], NO_STORE);
  });
}

test("HEAD responses carry no body; GET responses carry the JSON body", async () => {
  assert.equal(toResponse(buildIdResponse(good, "HEAD"), "HEAD").body, null);
  assert.deepEqual(await toResponse(buildIdResponse(good, "GET"), "GET").json(), { sha: SHA, deploymentId: DPL });
});

test("headers object is frozen and not mutated by responses", () => {
  assert.ok(Object.isFrozen(HEADERS));
  buildIdResponse(good, "POST");
  assert.equal(HEADERS.Allow, undefined);
});

// End-to-end through the real handler and an HTTP server, with process.env
// as the only metadata source and fetch disabled to prove no network use.
async function withServer(env, fn) {
  const saved = { ...process.env };
  const savedFetch = globalThis.fetch;
  for (const k of ["VERCEL", "VERCEL_GIT_COMMIT_SHA", "VERCEL_DEPLOYMENT_ID"]) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  const server = createServer(async (req, res) => {
    const request = new Request(`http://localhost${req.url}`, { method: req.method });
    globalThis.fetch = () => { throw new Error("network access is not allowed"); };
    let response;
    try {
      response = await handler.fetch(request);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`handler threw: ${error.message}`);
      return;
    } finally {
      globalThis.fetch = savedFetch;
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/api/build-id`);
  } finally {
    server.close();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

test("HTTP: GET returns 200 JSON with no-store and no extra env values", async () => {
  await withServer({ ...good, SECRET_CANARY: "do-not-leak" }, async (url) => {
    const res = await fetch(url);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), NO_STORE);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.deepEqual(JSON.parse(text), { sha: SHA, deploymentId: DPL });
    assert.ok(!text.includes("do-not-leak"));
  });
});

test("HTTP: HEAD returns 200 with an empty body", async () => {
  await withServer(good, async (url) => {
    const res = await fetch(url, { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "");
    assert.equal(res.headers.get("cache-control"), NO_STORE);
  });
});

test("HTTP: missing runtime metadata returns 503", async () => {
  await withServer({ VERCEL: "1" }, async (url) => {
    const res = await fetch(url);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "build_metadata_unavailable" });
  });
});

test("HTTP: metadata is read per request, not cached at module load", async () => {
  const other = "0".repeat(40);
  await withServer({ ...good, VERCEL_GIT_COMMIT_SHA: other }, async (url) => {
    assert.equal((await (await fetch(url)).json()).sha, other);
  });
  await withServer(good, async (url) => {
    assert.equal((await (await fetch(url)).json()).sha, SHA);
  });
});

test("HTTP: query string does not change the answer", async () => {
  await withServer(good, async (url) => {
    const res = await fetch(`${url}?sha=${"f".repeat(40)}&deploymentId=dpl_evil`);
    assert.deepEqual(await res.json(), { sha: SHA, deploymentId: DPL });
  });
});
