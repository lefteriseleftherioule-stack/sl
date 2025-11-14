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

function parseJackpotFromText(text) {
  const euro = (text.match(/(?:jackpot[^€]*?|estimated[^€]*?)€\s*[0-9.,]+\s*(?:Million|Billion)?|€\s*[0-9.,]+\s*(?:Million|Billion)?/i) || [])[0];
  if (!euro) return null;
  const value = (euro.match(/€\s*[0-9.,]+\s*(?:Million|Billion)?/i) || [])[0];
  return value ? value.replace(/\s+/g, " ").trim() : null;
}

function parseLatestDrawFromText(text) {
  const nums = extractAllNumbers(text);
  if (nums.length < 8) return null;
  const labelWindow = text.slice(0, 4000);
  const hasJolly = /jolly/i.test(labelWindow);
  const hasSuperstar = /super\s*star|superstar/i.test(labelWindow);
  const main = nums.slice(0, 6);
  const jolly = nums[6];
  const superstar = nums[7];
  const dateMatch = text.match(new RegExp(`(${monthNames.join("|")}|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^\n]*?\d{1,2}[^\n]*?(January|February|March|April|May|June|July|August|September|October|November|December)?[^\n]*?\d{4}`, "i"));
  const drawNoMatch = text.match(/Drawing\s*n\.?\s*([0-9]+)/i) || text.match(/\((\d{1,3}\/\d{2})\)/);
  return { main, jolly: hasJolly ? jolly : jolly, superstar: hasSuperstar ? superstar : superstar, date: dateMatch ? normalizeText(dateMatch[0]) : null, draw: drawNoMatch ? drawNoMatch[1] : null };
}

function parseArchiveTextToDraws(text, limit = 20) {
  const results = [];
  const dateRegex = new RegExp(`\n?((?:\d{1,2}\s+(?:${monthNames.join("|")})\s+\d{4}))`, "g");
  let m;
  while ((m = dateRegex.exec(text)) && results.length < limit) {
    const date = m[1];
    const segment = text.slice(m.index, m.index + 500);
    const nums = extractAllNumbers(segment);
    if (nums.length >= 8) {
      results.push({ date: normalizeText(date), main: nums.slice(0, 6), jolly: nums[6], superstar: nums[7] });
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
    const section = findSectionText($, "SuperEnalotto Last Draw");
    const parsed = parseLatestDrawFromText(section);
    if (parsed) return { source: "superenalotto.com", ...parsed };
  } catch {}
  try {
    const $ = await load("https://www.superenalotto.net/en/");
    const section = findSectionText($, "Latest Result");
    const parsed = parseLatestDrawFromText(section);
    if (parsed) return { source: "superenalotto.net", ...parsed };
  } catch {}
  return { source: null, main: null, jolly: null, superstar: null, date: null, draw: null };
}

export async function fetchPreviousDraws(limit = 10) {
  try {
    const $ = await load("https://www.superenalotto.com/en/archive");
    const text = normalizeText($("body").text() || "");
    const list = parseArchiveTextToDraws(text, limit);
    if (list.length) return { source: "superenalotto.com", draws: list.slice(0, limit) };
  } catch {}
  try {
    const $ = await load("https://www.superenalotto.net/en/results");
    const text = normalizeText($("body").text() || "");
    const list = parseArchiveTextToDraws(text, limit);
    if (list.length) return { source: "superenalotto.net", draws: list.slice(0, limit) };
  } catch {}
  return { source: null, draws: [] };
}
