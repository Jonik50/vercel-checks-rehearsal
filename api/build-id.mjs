// GET /api/build-id -> {"sha": "<40-hex>", "deploymentId": "dpl_..."}, never cached.
// Rehearsal C1/C2: a cache-safe signal of which deployment serves the domain.
import { buildIdResponse, toResponse } from "../lib/build-id.mjs";

export default {
  fetch(request) {
    return toResponse(buildIdResponse(process.env, request.method), request.method);
  },
};
