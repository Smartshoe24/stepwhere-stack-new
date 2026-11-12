import { serve } from "@hono/node-server";

import { app } from "./app.js";

const port = Number(process.env.PORT) || 8290;

console.log(`Device ingest proxy running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
