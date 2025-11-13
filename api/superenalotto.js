import { fetchCurrentJackpot, fetchLatestDraw, fetchPreviousDraws } from "../src/scraper/superenalotto.js";

export default async function handler(req, res) {
  const limitParam = req.query?.limit;
  const limit = Number.isInteger(Number(limitParam)) ? Math.max(1, Math.min(50, Number(limitParam))) : 10;
  const [jackpot, latest, previous] = await Promise.all([
    fetchCurrentJackpot(),
    fetchLatestDraw(),
    fetchPreviousDraws(limit)
  ]);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(JSON.stringify({ jackpot, latest, previous }));
}