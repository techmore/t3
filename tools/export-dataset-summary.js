const fs = require("fs");
const path = require("path");

const DEFAULT_OUTPUT_DIR = "reports";
const POSITIVE_SIGNALS = new Set(["hiring_likely", "hiring_possible", "careers_page_found"]);

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    minTownCount: 1
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
    } else if (arg === "--min-town-count") {
      options.minTownCount = parseNumber(readValue(args, index, arg), arg);
      index += 1;
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

function readValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${optionName}`);
    process.exit(1);
  }
  return value;
}

function parseNumber(value, optionName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    console.error(`${optionName} must be a non-negative integer`);
    process.exit(1);
  }
  return number;
}

function hasUsableWebsite(company) {
  return Boolean(company.website && !company.website.includes("example.com"));
}

function townFor(company) {
  const parts = (company.address || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 4 && /^(PA|NJ)$/i.test(parts[parts.length - 2])) return parts[parts.length - 3];
  if (parts.length >= 2) return parts[parts.length - 2].replace(/\bPA\b|\bNJ\b/g, "").trim();
  return "Town needs audit";
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function pct(value, total) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(1));
}

function nextAction(row) {
  if (row.needs_website >= 25) return "discover_websites";
  if (row.not_audited > 0) return "run_hiring_audit";
  if (row.unknown_signals >= 10) return "manual_unknown_review";
  return "maintain";
}

function emptyTownRow(town) {
  return {
    town,
    companies: 0,
    usable_websites: 0,
    audited: 0,
    positive_signals: 0,
    unknown_signals: 0,
    not_hiring_signals: 0,
    not_audited: 0,
    needs_website: 0
  };
}

function buildTownSummary(companies, minTownCount) {
  const byTown = new Map();
  for (const company of companies) {
    const town = townFor(company);
    if (!byTown.has(town)) byTown.set(town, emptyTownRow(town));
    const row = byTown.get(town);
    const signal = company.hiring_signal || "not_audited";
    row.companies += 1;
    if (hasUsableWebsite(company)) row.usable_websites += 1;
    else row.needs_website += 1;
    if (company.hiring_signal) row.audited += 1;
    if (POSITIVE_SIGNALS.has(signal)) row.positive_signals += 1;
    else if (signal === "unknown") row.unknown_signals += 1;
    else if (signal === "not_hiring_signal") row.not_hiring_signals += 1;
    else if (signal === "not_audited") row.not_audited += 1;
  }

  return [...byTown.values()]
    .filter((row) => row.companies >= minTownCount)
    .map((row) => ({
      ...row,
      website_coverage_pct: pct(row.usable_websites, row.companies),
      audit_coverage_pct: pct(row.audited, row.usable_websites),
      next_action: nextAction(row)
    }))
    .sort((a, b) => b.needs_website - a.needs_website || b.companies - a.companies || a.town.localeCompare(b.town));
}

function countBy(companies, keyFn) {
  const counts = new Map();
  for (const company of companies) {
    const key = keyFn(company) || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function writeCsv(outputPath, rows) {
  const headers = [
    "town",
    "companies",
    "usable_websites",
    "website_coverage_pct",
    "audited",
    "audit_coverage_pct",
    "positive_signals",
    "unknown_signals",
    "not_hiring_signals",
    "not_audited",
    "needs_website",
    "next_action"
  ];
  const csvRows = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ];
  fs.writeFileSync(outputPath, `${csvRows.join("\n")}\n`);
}

const options = parseArgs();
const companies = JSON.parse(fs.readFileSync("companies.json", "utf8"));
const townSummary = buildTownSummary(companies, options.minTownCount);
const totals = {
  companies: companies.length,
  usable_websites: companies.filter(hasUsableWebsite).length,
  needs_website: companies.filter((company) => !hasUsableWebsite(company)).length,
  audited: companies.filter((company) => company.hiring_signal).length,
  positive_signals: companies.filter((company) => POSITIVE_SIGNALS.has(company.hiring_signal)).length,
  unknown_signals: companies.filter((company) => company.hiring_signal === "unknown").length,
  not_hiring_signals: companies.filter((company) => company.hiring_signal === "not_hiring_signal").length,
  not_audited: companies.filter((company) => !company.hiring_signal).length
};

const summary = {
  generated_at: new Date().toISOString(),
  totals: {
    ...totals,
    website_coverage_pct: pct(totals.usable_websites, totals.companies),
    audit_coverage_pct: pct(totals.audited, totals.usable_websites)
  },
  by_signal: countBy(companies, (company) => company.hiring_signal || "not_audited"),
  by_category: countBy(companies, (company) => company.category),
  town_summary: townSummary
};

fs.mkdirSync(options.outputDir, { recursive: true });
const jsonPath = path.join(options.outputDir, "dataset-summary.json");
const csvPath = path.join(options.outputDir, "town-coverage.csv");
fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
writeCsv(csvPath, townSummary);

console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${csvPath}`);
console.log(summary.totals);
