# WorkTracker

Self-hosted, single-user issue tracker. Node + Express, JSON file storage (no DB server needed).

## Run

    npm install
    npm start

Open http://localhost:3000 (or set PORT=xxxx).

Before starting this version, initialize/migrate the JSON store with `npm run migrate:alfred` while the service is stopped. This is repeatable and backs up an existing store.

## ALFRED integration

See [the integration guide](docs/alfred-api.md) and [OpenAPI contract](docs/alfred-api.openapi.json) for authentication, routes, durable sync and deployment. The service API is disabled without `ALFRED_API_TOKEN`; browser login remains separate.

Run `npm test` for API/storage/cabin regressions and `npm run check` for JavaScript syntax and OpenAPI validation.

## Data

Everything lives in `data/store.json`. Back it up by copying that file.

## Deploy

Runs fine as a systemd service, in a small Docker container, or behind nginx/Caddy as a reverse
proxy on your box. No build step, no native deps.
"# todo" 
