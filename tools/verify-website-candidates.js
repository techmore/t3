const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = "reports/website-candidates.csv";
const DEFAULT_OUTPUT = "reports/verified-website-candidates.csv";
const REQUEST_TIMEOUT_MS = 9000;
const USER_AGENT = "TinicumTalentThrive/1.0 website-candidate-verifier";
const BLOCKED_DOMAINS = [
  "businessyab.com",
  "berksconnect.com",
  "yellowpages.com",
  "superpages.com",
  "yelp.com",
  "tripadvisor.com",
  "nextdoor.com",
  "facebook.com",
  "instagram.com",
  "manta.com",
  "bbb.org",
  "hotfrog.com",
  "allbiz.com",
  "bizapedia.com",
  "chamberofcommerce.com",
  "beautynailhairsalons.com",
  "mapquest.com",
  "opencorporates.com",
  "zoominfo.com",
  "dandb.com",
  "furnitureloc.com",
  "antiquestoresnearby.com",
  "onmaps.online"
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    inputPath: DEFAULT_INPUT,
    outputPath: DEFAULT_OUTPUT,
    limit: 80,
    minScore: 0
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") options.inputPath = args[++index];
    else if (arg === "--output") options.outputPath = args[++index];
    else if (arg === "--limit") options.limit = Number(args[++index]);
    else if (arg === "--min-score") options.minScore = Number(args[++index]);
  }
  return options;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(name) {
  const stop = new Set(["the", "and", "of", "at", "llc", "inc", "co", "company", "corp", "corporation", "pa", "pc"]);
  return normalizeText(name)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stop.has(token));
}

function addressTokens(address) {
  return normalizeText(address)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !/^\d{5}$/.test(token))
    .slice(0, 8);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blocked(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return BLOCKED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": USER_AGENT
      }
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) {
      return { ok: false, status: response.status, final_url: response.url, text: "" };
    }
    return {
      ok: true,
      status: response.status,
      final_url: response.url,
      text: normalizeText(stripHtml(await response.text()))
    };
  } catch (error) {
    return { ok: false, status: 0, final_url: url, text: "", error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function verify(row, page) {
  const name = row.name || "";
  const town = normalizeText(row.town || "");
  const address = row.address || "";
  const candidateUrl = row.candidate_url || "";
  const host = normalizeText(new URL(candidateUrl).hostname.replace(/^www\./, ""));
  const content = `${host} ${normalizeText(row.candidate_title)} ${page.text}`;
  const tokens = nameTokens(name);
  const matchedName = tokens.filter((token) => content.includes(token));
  const addrTokens = addressTokens(address);
  const matchedAddress = addrTokens.filter((token) => page.text.includes(token));
  let verificationScore = Number(row.score || 0);
  const notes = [];

  if (matchedName.length) {
    verificationScore += Math.min(10, matchedName.length * 3);
    notes.push(`${matchedName.length}/${tokens.length} name tokens on site`);
  }
  if (tokens.length && matchedName.length === tokens.length) {
    verificationScore += 6;
    notes.push("all name tokens on site");
  }
  if (town && page.text.includes(town)) {
    verificationScore += 4;
    notes.push("town on site");
  }
  if (matchedAddress.length >= 2) {
    verificationScore += Math.min(8, matchedAddress.length * 2);
    notes.push(`${matchedAddress.length} address tokens on site`);
  }
  if (!page.ok) {
    verificationScore -= 8;
    notes.push(`fetch failed ${page.status || page.error}`);
  }

  const recommendation = verificationScore >= 24 ? "strong_review" : verificationScore >= 16 ? "review" : "weak";
  return {
    ...row,
    final_url: page.final_url,
    verification_score: verificationScore,
    recommendation,
    verification_notes: notes.join("; ")
  };
}

function writeCsv(rows, outputPath) {
  const headers = [
    "slug",
    "name",
    "town",
    "category",
    "address",
    "candidate_url",
    "final_url",
    "candidate_title",
    "score",
    "verification_score",
    "recommendation",
    "reasons",
    "verification_notes",
    "source_url"
  ];
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${[headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n")}\n`);
}

async function main() {
  const options = parseArgs();
  if (!fs.existsSync(options.inputPath)) {
    console.error(`Missing ${options.inputPath}. Run tools/discover-websites.js first.`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(options.inputPath, "utf8"));
  const [headers, ...records] = rows;
  const columns = Object.fromEntries(headers.map((header, index) => [header, index]));
  for (const required of ["slug", "name", "town", "category", "address", "candidate_url", "candidate_title", "score", "reasons", "source_url"]) {
    if (!(required in columns)) {
      console.error(`Missing required column: ${required}`);
      process.exit(1);
    }
  }

  const candidateRows = records
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])))
    .filter((row) => row.candidate_url && !blocked(row.candidate_url) && Number(row.score || 0) >= options.minScore);
  const bestBySlug = new Map();
  for (const row of candidateRows) {
    const current = bestBySlug.get(row.slug);
    if (!current || Number(row.score || 0) > Number(current.score || 0)) {
      bestBySlug.set(row.slug, row);
    }
  }
  const candidates = [...bestBySlug.values()].slice(0, options.limit);

  const verified = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    process.stdout.write(`[${index + 1}/${candidates.length}] ${candidate.name}\n`);
    const page = await fetchPage(candidate.candidate_url);
    verified.push(verify(candidate, page));
  }

  verified.sort((a, b) => Number(b.verification_score || 0) - Number(a.verification_score || 0));
  writeCsv(verified, options.outputPath);
  console.log(`Wrote ${verified.length} verified candidates to ${options.outputPath}`);
  console.log(`${verified.filter((row) => row.recommendation === "strong_review").length} strong review candidates`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
