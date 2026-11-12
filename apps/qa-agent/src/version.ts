declare const __AGENT_VERSION__: string | undefined;

/** Injected by esbuild `define` at build time; falls back to "dev" when run from source. */
export const AGENT_VERSION: string = typeof __AGENT_VERSION__ === "string" ? __AGENT_VERSION__ : "dev";
