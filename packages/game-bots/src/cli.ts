/**
 * Usage: npm run simulate -- [games=500] [players=4] [mode=classic|knockouts] [forfeitChance=0]
 * Runs seeded Easy-bot games (or whole Knockouts tournaments) and prints aggregate stats.
 */
import { simulateGame, simulateTournament } from './simulate';

const games = Number(process.argv[2] ?? 500);
const players = Number(process.argv[3] ?? 4);
const mode = process.argv[4] ?? 'classic';
const forfeitChance = Number(process.argv[5] ?? 0);
const problems: string[] = [];
const started = Date.now();

if (mode === 'knockouts') {
  let complete = 0;
  let rounds = 0;
  let stalled = 0;
  let forfeits = 0;
  let maxActions = 0;
  for (let i = 0; i < games; i++) {
    const r = simulateTournament({ seed: `ko-${players}-${i}`, playerCount: players, forfeitChance });
    if (r.violations.length) problems.push(`seed ${String(r.seed)}: ${r.violations[0]}`);
    if (r.complete) complete++;
    rounds += r.rounds;
    stalled += r.stalledRounds;
    forfeits += r.forfeits;
    maxActions = Math.max(maxActions, r.actions);
  }
  console.log(`Simulated ${games} Knockouts tournaments with ${players} Easy bots in ${Date.now() - started} ms (forfeit chance ${forfeitChance})`);
  console.log(`  complete: ${complete}/${games}  rounds played: ${rounds}  stalled rounds: ${stalled}  forfeits: ${forfeits}  max actions: ${maxActions}`);
} else {
  let wins = 0;
  let stalemates = 0;
  let forfeitWins = 0;
  let unfinished = 0;
  let totalTurns = 0;
  let maxTurns = 0;
  for (let i = 0; i < games; i++) {
    const r = simulateGame({ seed: `cli-${players}-${i}`, playerCount: players, forfeitChance });
    if (r.violations.length) problems.push(`seed ${String(r.seed)}: ${r.violations[0]}`);
    if (!r.finished) unfinished++;
    else if (r.endReason === 'win') wins++;
    else if (r.endReason === 'forfeit') forfeitWins++;
    else stalemates++;
    totalTurns += r.turns;
    maxTurns = Math.max(maxTurns, r.turns);
  }
  console.log(`Simulated ${games} classic games with ${players} Easy bots in ${Date.now() - started} ms (forfeit chance ${forfeitChance})`);
  console.log(`  wins: ${wins}  stalemates: ${stalemates}  won by forfeit: ${forfeitWins}  unfinished (hit action cap): ${unfinished}`);
  console.log(`  avg turns: ${(totalTurns / games).toFixed(1)}  max turns: ${maxTurns}`);
}
console.log(`  invariant violations / rejected moves: ${problems.length}`);
for (const p of problems.slice(0, 10)) console.log(`   - ${p}`);
process.exitCode = problems.length ? 1 : 0;
