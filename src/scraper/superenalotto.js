export async function getSuperEnalottoData() {
  const url = "https://www.superenalotto.net/en/results";

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
  });

  const html = await res.text();

  return {
    jackpot: extractJackpot(html),
    latest: extractLatestDraw(html),
  };
}

/* -----------------------------------------------------------
   JACKPOT
----------------------------------------------------------- */

function extractJackpot(html) {
  const jackpotMatch = html.match(
    /Jackpot(?:\s*is\s*estimated\s*at)?[^€]*€\s*([\d.,]+)\s*million/i
  );

  if (!jackpotMatch) return null;

  return {
    source: "superenalotto.net",
    jackpot: "€" + jackpotMatch[1] + " million",
  };
}

/* -----------------------------------------------------------
   LATEST DRAW
----------------------------------------------------------- */

function extractLatestDraw(html) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  const tokens = tokenize(text);
  return parseTokens(tokens);
}

/* -----------------------------------------------------------
   TOKENIZER
----------------------------------------------------------- */

function tokenize(text) {
  const parts = text.split(" ").filter(Boolean);
  const tokens = [];

  for (const p of parts) {
    if (/^\d+$/.test(p)) {
      tokens.push({ type: "number", value: parseInt(p, 10) });
    } else if (/jolly/i.test(p)) {
      tokens.push({ type: "label", value: "jolly" });
    } else if (/superstar/i.test(p)) {
      tokens.push({ type: "label", value: "superstar" });
    } else if (/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(p)) {
      tokens.push({ type: "date", value: p });
    }
  }

  return tokens;
}

/* -----------------------------------------------------------
   PARSER — FIXED SUPERSTAR LOGIC
----------------------------------------------------------- */

function parseTokens(tokens) {
  const result = {
    date: null,
    main: [],
    jolly: null,
    superstar: null,
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // DATE
    if (t.type === "date" && !result.date) {
      result.date = t.value;
    }

    // MAIN NUMBERS — take the first 6 numbers before jolly/superstar
    if (
      t.type === "number" &&
      result.main.length < 6 &&
      !tokens[i - 1]?.value === "jolly" &&
      !tokens[i - 1]?.value === "superstar"
    ) {
      result.main.push(t.value);
    }

    // JOLLY
    if (t.type === "label" && t.value === "jolly") {
      const next = tokens[i + 1];
      if (next && next.type === "number") {
        result.jolly = next.value;
        i++;
      }
    }

    // SUPERSTAR — ★ FIXED ★
    if (t.type === "label" && t.value === "superstar") {
      const next = tokens[i + 1];
      if (next && next.type === "number") {
        result.superstar = next.value;
        i++;
      }
    }
  }

  return result;
}
