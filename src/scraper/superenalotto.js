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
  const collectNums = (node) => {
    const arr = [];
    $(node).find("li, span, div, b, strong").each((_, el) => {
      const t = ($(el).text() || "").trim();
      if (/^\d{1,2}$/.test(t)) {
        const n = parseInt(t,10);
        if (n >= 1 && n <= 90) arr.push(n);
      }
    });
    return arr;
  };
  let main = null;
  $(root).find("ul, ol, div, section").each((_, el) => {
    const nums = collectNums(el);
    const uniq = [...new Set(nums)];
    if (!main && uniq.length === 6) main = uniq;
  });
  if (!main) {
    const tokens = [];
    $(root).find("*").each((_, el) => {
      const t = normalizeText($(el).text() || "");
      if (/^\d{1,2}$/.test(t)) {
        const v = parseInt(t,10);
        if (v >= 1 && v <= 90) tokens.push({ type: "num", value: v });
      } else if (/\bJolly\b/i.test(t)) tokens.push({ type: "label", value: "jolly" });
      else if (/\b(?:Super\s*Star|Superstar|SuperStar)\b/i.test(t)) tokens.push({ type: "label", value: "superstar" });
    });
    const jIdx = tokens.findIndex(t => t.type === "label" && t.value === "jolly");
    const sIdx = tokens.findIndex(t => t.type === "label" && t.value === "superstar");
    const firstLabelIdx = [jIdx, sIdx].filter(i => i >= 0).length ? Math.min(...[jIdx, sIdx].filter(i => i >= 0)) : -1;
    const head = firstLabelIdx >= 0 ? tokens.slice(0, firstLabelIdx) : tokens;
    main = [];
    for (let i = head.length - 1; i >= 0 && main.length < 6; i--) {
      const t = head[i];
      if (t.type === "num" && !main.includes(t.value)) main.unshift(t.value);
    }
  }
  const findLabelEl = (re) => {
    let node = null;
    $(root).find("*").each((_, el) => {
      const t = normalizeText($(el).text() || "");
      if (!node && re.test(t)) node = el;
    });
    return node;
  };
  const pickNear = (el) => {
    if (!el) return null;
    let val = null;
    $(el).find("li, span, div, b, strong").each((_, nd) => {
      const tt = ($(nd).text() || "").trim();
      if (/^\d{1,2}$/.test(tt)) { const v = parseInt(tt,10); if (v >= 1 && v <= 90) { val = v; return false; } }
    });
    if (val != null) return val;
    $(el).nextAll().slice(0,5).each((_, sib) => {
      if (val != null) return false;
      const t = ($(sib).text() || "").trim();
      if (/^\d{1,2}$/.test(t)) { const v = parseInt(t,10); if (v >= 1 && v <= 90) { val = v; return false; } }
      $(sib).find("li, span, div, b, strong").each((_, nd) => {
        const tt = ($(nd).text() || "").trim();
        if (/^\d{1,2}$/.test(tt)) { const v = parseInt(tt,10); if (v >= 1 && v <= 90) { val = v; return false; } }
      });
    });
    return val;
  };
  const jEl = findLabelEl(/\bJolly\b/i);
  const sEl = findLabelEl(/\b(?:Super\s*Star|Superstar|SuperStar)\b/i);
  let jolly = pickNear(jEl);
  let superstar = pickNear(sEl);
  if (jolly == null || superstar == null) {
    const tokens2 = [];
    $(root).find("*").each((_, el) => {
      const t = normalizeText($(el).text() || "");
      if (/^\d{1,2}$/.test(t)) {
        const v = parseInt(t,10);
        if (v >= 1 && v <= 90) tokens2.push({ type: "num", value: v });
      } else if (/\bJolly\b/i.test(t)) tokens2.push({ type: "label", value: "jolly" });
      else if (/\b(?:Super\s*Star|Superstar|SuperStar)\b/i.test(t)) tokens2.push({ type: "label", value: "superstar" });
    });
    const jIdx2 = tokens2.findIndex(t => t.type === "label" && t.value === "jolly");
    const sIdx2 = tokens2.findIndex(t => t.type === "label" && t.value === "superstar");
    const pickAfter2 = (idx) => {
      if (idx < 0) return null;
      for (let i = idx + 1; i < tokens2.length; i++) { if (tokens2[i].type === "num") return tokens2[i].value; }
      return null;
    };
    const dayNumFromRoot = (() => {
      const tt = normalizeText($(root).text() || "");
      const dmx = tt.match(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\s+\\d{4}\\b`, "i"))
        || tt.match(new RegExp(`\\b(?:${monthNames.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,)?\\s+\\d{4}\\b`, "i"));
      const d = dmx ? (dmx[0].match(/\\b\\d{1,2}\\b/) || [null])[0] : null;
      return d ? parseInt(d,10) : null;
    })();
    const pickAfter2SkipDay = (idx) => {
      if (idx < 0) return null;
      for (let i = idx + 1; i < tokens2.length; i++) {
        if (tokens2[i].type === "num") {
          const v = tokens2[i].value;
          if (dayNumFromRoot != null && v === dayNumFromRoot) continue;
          return v;
        }
      }
      return null;
    };
    if (jolly == null) jolly = pickAfter2(jIdx2);
    if (superstar == null) superstar = pickAfter2SkipDay(sIdx2);
  }
  if (Array.isArray(main)) {
    main = main.filter(n => n !== jolly && n !== superstar);
    if (main.length > 6) main = main.slice(0,6);
  } else {
    main = [];
  }
  if (main.length < 6) {
    const numsAll = collectNums(root);
    const used = new Set([jolly, superstar].filter(v => v != null));
    for (const n of numsAll) {
      if (!used.has(n) && !main.includes(n)) {
        main.push(n);
        if (main.length === 6) break;
      }
    }
  }
  const text = normalizeText($(root).text() || "");
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
    const container = $(el).closest("tr, li, article, div").length ? $(el).closest("tr, li, article, div") : $(el);
    const seg = normalizeText(container.text() || "");
    const drawNoMatch = seg.match(/\b(\d{1,3}\/\d{2})\b/) || seg.match(/Drawing\s*n\.?\s*([0-9]+)/i);
    const drawNo = drawNoMatch ? drawNoMatch[1] : null;
    const tokens = [];
    let jLabelEl = null, sLabelEl = null;
    container.find("*").each((_, nd) => {
      const t = normalizeText($(nd).text() || "");
      if (/^\d{1,2}$/.test(t)) tokens.push({ type: "num", value: parseInt(t,10) });
      else if (/\bJolly\b/i.test(t)) { tokens.push({ type: "label", value: "jolly" }); if (!jLabelEl) jLabelEl = nd; }
      else if (/\b(?:Super\s*Star|Superstar|SuperStar)\b/i.test(t)) { tokens.push({ type: "label", value: "superstar" }); if (!sLabelEl) sLabelEl = nd; }
    });
    const jIdxTok = tokens.findIndex(t => t.type === "label" && t.value === "jolly");
    const sIdxTok = tokens.findIndex(t => t.type === "label" && t.value === "superstar");
    if (jIdxTok >= 0 && sIdxTok >= 0 && drawNo) {
      const firstLabelIdx = Math.min(...[jIdxTok, sIdxTok].filter(i => i >= 0));
      const head = firstLabelIdx >= 0 ? tokens.slice(0, firstLabelIdx) : tokens;
      const dayMatch = dateCanon.match(/\b\d{1,2}\b/);
      const dayNum = dayMatch ? parseInt(dayMatch[0], 10) : null;
      const main = [];
      for (let i = head.length - 1; i >= 0 && main.length < 6; i--) {
        const t = head[i];
        if (t.type === "num" && (dayNum == null || t.value !== dayNum) && !main.includes(t.value)) main.unshift(t.value);
      }
      const pickAfter = (idx) => { if (idx < 0) return null; for (let i = idx + 1; i < tokens.length; i++) { if (tokens[i].type === "num") return tokens[i].value; } return null; };
      const pickAfterSkipDay = (idx) => {
        if (idx < 0) return null;
        for (let i = idx + 1; i < tokens.length; i++) {
          if (tokens[i].type === "num") {
            const v = tokens[i].value;
            if (dayNum != null && v === dayNum) continue;
            return v;
          }
        }
        return null;
      };
      const pickNearStar = (el) => {
        if (!el) return null;
        let val = null;
        $(el).nextAll().slice(0,15).each((_, sib) => {
          if (val != null) return false;
          const t = ($(sib).text() || "").trim();
          if (/^\d{1,2}$/.test(t)) { const v = parseInt(t,10); if (v >= 1 && v <= 90 && v !== dayNum && !main.includes(v)) { val = v; return false; } }
          $(sib).find("li, span, div, b, strong").each((_, nd) => {
            const tt = ($(nd).text() || "").trim();
            if (/^\d{1,2}$/.test(tt)) { const v = parseInt(tt,10); if (v >= 1 && v <= 90 && v !== dayNum && !main.includes(v)) { val = v; return false; } }
          });
        });
        return val;
      };
      const jolly = pickAfter(jIdxTok);
      let superstar = null;
      for (let i = sIdxTok + 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === "num") {
          const v = t.value;
          if ((dayNum == null || v !== dayNum) && v !== jolly && !main.includes(v)) { superstar = v; break; }
        }
      }
      if (superstar == null) superstar = pickNearStar(sLabelEl) || pickAfterSkipDay(sIdxTok);
      if (main.length === 6 && jolly != null && superstar != null) {
        results.push({ date: dateCanon, draw: drawNo, main, jolly, superstar });
      }
    }
  });
  const unique = [];
  const seen = new Set();
  for (const r of results) {
    const key = `${r.date}:${r.draw || ''}:${r.main.join(',')}:${r.jolly}:${r.superstar}`;
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
  const tokens = [];
  const re = /\b(?:Jolly|Super\s*Star|Superstar|SuperStar)\b|\b\d{1,2}\b/gi;
  for (const m of text.matchAll(re)) {
    const s = m[0];
    if (/^\d{1,2}$/.test(s)) tokens.push({ type: "num", value: parseInt(s,10) });
    else if (/Jolly/i.test(s)) tokens.push({ type: "label", value: "jolly" });
    else tokens.push({ type: "label", value: "superstar" });
  }
  const jIdx = tokens.findIndex(t => t.type === "label" && t.value === "jolly");
  const sIdx = tokens.findIndex(t => t.type === "label" && t.value === "superstar");
  const firstLabelIdx = [jIdx, sIdx].filter(i => i >= 0).length ? Math.min(...[jIdx, sIdx].filter(i => i >= 0)) : -1;
  const head = firstLabelIdx >= 0 ? tokens.slice(0, firstLabelIdx) : tokens;
  let main = [];
  for (let i = head.length - 1; i >= 0 && main.length < 6; i--) {
    const t = head[i];
    if (t.type === "num" && !main.includes(t.value)) main.unshift(t.value);
  }
  const pickAfter = (idx) => { if (idx < 0) return null; for (let i = idx + 1; i < tokens.length; i++) { if (tokens[i].type === "num") return tokens[i].value; } return null; };
  const pickAfterSkipDay = (idx) => {
    if (idx < 0) return null;
    const dayNumFromText = (() => {
      const dm = text.match(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\s+\\d{4}\\b`, "i"))
        || text.match(new RegExp(`\\b(?:${monthNames.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,)?\\s+\\d{4}\\b`, "i"));
      const d = dm ? (dm[0].match(/\\b\\d{1,2}\\b/) || [null])[0] : null;
      return d ? parseInt(d,10) : null;
    })();
    for (let i = idx + 1; i < tokens.length; i++) {
      if (tokens[i].type === "num") {
        const v = tokens[i].value;
        if (dayNumFromText != null && v === dayNumFromText) continue;
        return v;
      }
    }
    return null;
  };
  const jolly = pickAfter(jIdx);
  const superstar = pickAfterSkipDay(sIdx);
  if (main.length < 6) {
    const used = new Set([jolly, superstar].filter(v => v != null));
    main = [];
    for (const t of tokens) { if (t.type === "num" && !used.has(t.value) && !main.includes(t.value)) { main.push(t.value); if (main.length === 6) break; } }
  }
  const dateMatch = text.match(new RegExp(`(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^\n]*?\\b\\d{1,2}(?:st|nd|rd|th)?\\b[^\n]*?(January|February|March|April|May|June|July|August|September|October|November|December)[^\n]*?\\b\\d{4}\\b`, "i"))
    || text.match(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthNames.join("|")})\\s+\\d{4}\\b`, "i"))
    || text.match(new RegExp(`\\b(?:${monthNames.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,)?\\s+\\d{4}\\b`, "i"));
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
        if (superstar == null) {
          if (day != null && n === day) continue;
          superstar = n;
          break;
        }
      }
      if (jolly != null && superstar != null) {
        results.push({ date: normalizeText(date), main, jolly: superstar, superstar: jolly });
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
  const isComplete = d => d && Array.isArray(d.main) && d.main.length === 6 && d.jolly != null && d.superstar != null && d.date;
  try {
    const $ = await load("https://www.superenalotto.net/en/results");
    const list = parseArchiveFromDom($, 1, null);
    if (list.length && isComplete(list[0])) return { source: "superenalotto.net", ...list[0] };
  } catch {}
  try {
    const $ = await load("https://www.superenalotto.com/en/");
    const el = findSectionElement($, "SuperEnalotto Last Draw");
    let parsed = el ? parseLatestDrawFromDom($, el) : parseLatestDrawFromText(findSectionText($, "SuperEnalotto Last Draw"));
    if (isComplete(parsed)) return { source: "superenalotto.com", ...parsed };
  } catch {}
  try {
    const prev = await fetchPreviousDraws(1, null);
    const first = (prev.draws || [])[0];
    if (first) return { source: prev.source, ...first, draw: null };
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

export async function fetchUnifiedResults(limit = 10) {
  try {
    const $ = await load("https://www.superenalotto.net/en/results");
    const list = parseArchiveFromDom($, limit + 1, null);
    if (list.length) {
      const [latest, ...rest] = list;
      return {
        source: "superenalotto.net",
        latest,
        previous: { source: "superenalotto.net", draws: rest.slice(0, limit) }
      };
    }
  } catch {}
  try {
    const $ = await load("https://www.superenalotto.com/en/archive");
    let list = parseArchiveFromDom($, limit + 1, null);
    if (!list.length) {
      const text = normalizeText($("body").text() || "");
      list = parseArchiveTextToDraws(text, limit + 1);
    }
    if (list.length) {
      const [latest, ...rest] = list;
      return {
        source: "superenalotto.com",
        latest,
        previous: { source: "superenalotto.com", draws: rest.slice(0, limit) }
      };
    }
  } catch {}
  return { source: null, latest: null, previous: { source: null, draws: [] } };
}
