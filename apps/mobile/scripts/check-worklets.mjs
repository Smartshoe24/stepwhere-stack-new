#!/usr/bin/env node
/**
 * Fails when a worklet captures a function that cannot run on the UI thread.
 *
 * ## The failure this prevents
 *
 *   [Worklets] Tried to synchronously call a non-worklet function `clamp`
 *   on the UI thread.
 *
 * It compiles fine and only throws when the animation actually runs, which is
 * easy to ship.
 *
 * ## Why this compiles the code instead of pattern-matching it
 *
 * The intuitive rule — "imports are unsafe, same-module functions get inlined" —
 * is wrong. The Babel plugin captures *both* into the worklet's closure and
 * inlines neither. What matters is whether the captured function carries a
 * `'worklet'` directive. Verified against react-native-worklets 0.8.3:
 *
 *   function plainLocal(v) { return v * 2; }
 *   function workletLocal(v) { 'worklet'; return v * 3; }
 *
 *   useAnimatedStyle(() => ({ opacity: plainLocal(sv.get()) }));
 *     -> __closure = { plainLocal, sv }     // captured, no __workletHash: THROWS
 *   useAnimatedStyle(() => ({ opacity: workletLocal(sv.get()) }));
 *     -> __closure = { workletLocal, sv }   // captured, has __workletHash: fine
 *
 * An earlier version of this script encoded the wrong rule and reported a clean
 * tree while a captured local `clamp` was crashing on device. So rather than
 * re-implementing the plugin's capture logic, this runs the real Babel pipeline
 * and inspects the `__closure` it emits — for the file under test *and* for any
 * local module it imports a called function from. If plugin behaviour changes,
 * this follows automatically.
 *
 * Run with `pnpm check:worklets`.
 */

import { transformSync } from '@babel/core';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const WORKLET_HOOKS = [
  'useAnimatedStyle',
  'useDerivedValue',
  'useAnimatedReaction',
  'useAnimatedScrollHandler',
  'useFrameCallback',
  'useAnimatedProps',
  'runOnUI',
];

/** Compiler-generated closure entries, never user functions. */
const GENERATED_CAPTURE = /^(_worklet_\d+_init_data|_e)$/;

/**
 * Packages whose exported helpers are already worklets (`withTiming`, `clamp`,
 * `interpolate`, `runOnJS`, ...). Capturing these is the intended usage.
 */
const WORKLET_SAFE_PACKAGES = new Set([
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-gesture-handler',
]);

const SOURCE_ROOT = 'src';
const compileCache = new Map();

/**
 * Defaults to scanning `src`. `--files a.tsx b.tsx` narrows the scan, which the
 * test suite uses to drive fixtures through the real code path.
 */
function listCandidateFiles() {
  const flagIndex = process.argv.indexOf('--files');

  if (flagIndex !== -1) {
    return process.argv.slice(flagIndex + 1).filter(Boolean);
  }

  const pattern = WORKLET_HOOKS.join('\\|');

  try {
    const output = execSync(`grep -rl '${pattern}' ${SOURCE_ROOT}`, { encoding: 'utf8' }).trim();
    return output ? output.split('\n') : [];
  } catch {
    return []; // grep exits non-zero when nothing matches
  }
}

function compile(file) {
  if (compileCache.has(file)) {
    return compileCache.get(file);
  }

  const result = transformSync(readFileSync(file, 'utf8'), {
    ast: false,
    babelrc: false,
    configFile: false,
    filename: file,
    plugins: [['react-native-reanimated/plugin', {}]],
    presets: [['babel-preset-expo', {}]],
  });
  const code = result?.code ?? '';

  compileCache.set(file, code);

  return code;
}

/** Names the plugin assigned a `__workletHash` to in this module. */
function readWorkletizedNames(code) {
  return new Set(
    Array.from(
      code.matchAll(/([A-Za-z_$][\w$]*)\.__workletHash\s*=/g),
      match => match[1],
    ),
  );
}

