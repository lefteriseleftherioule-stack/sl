import { load as cheerioLoad } from "cheerio";

const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

async function getFetch() {
  if (globalThis.fetch) return globalThis.fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

async function load(url) {
  const f = await getFetch();
  const res = await f(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return cheerioLoad(html);
}

function normalizeText(t) {
  return t.replace(/\s+/g, " ").trim();
}

function extractAllNumbers(text) {
  return (text.match(/\b\d{1,2}\b/g) || []).map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 90);
}

function findSectionText($, marker) {
  let found = "";
  $("*").each((_, el) => {
    const txt = normalizeText($(el).text() || "");
    if (!found && txt.includes(marker)) found = txt;
  });
  if (found) return found;
  const body = normalizeText($("body").text() || "");
  return body.includes(marker) ? body.slice(body.indexOf(marker)) : "";
}

function findSectionElement($, marker) {
  let node = null;
  $("*").each((_, el) => {
    const txt = normalizeText($(el).text() || "");
    if (!node && txt.includes(marker)) node = el;
  });
  return node;
}

function toCanonicalDate(str) {
  if (!str) return null;
  const a = str.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\s+(\\d{4})\\b`, "i"));
  if (a) return `${parseInt(a[1],10)} ${a[0].split(/\s+/)[1]} ${a[2]}`;
  const b = str.match(new RegExp(`\\b(?:${monthNames.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(\\d{4})\\b`, "i"));
  if (b) return `${parseInt(b[1],10)} ${b[0].split(/\s+/)[0]} ${b[2]}`;
  const c = str.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\b`, "i"));
  if (c) return `${parseInt(c[1],10)} ${c[0].split(/\s+/)[1]}`;
  const d = str.match(new RegExp(`\\b(?:${monthNames.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"));
  return d ? `${parseInt(d[1],10)} ${d[0].split(/\s+/)[0]}` : null;
}

function equalsDate(a, b) {
  const norm = s => (s || "").replace(/\s+/g, " ").trim();
  const sa = norm(a), sb = norm(b);
  const rx1 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\b`, "i");
  const rx2 = new RegExp(`\\b(?:${monthNames.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i");
  const ry = /\b(\d{4})\b/;
  const ma = sa.match(rx1) || sa.match(rx2);
  const mb = sb.match(rx1) || sb.match(rx2);
  if (!ma || !mb) return sa.toLowerCase() === sb.toLowerCase();
  const partsA = /^(\d{1,2})/.test(ma[0]) ? [parseInt(ma[1],10), ma[0].split(/\s+/)[1].toLowerCase()] : [parseInt(ma[1],10), ma[0].split(/\s+/)[0].toLowerCase()];
  const partsB = /^(\d{1,2})/.test(mb[0]) ? [parseInt(mb[1],10), mb[0].split(/\s+/)[1].toLowerCase()] : [parseInt(mb[1],10), mb[0].split(/\s+/)[0].toLowerCase()];
  const ya = (sa.match(ry) || [null])[1], yb = (sb.match(ry) || [null])[1];
  if (ya && yb) return partsA[0] === partsB[0] && partsA[1] === partsB[1] && ya === yb;
  return partsA[0] === partsB[0] && partsA[1] === partsB[1];
}

function parseLatestDrawFromDom($, root) {
  const text = normalizeText($(root).text() || "");
  const jIdx = text.search(/\bJolly\b/i);
  const sIdx = text.search(/\b(?:Super\s*Star|Superstar|SuperStar)\b/i);
  const jMatch = text.match(/\bJolly\b[^0-9]*(\d{1,2})/i);
  const sMatch = text.match(/\b(?:Super\s*Star|Superstar|SuperStar)\b[^0-9]*(\d{1,2})/i);
  const jolly = jMatch ? parseInt(jMatch[1], 10) : null;
  const superstar = sMatch ? parseInt(sMatch[1], 10) : null;
  const cutoff = [jIdx, sIdx].filter(i => i >= 0);
  const preMainText = cutoff.length ? text.slice(0, Math.min(...cutoff)) : text;
  const nums = extractAllNumbers(preMainText);
  const dateMatch = text.match(new RegExp(`(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\s+\\d{1,2}\\s+(?:${monthNames.join("|")})\\s+\\d{4}`, "i"));
  const canon = toCanonicalDate(dateMatch ? dateMatch[0] : null) || (dateMatch ? dateMatch[0] : null) || "";
  const dm = canon.match(/\b\d{1,2}\b/);
  const dayNum = dm ? parseInt(dm[0], 10) : null;
  const main = [];
  const used = new Set([jolly, superstar].filter(v => v != null));
  for (let i = nums.length - 1; i >= 0 && main.length < 6; i--) {
    const n = nums[i];
    if (dayNum != null && n === dayNum) continue;
    if (!used.has(n) && !main.includes(n)) main.unshift(n);
  }
  const drawNoMatch = text.match(/Drawing\s*n\.?\s*([0-9]+)/i) || text.match(/\((\d{1,3}\/\d{2})\)/);
  return { main, jolly, superstar, date: dateMatch ? normalizeText(dateMatch[0]) : null, draw: drawNoMatch ? drawNoMatch[1] : null };
}

function parseArchiveFromDom($, limit = 20, excludeDate = null) {
  const dateRegex = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})(?:\\s+\\d{4})?\\b`, "i");
  const results = [];
  $("*").each((_, el) => {
    const txt = normalizeText($(el).text() || "");
    const m = txt.match(dateRegex);
    if (!m) return;
    let dateRaw = normalizeText(m[0]);
    const monthMatch = dateRaw.match(new RegExp(`\\b(?:${monthNames.join("|")})\\b`, "i"));
    if (!/\\d{4}\\b/.test(dateRaw) && monthMatch) {
      const mm = monthMatch[0];
      const containerText = normalizeText((($(el).closest("section, div, li, tr").length ? $(el).closest("section, div, li, tr") : $(el)).text()) || "");
      const bodyText = normalizeText($("body").text() || "");
      const headerYearMatch = containerText.match(new RegExp(`\\b${mm}\\s+\\d{4}\\b`, "i")) || bodyText.match(new RegExp(`\\b${mm}\\s+\\d{4}\\b`, "i"));
      if (headerYearMatch) {
        const yr = (headerYearMatch[0].match(/\\d{4}/) || [""])[0];
        const day = (dateRaw.match(/\\b\\d{1,2}\\b/) || [null])[0];
        if (day) dateRaw = `${day} ${mm} ${yr}`;
      }
    }
    const dateCanon = toCanonicalDate(dateRaw) || dateRaw;
    if (excludeDate && equalsDate(excludeDate, dateCanon)) return;
    const container = $(el).closest("tr, li, article, div").length ? $(el).closest("tr, li, article, div") : $(el);
    const seg = normalizeText(container.text() || "");
    const start = seg.indexOf(dateRaw);
    const afterDate = start >= 0 ? seg.slice(start + dateRaw.length) : seg;
    const nextDateIdx = afterDate.search(/\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\\s+\\d{4})?\\b/i);
    const block = nextDateIdx >= 0 ? afterDate.slice(0, nextDateIdx) : afterDate;
    const jMatches = [...block.matchAll(/\bJolly\b/ig)];
    const sMatchesA = [...block.matchAll(/\bSuper\s*Star\b/ig)];
    const sMatchesB = [...block.matchAll(/\bSuperstar\b/ig)];
    const jIdx = jMatches.length ? jMatches[jMatches.length - 1].index : -1;
    const sIdxA = sMatchesA.length ? sMatchesA[sMatchesA.length - 1].index : -1;
    const sIdxB = sMatchesB.length ? sMatchesB[sMatchesB.length - 1].index : -1;
    const cutIdxs = [jIdx, sIdxA, sIdxB].filter(i => i >= 0);
    const cutIdx = cutIdxs.length ? Math.min(...cutIdxs) : -1;
    const preMainText = cutIdx >= 0 ? block.slice(0, cutIdx) : block;
    const nums = (preMainText.match(/\b\d{1,2}\b/g) || []).map(n => parseInt(n,10)).filter(n => n >= 1 && n <= 90);
    const dayMatch = dateCanon.match(/\b\d{1,2}\b/);
    const dayNum = dayMatch ? parseInt(dayMatch[0], 10) : null;
    const main = [];
    const used = new Set();
    for (let i = nums.length - 1; i >= 0 && main.length < 6; i--) {
      const n = nums[i];
      if (dayNum != null && n === dayNum) continue;
      if (!used.has(n)) { main.unshift(n); used.add(n); }
    }
    let jolly = null, superstar = null;
    const postJText = jIdx >= 0 ? block.slice(jIdx) : '';
    const postSText = (() => { if (sIdxA >= 0 && sIdxB >= 0) return block.slice(Math.max(sIdxA, sIdxB)); if (sIdxA >= 0) return block.slice(sIdxA); if (sIdxB >= 0) return block.slice(sIdxB); return ''; })();
    const pickNext = (t) => {
      const arr = (t.match(/\b\d{1,2}\b/g) || []).map(v => parseInt(v,10)).filter(v => v >= 1 && v <= 90);
      for (const v of arr) { if (dayNum != null && v === dayNum) continue; if (!used.has(v)) return v; }
      return null;
    };
    jolly = pickNext(postJText);
    superstar = pickNext(postSText);
    if (main.length === 6 && jolly != null && superstar != null) {
      results.push({ date: dateCanon, main, jolly, superstar });
    }
  });
  const unique = [];
  const seen = new Set();
  for (const r of results) {
    const key = `${r.date}:${r.main.join(',')}:${r.jolly}:${r.superstar}`;
    if (seen.has(key)) continue;
    unique.push(r);
    seen.add(key);
    if (unique.length >= limit) break;
  }
  return unique;
}

function parseJackpotFromText(text) {
  const re = /€\s*([0-9.,]+)\s*(Million|Billion)?/gi;
  let best = null, bestVal = 0;
  for (const m of text.matchAll(re)) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(num)) continue;
    let val = num;
    const unit = (m[2] || "").toLowerCase();
    if (unit === "million") val = num * 1e6;
    else if (unit === "billion") val = num * 1e9;
    if (val > bestVal) { bestVal = val; best = m[0]; }
  }
  return best ? best.replace(/\s+/g, " ").trim() : null;
}

