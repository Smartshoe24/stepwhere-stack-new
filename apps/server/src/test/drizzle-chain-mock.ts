/**
 * Minimal stand-in for a Drizzle query builder: every chained call returns the
 * same thenable, and awaiting it resolves to `result`. Enough for unit tests
 * that only care about what a query returns, not how it was built.
 */
export function queryResult<T>(result: T): unknown {
  const target = function queryChain() {};
  const proxy: unknown = new Proxy(target, {
    get(_, prop) {
      if (prop === "then") {
        return (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}
