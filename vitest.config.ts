import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ukbj/game-engine': r('./packages/game-engine/src/index.ts'),
      '@ukbj/game-bots': r('./packages/game-bots/src/index.ts'),
      '@ukbj/game-protocol': r('./packages/game-protocol/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    environment: 'node',
  },
});
