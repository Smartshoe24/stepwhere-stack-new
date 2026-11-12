import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const srcDir = path.resolve(import.meta.dirname);

describe("server structure", () => {
  it("does not keep modules under src/lib", () => {
    expect(existsSync(path.join(srcDir, "lib"))).toBe(false);
  });

  it("keeps family and onboarding under src/modules", () => {
    expect(existsSync(path.join(srcDir, "modules", "family"))).toBe(true);
    expect(existsSync(path.join(srcDir, "modules", "onboarding"))).toBe(true);
  });

  it("uses the OpenAPI app factory in route files", () => {
    const routeFiles = collectRouteFiles(path.join(srcDir, "modules"));

    for (const file of routeFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("new Hono");
      expect(content).toContain("createOpenApiApp");
    }
  });
});

function collectRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const resolved = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectRouteFiles(resolved);
    }

    return entry.name.endsWith(".routes.ts") ? [resolved] : [];
  });
}