/** Every `<name>.__closure = { a, b }` the plugin emitted. */
function readCapturedNames(code) {
  const captured = new Set();

  for (const match of code.matchAll(/\.__closure\s*=\s*\{([^}]*)\}/g)) {
    for (const entry of match[1].split(',')) {
      const name = entry.split(':')[0].trim();

      if (name) {
        captured.add(name);
      }
    }
  }

  return captured;
}

/** Maps each imported binding to its module specifier. */
function readImports(source) {
  const imports = new Map();
  const importPattern = /import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/gs;

  for (const match of source.matchAll(importPattern)) {
    const [, defaultBinding, namedBindings, specifier] = match;

    if (defaultBinding) {
      imports.set(defaultBinding, specifier);
    }

    for (const raw of (namedBindings ?? '').split(',')) {
      const binding = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();

      if (binding) {
        imports.set(binding, specifier);
      }
    }
  }

  return imports;
}

function resolveLocalModule(specifier, importerFile) {
  const base = specifier.startsWith('@/')
    ? path.join(SOURCE_ROOT, specifier.slice(2))
    : specifier.startsWith('.')
      ? path.join(path.dirname(importerFile), specifier)
      : null;

  if (!base) {
    return null;
  }

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.native.ts`,
    `${base}.native.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCalledInSource(source, name) {
  return new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`).test(source);
}

function findLine(source, name) {
  const index = source.search(new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`));

  return index < 0 ? 1 : source.slice(0, index).split('\n').length;
}

/**
 * Decides whether capturing `name` is safe, and says why — so a failure explains
 * itself rather than just naming an identifier.
 */
function classifyCapture(name, context) {
  const { file, imports, source, workletizedHere } = context;

  if (GENERATED_CAPTURE.test(name)) {
    return { safe: true };
  }

  // Not invoked, so it cannot produce a non-worklet call.
  if (!isCalledInSource(source, name)) {
    return { safe: true };
  }

  if (workletizedHere.has(name)) {
    return { safe: true };
  }

  const specifier = imports.get(name);

  if (specifier && WORKLET_SAFE_PACKAGES.has(specifier)) {
    return { safe: true };
  }

  if (specifier) {
    const resolved = resolveLocalModule(specifier, file);

    if (!resolved) {
      return {
        safe: false,
        reason: `imported from "${specifier}", which is not a worklet-safe package`,
      };
    }

    if (readWorkletizedNames(compile(resolved)).has(name)) {
      return { safe: true };
    }

    return {
      safe: false,
      reason: `imported from ${resolved}, where it has no 'worklet' directive`,
    };
  }

  return {
    safe: false,
    reason: "declared in this file without a 'worklet' directive",
  };
}

const files = listCandidateFiles();
const findings = [];
let checkedCount = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  let code;

  try {
    code = compile(file);
  } catch (error) {
    console.error(`Could not compile ${file}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }

  const captured = readCapturedNames(code);

  if (captured.size === 0) {
    continue;
  }

  checkedCount += 1;

  const context = {
    file,
    imports: readImports(source),
    source,
    workletizedHere: readWorkletizedNames(code),
  };

  for (const name of captured) {
    const verdict = classifyCapture(name, context);

    if (!verdict.safe) {
      findings.push({ file, line: findLine(source, name), name, reason: verdict.reason });
    }
  }
}

if (findings.length === 0) {
  console.log(`✓ ${checkedCount} worklet file(s) capture no non-worklet functions`);
  process.exit(0);
}

console.error('Worklets capture functions that cannot run on the UI thread:\n');

for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}`);
  console.error(`    \`${finding.name}\` — ${finding.reason}\n`);
}

console.error(`Any function a worklet captures must be callable on the UI runtime. Fix by:
  - using Reanimated's equivalent (clamp, interpolate, ...), or
  - adding a 'worklet' directive to the function, or
  - inlining the logic, or
  - moving the work to runOnJS / render.

Declaring the helper in the same file does NOT help: the Babel plugin captures
same-module functions exactly like imports.
`);

process.exit(1);