function parseLatestDrawFromText(text) {
  const jIdx = text.search(/\bJolly\b/i);
  const sIdx = text.search(/\b(?:Super\s*Star|Superstar|SuperStar)\b/i);
  const jMatch = text.match(/\bJolly\b[^0-9]*(\d{1,2})/i);
  const sMatch = text.match(/\b(?:Super\s*Star|Superstar|SuperStar)\b[^0-9]*(\d{1,2})/i);
  const jolly = jMatch ? parseInt(jMatch[1], 10) : null;
  const superstar = sMatch ? parseInt(sMatch[1], 10) : null;
  const cutoff = [jIdx, sIdx].filter(i => i >= 0);
  const preMainText = cutoff.length ? text.slice(0, Math.min(...cutoff)) : text;
  const nums = extractAllNumbers(preMainText);
  const dateMatch = text.match(new RegExp(`(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^\n]*?\\b\\d{1,2}(?:st|nd|rd|th)?\\b[^\n]*?(January|February|March|April|May|June|July|August|September|October|November|December)[^\n]*?\\b\\d{4}\\b`, "i"))
    || text.match(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\s+\\d{4}\\b`, "i"))
    || text.match(new RegExp(`\\b(?:${monthNames.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,)?\\s+\\d{4}\\b`, "i"));
  const canon = toCanonicalDate(dateMatch ? dateMatch[0] : null) || (dateMatch ? dateMatch[0] : null) || "";
  const dm = canon.match(/\b\d{1,2}\b/);
  const dayNum = dm ? parseInt(dm[0], 10) : null;
  const main = [];
  const used = new Set([jolly, superstar].filter(v => v != null));
  for (let i = nums.length - 1; i >= 0 && main.length < 6; i--) {
    const n = nums[i];
    if (dayNum != null && n === dayNum) continue;
    if (!used.has(n) && !main.includes(n)) main.unshift(n);
  }
  if (main.length < 6) return null;
  const drawNoMatch = text.match(/Drawing\s*n\.?\s*([0-9]+)/i) || text.match(/\((\d{1,3}\/\d{2})\)/);
  return { main, jolly, superstar, date: dateMatch ? normalizeText(dateMatch[0]) : null, draw: drawNoMatch ? drawNoMatch[1] : null };
}

function parseArchiveTextToDraws(text, limit = 20) {
  const results = [];
  const dateRegex = new RegExp(`((?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\s+\\d{4})|(?:${monthNames.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,)?\\s+\\d{4})`, "g");
  let m;
  while ((m = dateRegex.exec(text)) && results.length < limit) {
    const date = m[1];
    const segment = text.slice(m.index, m.index + 600);
    const nums = extractAllNumbers(segment);
    const canon = toCanonicalDate(date) || date;
    const dayMatch = canon.match(/\b\d{1,2}\b/);
    const day = dayMatch ? parseInt(dayMatch[0], 10) : null;
    const main = [];
    const used = new Set();
    for (const n of nums) {
      if (day != null && n === day) continue;
      if (n >= 1 && n <= 90 && !used.has(n)) {
        main.push(n);
        used.add(n);
        if (main.length === 6) break;
      }
    }
    if (main.length === 6) {
      let jolly = null, superstar = null;
      for (const n of nums) {
        if (main.includes(n)) continue;
        if (jolly == null) { jolly = n; continue; }
        if (superstar == null) { superstar = n; break; }
      }
      if (jolly != null && superstar != null) {
        results.push({ date: normalizeText(date), main, jolly, superstar });
      }
    }
  }
  return results;
}

export async function fetchCurrentJackpot() {
  try {
    const $ = await load("https://www.superenalotto.com/en/");
    const text = findSectionText($, "The next jackpot is");
    const value = parseJackpotFromText(text);
    if (value) return { source: "superenalotto.com", jackpot: value };
  } catch {}
  try {
    const $ = await load("https://www.superenalotto.net/en/");
    const text = findSectionText($, "Estimated Jackpot");
    const value = parseJackpotFromText(text);
    if (value) return { source: "superenalotto.net", jackpot: value };
  } catch {}
  return { source: null, jackpot: null };
}

export async function fetchLatestDraw() {
  try {
    const $ = await load("https://www.superenalotto.com/en/");
    const el = findSectionElement($, "SuperEnalotto Last Draw");
    let parsed = el ? parseLatestDrawFromDom($, el) : null;
    if (!parsed) {
      const section = findSectionText($, "SuperEnalotto Last Draw");
      parsed = parseLatestDrawFromText(section);
    }
    if (parsed) return { source: "superenalotto.com", ...parsed };
  } catch {}
  try {
    const $ = await load("https://www.superenalotto.net/en/");
    const el = findSectionElement($, "Latest Result");
    let parsed = el ? parseLatestDrawFromDom($, el) : null;
    if (!parsed) {
      const section = findSectionText($, "Latest Result");
      parsed = parseLatestDrawFromText(section);
    }
    if (parsed) return { source: "superenalotto.net", ...parsed };
  } catch {}
  return { source: null, main: null, jolly: null, superstar: null, date: null, draw: null };
}

export async function fetchPreviousDraws(limit = 10, excludeDate = null) {
  const excludeCanon = toCanonicalDate(excludeDate || "");
  try {
    const $ = await load("https://www.superenalotto.net/en/results");
    let list = parseArchiveFromDom($, limit, excludeCanon);
    if (!list.length) {
      const text = normalizeText($("body").text() || "");
      list = parseArchiveTextToDraws(text, limit).filter(r => {
        const d = toCanonicalDate(r.date || "") || r.date;
        return !(excludeCanon && d && equalsDate(excludeCanon, d));
      });
    }
    if (list.length) return { source: "superenalotto.net", draws: list.slice(0, limit) };
  } catch {}
  try {
    const $ = await load("https://www.superenalotto.com/en/archive");
    let list = parseArchiveFromDom($, limit, excludeCanon);
    if (!list.length) {
      const text = normalizeText($("body").text() || "");
      list = parseArchiveTextToDraws(text, limit).filter(r => {
        const d = toCanonicalDate(r.date || "") || r.date;
        return !(excludeCanon && d && equalsDate(excludeCanon, d));
      });
    }
    if (list.length) return { source: "superenalotto.com", draws: list.slice(0, limit) };
  } catch {}
  return { source: null, draws: [] };
}
