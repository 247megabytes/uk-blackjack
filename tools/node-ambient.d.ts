// OFFLINE FALLBACK ONLY: minimal Node typings for `npm run typecheck:offline`
// when @types/node cannot be installed. The real config uses @types/node.
declare const process: { argv: string[]; exitCode: number | undefined };
declare const console: { log(...args: unknown[]): void; error(...args: unknown[]): void };
declare module 'node:test' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
}
declare module 'node:assert/strict' {
  const assert: { deepStrictEqual(a: unknown, b: unknown): void; fail(message: string): never };
  export default assert;
}
