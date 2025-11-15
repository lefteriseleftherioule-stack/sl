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
  const m = str.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\s+(\\d{4})\\b`, "i"));
  if (m) return `${parseInt(m[1],10)} ${m[0].split(/\s+/)[1]} ${m[2]}`;
  const m2 = str.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\b`, "i"));
  return m2 ? `${parseInt(m2[1],10)} ${m2[0].split(/\s+/)[1]}` : null;
}

function equalsDate(a, b) {
  const norm = s => (s || "").replace(/\s+/g, " ").trim();
  const sa = norm(a), sb = norm(b);
  const rx = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\b`, "i");
  const ry = /\\b(\\d{4})\\b/;
  const ma = sa.match(rx), mb = sb.match(rx);
  if (!ma || !mb) return sa.toLowerCase() === sb.toLowerCase();
  const dayA = parseInt(ma[1],10), monthA = ma[0].split(/\s+/)[1].toLowerCase();
  const dayB = parseInt(mb[1],10), monthB = mb[0].split(/\s+/)[1].toLowerCase();
  const ya = (sa.match(ry) || [null])[1], yb = (sb.match(ry) || [null])[1];
  if (ya && yb) return dayA === dayB && monthA === monthB && ya === yb;
  return dayA === dayB && monthA === monthB;
}

function parseLatestDrawFromDom($, root) {
  const text = normalizeText($(root).text() || "");
  const jMatch = text.match(/(?:^|\s)(\d{1,2})\s*Jolly\b/i) || text.match(/\bJolly\s*(\d{1,2})\b/i);
  const sMatch = text.match(/(?:^|\s)(\d{1,2})\s*(?:Super\s*Star|Superstar)\b/i) || text.match(/\b(?:Super\s*Star|Superstar)\s*(\d{1,2})\b/i);
  const jolly = jMatch ? parseInt(jMatch[1], 10) : null;
  const superstar = sMatch ? parseInt(sMatch[1], 10) : null;
  const nums = [];
  $(root).find("span,div,li,b,strong").each((_, el) => {
    const t = ($(el).text() || "").trim();
    if (/^\d{1,2}$/.test(t)) nums.push(parseInt(t, 10));
  });
  const main = [];
  const used = new Set();
  for (const n of nums) {
    if (n >= 1 && n <= 90 && n !== jolly && n !== superstar && !used.has(n)) {
      main.push(n);
      used.add(n);
      if (main.length === 6) break;
    }
  }
  const dateMatch = text.match(new RegExp(`(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\s+\\d{1,2}\\s+(?:${monthNames.join("|")})\\s+\\d{4}`, "i"));
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
    const container = $(el).closest("tr, li, article").length ? $(el).closest("tr, li, article") : $(el);
    const seg = normalizeText(container.text() || "");
    const start = seg.indexOf(dateRaw);
    const afterDate = start >= 0 ? seg.slice(start + dateRaw.length) : seg;
    const nextDateIdx = afterDate.search(/\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\\s+\\d{4})?\\b/i);
    const block = nextDateIdx >= 0 ? afterDate.slice(0, nextDateIdx) : afterDate;
    const jIdx = block.search(/\bJolly\b/i);
    const sIdxA = block.search(/\bSuper\s*Star\b/i);
    const sIdxB = block.search(/\bSuperstar\b/i);
    const cutIdxs = [jIdx, sIdxA, sIdxB].filter(i => i >= 0);
    const cutIdx = cutIdxs.length ? Math.min(...cutIdxs) : -1;
    const preMainText = cutIdx >= 0 ? block.slice(0, cutIdx) : block;
    const nums = (preMainText.match(/\b\d{1,2}\b/g) || []).map(n => parseInt(n,10)).filter(n => n >= 1 && n <= 90);
    const day = parseInt(dateCanon.split(' ')[0], 10);
    const main = [];
    const used = new Set();
    for (let i = nums.length - 1; i >= 0 && main.length < 6; i--) {
      const n = nums[i];
      if (n === day) continue;
      if (!used.has(n)) { main.unshift(n); used.add(n); }
    }
    let jolly = null, superstar = null;
    const postJText = jIdx >= 0 ? block.slice(jIdx) : '';
    const postSText = (sIdxA >= 0 ? block.slice(sIdxA) : (sIdxB >= 0 ? block.slice(sIdxB) : ''));
    const pickNext = (t) => {
      const arr = (t.match(/\b\d{1,2}\b/g) || []).map(v => parseInt(v,10)).filter(v => v >= 1 && v <= 90);
      for (const v of arr) { if (v === day) continue; if (!used.has(v)) return v; }
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
  const nums = extractAllNumbers(text);
  if (!nums.length) return null;
  const main = [];
  const used = new Set();
  for (const n of nums) {
    if (n >= 1 && n <= 90 && !used.has(n)) {
      main.push(n);
      used.add(n);
      if (main.length === 6) break;
    }
  }
  if (main.length < 6) return null;
  let jolly = null, superstar = null;
  for (const n of nums) {
    if (main.includes(n)) continue;
    if (jolly == null) { jolly = n; continue; }
    if (superstar == null) { superstar = n; break; }
  }
  const dateMatch = text.match(new RegExp(`(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^\n]*?\b\d{1,2}(?:st|nd|rd|th)?\b[^\n]*?(January|February|March|April|May|June|July|August|September|October|November|December)[^\n]*?\b\d{4}\b`, "i"))
    || text.match(new RegExp(`\b\d{1,2}(?:st|nd|rd|th)?\s+(?:${monthNames.join("|")})\s+\d{4}\b`, "i"));
  const drawNoMatch = text.match(/Drawing\s*n\.?\s*([0-9]+)/i) || text.match(/\((\d{1,3}\/\d{2})\)/);
  return { main, jolly, superstar, date: dateMatch ? normalizeText(dateMatch[0]) : null, draw: drawNoMatch ? drawNoMatch[1] : null };
}

function parseArchiveTextToDraws(text, limit = 20) {
  const results = [];
  const dateRegex = new RegExp(`((?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\s+\\d{4}))`, "g");
  let m;
  while ((m = dateRegex.exec(text)) && results.length < limit) {
    const date = m[1];
    const segment = text.slice(m.index, m.index + 600);
    const nums = extractAllNumbers(segment);
    const day = parseInt(((toCanonicalDate(date) || date) || '').split(' ')[0], 10);
    const main = [];
    const used = new Set();
    for (const n of nums) {
      if (n === day) continue;
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
