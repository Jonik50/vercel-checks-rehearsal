// Pure logic for /api/build-id: which commit and which Vercel deployment is
// answering this request. Reads exactly two runtime system variables
// (VERCEL_GIT_COMMIT_SHA, VERCEL_DEPLOYMENT_ID) plus the VERCEL=1 marker, and
// returns nothing else. Missing or malformed metadata fails closed with 503.
// No network calls: the answer never depends on GitHub or the branch tip.

const SHA = /^[0-9a-f]{40}$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{1,64}$/;

export const HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});

export function buildIdResponse(env, method) {
  if (method !== "GET" && method !== "HEAD") {
    return { status: 405, headers: { ...HEADERS, Allow: "GET, HEAD" }, body: { error: "method_not_allowed" } };
  }
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  const deploymentId = env.VERCEL_DEPLOYMENT_ID;
  if (env.VERCEL !== "1" || typeof sha !== "string" || !SHA.test(sha) ||
      typeof deploymentId !== "string" || !DEPLOYMENT_ID.test(deploymentId)) {
    return { status: 503, headers: { ...HEADERS }, body: { error: "build_metadata_unavailable" } };
  }
  return { status: 200, headers: { ...HEADERS }, body: { sha, deploymentId } };
}

export function toResponse({ status, headers, body }, method) {
  return new Response(method === "HEAD" ? null : JSON.stringify(body), { status, headers });
}
