export default async function handler(req, res) {
  try {
    const { fetchCurrentJackpot, fetchLatestDraw, fetchPreviousDraws } = await import("../src/scraper/superenalotto.js");
    const limitParam = req.query?.limit;
    const limit = Number.isInteger(Number(limitParam)) ? Math.max(1, Math.min(50, Number(limitParam))) : 10;
    let jackpot = null, latest = null, previous = null;
    const errors = {};
    try { jackpot = await fetchCurrentJackpot(); } catch (e) { errors.jackpot = e?.message || String(e); }
    try { latest = await fetchLatestDraw(); } catch (e) { errors.latest = e?.message || String(e); }
    try { previous = await fetchPreviousDraws(limit, latest?.date || null); } catch (e) { errors.previous = e?.message || String(e); }
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ jackpot, latest, previous, errors });
  } catch (err) {
    res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED", message: err?.message || String(err) });
  }
}
