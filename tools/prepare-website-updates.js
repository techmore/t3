const fs = require("fs");
const path = require("path");

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
    inputPath: "reports/website-candidates.csv",
    outputPath: "reports/website-updates.csv",
    minScore: Number(process.env.MIN_WEBSITE_SCORE || 14),
    minVerificationScore: Number(process.env.MIN_VERIFICATION_SCORE || 0)
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") options.inputPath = args[++index];
    else if (arg === "--output") options.outputPath = args[++index];
    else if (arg === "--min-score") options.minScore = Number(args[++index]);
    else if (arg === "--min-verification-score") options.minVerificationScore = Number(args[++index]);
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

function blocked(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return BLOCKED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

const options = parseArgs();

if (!fs.existsSync(options.inputPath)) {
  console.error(`Missing ${options.inputPath}. Run tools/discover-websites.js first.`);
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(options.inputPath, "utf8"));
const [headers, ...records] = rows;
const columns = Object.fromEntries(headers.map((header, index) => [header, index]));

for (const required of ["slug", "name", "town", "candidate_url", "candidate_title", "score", "reasons"]) {
  if (!(required in columns)) {
    console.error(`Missing required column: ${required}`);
    process.exit(1);
  }
}

const bestBySlug = new Map();
for (const record of records) {
  const slug = record[columns.slug];
  const score = Number(record[columns.score] || 0);
  const verificationScore = columns.verification_score === undefined ? 0 : Number(record[columns.verification_score] || 0);
  const url = record[columns.candidate_url];
  if (!slug || !url || score < options.minScore) continue;
  if (columns.verification_score !== undefined && verificationScore < options.minVerificationScore) continue;
  if (blocked(url)) continue;
  const rank = verificationScore || score;
  const current = bestBySlug.get(slug);
  if (!current || rank > Number(current.rank || 0)) {
    bestBySlug.set(slug, {
      slug,
      website: url,
      name: record[columns.name],
      town: record[columns.town],
      score,
      verification_score: verificationScore || "",
      recommendation: columns.recommendation === undefined ? "" : record[columns.recommendation],
      candidate_title: record[columns.candidate_title],
      reasons: record[columns.reasons],
      rank,
      approved: ""
    });
  }
}

const outputHeaders = ["approved", "slug", "website", "name", "town", "score", "verification_score", "recommendation", "candidate_title", "reasons"];
const outputRows = [
  outputHeaders.join(","),
  ...[...bestBySlug.values()].map((row) => outputHeaders.map((header) => csvEscape(row[header])).join(","))
];

fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
fs.writeFileSync(options.outputPath, `${outputRows.join("\n")}\n`);
console.log(`Prepared ${bestBySlug.size} candidate updates in ${options.outputPath}`);
console.log(`Minimum score: ${options.minScore}`);
if (options.minVerificationScore) console.log(`Minimum verification score: ${options.minVerificationScore}`);
console.log("Set approved=yes on rows you want to apply, then run tools/apply-website-updates.js");
