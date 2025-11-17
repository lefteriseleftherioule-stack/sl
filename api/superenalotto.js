export default async function handler(req, res) {
  try {
    const limitParam = req.query?.limit;
    const debugParam = req.query?.debug;
    const wantDebug = debugParam && (debugParam === '1' || /^true$/i.test(String(debugParam)));
    if (wantDebug) {
      process.env.DEBUG_SUPERSTAR = '1';
      globalThis.__SUPERSTAR_DEBUG__ = [];
    }
    const mod = await import("../src/scraper/superenalotto.js");
    let { fetchCurrentJackpot, fetchUnifiedResults } = mod || {};
    if (typeof fetchCurrentJackpot !== 'function' || typeof fetchUnifiedResults !== 'function') {
      const def = mod && mod.default ? mod.default : {};
      fetchCurrentJackpot = typeof def.fetchCurrentJackpot === 'function' ? def.fetchCurrentJackpot : fetchCurrentJackpot;
      fetchUnifiedResults = typeof def.fetchUnifiedResults === 'function' ? def.fetchUnifiedResults : fetchUnifiedResults;
    }
    const limit = Number.isInteger(Number(limitParam)) ? Math.max(1, Math.min(50, Number(limitParam))) : 10;
    let jackpot = null, latest = null, previous = null;
    const errors = {};
    try { jackpot = await fetchCurrentJackpot(); } catch (e) { errors.jackpot = e?.message || String(e); }
    try {
      const unified = await fetchUnifiedResults(limit);
      latest = unified?.latest || null;
      previous = unified?.previous || null;
      const swapJS = d => (d ? { ...d, jolly: d?.superstar ?? d?.jolly ?? null, superstar: d?.jolly ?? d?.superstar ?? null } : null);
      if (latest) latest = swapJS(latest);
      if (previous && Array.isArray(previous.draws)) previous = { ...previous, draws: previous.draws.map(swapJS) };
    } catch (e) { errors.unified = e?.message || String(e); }
    const debug = wantDebug ? (globalThis.__SUPERSTAR_DEBUG__ || []) : undefined;
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(wantDebug ? { jackpot, latest, previous, errors, debug } : { jackpot, latest, previous, errors });
  } catch (err) {
    res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED", message: err?.message || String(err) });
  }
}
