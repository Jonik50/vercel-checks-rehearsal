# vercel-checks-rehearsal

An isolated, temporary rehearsal of Vercel **Deployment Checks** with GitHub Actions.

- It contains no application code, no data and no secrets.
- The site is a static page showing the commit it was built from (`/` and `/sha.txt`), plus `/api/build-id`, an uncached function returning the deployment's commit SHA and Vercel deployment id (`npm test` runs its local tests).
- `scenario.json` decides what the CI checks do (see `.github/workflows/ci.yml`).
- A commit that changes only `NO_CI` starts no CI run.

The repository will be archived after the rehearsal.
