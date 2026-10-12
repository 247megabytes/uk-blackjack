/**
 * Usage: npm run simulate -- [games=500] [players=4]
 * Runs seeded Easy-bot games and prints aggregate stats.
 */
import { simulateGame } from './simulate';

const games = Number(process.argv[2] ?? 500);
const players = Number(process.argv[3] ?? 4);

let wins = 0;
let stalemates = 0;
let unfinished = 0;
let totalTurns = 0;
let maxTurns = 0;
const problems: string[] = [];
const started = Date.now();

for (let i = 0; i < games; i++) {
  const r = simulateGame({ seed: `cli-${players}-${i}`, playerCount: players });
  if (r.violations.length) problems.push(`seed ${String(r.seed)}: ${r.violations[0]}`);
  if (!r.finished) unfinished++;
  else if (r.endReason === 'win') wins++;
  else stalemates++;
  totalTurns += r.turns;
  maxTurns = Math.max(maxTurns, r.turns);
}

console.log(`Simulated ${games} games with ${players} Easy bots in ${Date.now() - started} ms`);
console.log(`  wins: ${wins}  stalemates: ${stalemates}  unfinished (hit action cap): ${unfinished}`);
console.log(`  avg turns: ${(totalTurns / games).toFixed(1)}  max turns: ${maxTurns}`);
console.log(`  invariant violations: ${problems.length}`);
for (const p of problems.slice(0, 10)) console.log(`   - ${p}`);
process.exitCode = problems.length ? 1 : 0;
