import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SCRIPT = path.join(process.cwd(), 'scripts/check-worklets.mjs');
const FIXTURE_DIR = 'scripts/__fixtures__/worklets';

/**
 * Runs the checker against a single fixture. `--files` keeps the fixtures out of
 * the normal `src` scan while letting the tests drive the real code path.
 */
function runChecker(fixture: string) {
  try {
    const stdout = execFileSync(
      'node',
      [SCRIPT, '--files', path.join(FIXTURE_DIR, fixture)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );

    return { exitCode: 0, output: stdout };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };

    return { exitCode: failure.status, output: failure.stdout + failure.stderr };
  }
}

describe('check-worklets', () => {
  it('flags a plain helper declared in the same file', () => {
    const { exitCode, output } = runChecker('unsafe-local-helper.tsx');

    expect(exitCode).toBe(1);
    expect(output).toContain('scaleValue');
    expect(output).toContain("declared in this file without a 'worklet' directive");
  });

  it('flags a plain helper imported from a local module', () => {
    const { exitCode, output } = runChecker('unsafe-imported-helper.tsx');

    expect(exitCode).toBe(1);
    expect(output).toContain('plainHelper');
    expect(output).toContain("no 'worklet' directive");
  });

  it("accepts 'worklet' helpers and Reanimated built-ins", () => {
    const { exitCode, output } = runChecker('safe-worklet-helper.tsx');

    expect(exitCode).toBe(0);
    expect(output).toContain('capture no non-worklet functions');
  });

  it('passes on the real source tree', () => {
    let result: { exitCode: number; output: string };

    try {
      result = { exitCode: 0, output: execFileSync('node', [SCRIPT], { encoding: 'utf8' }) };
    } catch (error) {
      const failure = error as { status: number; stdout: string; stderr: string };
      result = { exitCode: failure.status, output: failure.stdout + failure.stderr };
    }

    expect(result.output).toContain('capture no non-worklet functions');
    expect(result.exitCode).toBe(0);
  });
});
