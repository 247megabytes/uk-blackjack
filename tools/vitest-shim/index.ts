/**
 * OFFLINE FALLBACK ONLY.
 *
 * A minimal Vitest-compatible subset (describe/it/test/expect/beforeEach) implemented
 * on Node's built-in `node:test` and `node:assert`, used by `npm run test:offline`
 * when the npm registry is unreachable. The real suite runs on Vitest via `npm test`.
 * Only the matchers used in this repo are implemented.
 */
import { describe as nodeDescribe, it as nodeIt, beforeEach as nodeBeforeEach } from 'node:test';
import assert from 'node:assert/strict';

type Fn = () => void | Promise<void>;

export const describe = (name: string, fn: () => void): void => {
  nodeDescribe(name, fn);
};
export const it = (name: string, fn: Fn): void => {
  nodeIt(name, fn);
};
export const test = it;
export const beforeEach = (fn: Fn): void => {
  nodeBeforeEach(fn);
};

function isSubset(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
  if (actual === null || typeof actual !== 'object') return false;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((e, i) => isSubset(actual[i], e));
  }
  return Object.entries(expected as Record<string, unknown>).every(([k, v]) =>
    isSubset((actual as Record<string, unknown>)[k], v),
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

function makeMatchers(actual: unknown, negate: boolean) {
  const check = (pass: boolean, message: string): void => {
    if (pass === negate) assert.fail(negate ? `Expected NOT: ${message}` : message);
  };
  const show = (v: unknown): string => {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };
  return {
    toBe: (e: unknown) => check(Object.is(actual, e), `expected ${show(actual)} to be ${show(e)}`),
    toEqual: (e: unknown) => check(deepEqual(actual, e), `expected ${show(actual)} to equal ${show(e)}`),
    toStrictEqual: (e: unknown) => check(deepEqual(actual, e), `expected ${show(actual)} to strictly equal ${show(e)}`),
    toMatchObject: (e: unknown) => check(isSubset(actual, e), `expected ${show(actual)} to match ${show(e)}`),
    toBeTruthy: () => check(Boolean(actual), `expected ${show(actual)} to be truthy`),
    toBeFalsy: () => check(!actual, `expected ${show(actual)} to be falsy`),
    toBeNull: () => check(actual === null, `expected ${show(actual)} to be null`),
    toBeDefined: () => check(actual !== undefined, `expected value to be defined`),
    toBeUndefined: () => check(actual === undefined, `expected ${show(actual)} to be undefined`),
    toHaveLength: (n: number) =>
      check((actual as { length?: number })?.length === n, `expected length ${(actual as { length?: number })?.length} to be ${n}`),
    toContain: (e: unknown) =>
      check(
        Array.isArray(actual) ? actual.includes(e) : typeof actual === 'string' && actual.includes(String(e)),
        `expected ${show(actual)} to contain ${show(e)}`,
      ),
    toContainEqual: (e: unknown) =>
      check(Array.isArray(actual) && actual.some((x) => deepEqual(x, e)), `expected ${show(actual)} to contain equal ${show(e)}`),
    toBeGreaterThan: (n: number) => check((actual as number) > n, `expected ${show(actual)} > ${n}`),
    toBeGreaterThanOrEqual: (n: number) => check((actual as number) >= n, `expected ${show(actual)} >= ${n}`),
    toBeLessThan: (n: number) => check((actual as number) < n, `expected ${show(actual)} < ${n}`),
    toBeLessThanOrEqual: (n: number) => check((actual as number) <= n, `expected ${show(actual)} <= ${n}`),
    toThrow: (msg?: string | RegExp) => {
      let threw = false;
      let err: unknown;
      try {
        (actual as () => unknown)();
      } catch (e) {
        threw = true;
        err = e;
      }
      let pass = threw;
      if (threw && msg !== undefined) {
        const m = err instanceof Error ? err.message : String(err);
        pass = typeof msg === 'string' ? m.includes(msg) : msg.test(m);
      }
      check(pass, `expected function to throw${msg ? ` ${String(msg)}` : ''}`);
    },
  };
}

export function expect(actual: unknown) {
  return Object.assign(makeMatchers(actual, false), { not: makeMatchers(actual, true) });
}
