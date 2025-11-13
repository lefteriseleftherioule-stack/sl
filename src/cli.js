import { fetchCurrentJackpot, fetchLatestDraw, fetchPreviousDraws } from "./scraper/superenalotto.js";

async function run() {
  const [jackpot, latest, previous] = await Promise.all([
    fetchCurrentJackpot(),
    fetchLatestDraw(),
    fetchPreviousDraws(10)
  ]);
  const out = { jackpot, latest, previous };
  process.stdout.write(JSON.stringify(out, null, 2));
}

run().catch(e => {
  process.stderr.write(String(e));
  process.exit(1);
});