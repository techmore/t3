const fs = require("fs");
const path = require("path");

const REPORT_DIR = "reports";

function hasUsableWebsite(company) {
  return Boolean(company.website && !company.website.includes("example.com"));
}

function townFor(company) {
  const parts = (company.address || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 4 && /^(PA|NJ)$/i.test(parts[parts.length - 2])) return parts[parts.length - 3];
  if (parts.length >= 2) return parts[parts.length - 2].replace(/\bPA\b|\bNJ\b/g, "").trim();
  return "Town needs audit";
}

function websiteDiscoveryQuery(company) {
  return `${company.name} ${townFor(company)} ${company.category} official website`;
}

function websiteDiscoveryUrl(company) {
  return `https://www.google.com/search?q=${encodeURIComponent(websiteDiscoveryQuery(company))}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(fileName, rows) {
  const headers = [
    "slug",
    "name",
    "town",
    "category",
    "address",
    "website",
    "website_search_query",
    "website_search_url",
    "hiring_signal",
    "hiring_confidence",
    "hiring_evidence_url",
    "source_url",
    "data_status"
  ];
  const csvRows = [
    headers.join(","),
    ...rows.map((company) =>
      headers
        .map((header) => {
          if (header === "town") return csvEscape(townFor(company));
          if (header === "website_search_query") return csvEscape(websiteDiscoveryQuery(company));
          if (header === "website_search_url") return csvEscape(websiteDiscoveryUrl(company));
          return csvEscape(company[header]);
        })
        .join(",")
    )
  ];
  fs.writeFileSync(path.join(REPORT_DIR, fileName), `${csvRows.join("\n")}\n`);
}

const companies = JSON.parse(fs.readFileSync("companies.json", "utf8"));
const needsWebsite = companies.filter((company) => !hasUsableWebsite(company));
const positiveSignals = companies
  .filter((company) => ["hiring_likely", "hiring_possible", "careers_page_found"].includes(company.hiring_signal))
  .sort((a, b) => (b.hiring_confidence || 0) - (a.hiring_confidence || 0));
const unknownSignals = companies.filter((company) => company.hiring_signal === "unknown");

fs.mkdirSync(REPORT_DIR, { recursive: true });
writeCsv("needs-website.csv", needsWebsite);
writeCsv("positive-hiring-signals.csv", positiveSignals);
writeCsv("unknown-hiring-signals.csv", unknownSignals);

console.log(`Wrote ${needsWebsite.length} needs-website rows`);
console.log(`Wrote ${positiveSignals.length} positive hiring signal rows`);
console.log(`Wrote ${unknownSignals.length} unknown hiring signal rows`);
