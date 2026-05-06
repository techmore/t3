const fs = require("fs");

const inputPath = process.argv[2] || "reports/website-updates.csv";

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

function hasUsableWebsite(company) {
  return Boolean(company.website && !company.website.includes("example.com"));
}

function normalizeUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).href;
  } catch {
    try {
      return new URL(`https://${value}`).href;
    } catch {
      return null;
    }
  }
}

if (!fs.existsSync(inputPath)) {
  console.error(`Missing ${inputPath}. Expected CSV columns: slug,website`);
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(inputPath, "utf8"));
const [headers, ...records] = rows;
const slugIndex = headers.indexOf("slug");
const websiteIndex = headers.indexOf("website");
const approvedIndex = headers.indexOf("approved");
if (slugIndex === -1 || websiteIndex === -1) {
  console.error("CSV must include slug and website columns");
  process.exit(1);
}

const companies = JSON.parse(fs.readFileSync("companies.json", "utf8"));
const bySlug = new Map(companies.map((company) => [company.slug, company]));
let updated = 0;
let skipped = 0;

for (const record of records) {
  if (approvedIndex !== -1 && !/^(1|true|yes|y)$/i.test(record[approvedIndex] || "")) {
    skipped += 1;
    continue;
  }
  const slug = record[slugIndex];
  const website = normalizeUrl(record[websiteIndex]);
  const company = bySlug.get(slug);
  if (!company || !website) {
    skipped += 1;
    continue;
  }
  const hadWebsite = hasUsableWebsite(company);
  company.website = website;
  if (!hadWebsite) {
    company.data_status = "website-discovered-needs-hiring-audit";
    delete company.hiring_signal;
    delete company.hiring_confidence;
    delete company.hiring_evidence_url;
    delete company.hiring_last_checked;
  }
  updated += 1;
}

fs.writeFileSync("companies.json", `${JSON.stringify(companies, null, 2)}\n`);
console.log(`Updated ${updated} websites; skipped ${skipped}`);
