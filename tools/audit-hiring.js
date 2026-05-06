const fs = require("fs");
const path = require("path");

const INPUT = "companies.json";
const REPORT_DIR = "reports";
const REPORT_PATH = path.join(REPORT_DIR, "hiring-audit.json");
const DEFAULT_LIMIT = 80;
const REQUEST_TIMEOUT_MS = 9000;
const USER_AGENT = "TinicumTalentThrive/1.0 hiring-signal-audit";

const POSITIVE_PATTERNS = [
  /\bnow hiring\b/i,
  /\bwe'?re hiring\b/i,
  /\bjoin our team\b/i,
  /\bjob openings?\b/i,
  /\bopen positions?\b/i,
  /\bcurrent openings?\b/i,
  /\bview jobs\b/i,
  /\bapply now\b/i,
  /\bemployment opportunities\b/i,
  /\bcareer opportunities\b/i
];

const CAREER_LINK_PATTERNS = [
  /careers?/i,
  /jobs?/i,
  /employment/i,
  /join[-_\s]?our[-_\s]?team/i,
  /work[-_\s]?with[-_\s]?us/i,
  /opportunities/i,
  /apply/i
];

const NEGATIVE_PATTERNS = [
  /not currently hiring/i,
  /no current openings/i,
  /no open positions/i,
  /not accepting applications/i
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: DEFAULT_LIMIT,
    offset: 0,
    update: false,
    onlyWithWebsite: true,
    onlyUnaudited: false,
    town: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--update") options.update = true;
    else if (arg === "--only-unaudited") options.onlyUnaudited = true;
    else if (arg === "--include-no-website") options.onlyWithWebsite = false;
    else if (arg === "--limit") options.limit = Number(args[++index]);
    else if (arg === "--offset") options.offset = Number(args[++index]);
    else if (arg === "--town") options.town = args[++index];
  }

  return options;
}

function normalizeUrl(value) {
  if (!value || value.includes("example.com")) return null;
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

function townFor(company) {
  const parts = (company.address || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 4 && /^(PA|NJ)$/i.test(parts[parts.length - 2])) return parts[parts.length - 3];
  if (parts.length >= 2) return parts[parts.length - 2].replace(/\bPA\b|\bNJ\b/g, "").trim();
  return "Town needs audit";
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const href = new URL(match[1], baseUrl).href;
      const text = stripHtml(match[2]).slice(0, 120);
      links.push({ href, text });
    } catch {
      // Ignore malformed hrefs.
    }
  }
  return links;
}

function findCareerLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = extractLinks(html, baseUrl)
    .filter((link) => {
      const url = new URL(link.href);
      if (url.hostname !== base.hostname) return false;
      const haystack = `${url.pathname} ${link.text}`;
      return CAREER_LINK_PATTERNS.some((pattern) => pattern.test(haystack));
    })
    .map((link) => link.href);

  const fallbackPaths = ["/careers", "/career", "/jobs", "/employment", "/join-our-team", "/work-with-us"];
  for (const fallbackPath of fallbackPaths) {
    links.push(new URL(fallbackPath, base.origin).href);
  }

  return [...new Set(links)].slice(0, 4);
}

async function fetchText(url) {
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
      return { ok: false, status: response.status, url: response.url, text: "" };
    }
    const html = await response.text();
    return { ok: true, status: response.status, url: response.url, html, text: stripHtml(html) };
  } catch (error) {
    return { ok: false, status: 0, url, error: error.message, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

function scorePage(text, url) {
  const positives = POSITIVE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  const negatives = NEGATIVE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  let score = 0;
  if (/careers?|jobs?|employment|join-our-team|work-with-us/i.test(url)) score += 2;
  score += positives.length * 3;
  score -= negatives.length * 4;
  return { score, positives, negatives };
}

async function auditCompany(company) {
  const website = normalizeUrl(company.website);
  if (!website) {
    return {
      slug: company.slug,
      name: company.name,
      website: company.website || null,
      hiring_signal: "unknown",
      hiring_confidence: 0,
      evidence_url: null,
      notes: "No usable website URL"
    };
  }

  const pages = [];
  const home = await fetchText(website);
  if (home.ok) {
    pages.push(home);
    const careerLinks = findCareerLinks(home.html, home.url);
    for (const link of careerLinks) {
      const page = await fetchText(link);
      if (page.ok) pages.push(page);
    }
  } else {
    return {
      slug: company.slug,
      name: company.name,
      website,
      hiring_signal: "unknown",
      hiring_confidence: 0,
      evidence_url: website,
      notes: `Website fetch failed: ${home.status || home.error}`
    };
  }

  let best = { score: -999, positives: [], negatives: [], url: website };
  for (const page of pages) {
    const scored = scorePage(page.text, page.url);
    if (scored.score > best.score) best = { ...scored, url: page.url };
  }

  let hiringSignal = "unknown";
  let confidence = 0.25;
  if (best.negatives.length && best.score < 1) {
    hiringSignal = "not_hiring_signal";
    confidence = 0.65;
  } else if (best.score >= 8) {
    hiringSignal = "hiring_likely";
    confidence = 0.85;
  } else if (best.score >= 4) {
    hiringSignal = "hiring_possible";
    confidence = 0.6;
  } else if (best.score >= 2) {
    hiringSignal = "careers_page_found";
    confidence = 0.45;
  }

  return {
    slug: company.slug,
    name: company.name,
    website,
    hiring_signal: hiringSignal,
    hiring_confidence: confidence,
    evidence_url: best.url,
    positive_matches: best.positives,
    negative_matches: best.negatives,
    pages_checked: pages.map((page) => page.url)
  };
}

function applyAudit(companies, results) {
  const bySlug = new Map(companies.map((company) => [company.slug, company]));
  for (const result of results) {
    const company = bySlug.get(result.slug);
    if (!company) continue;
    company.hiring_signal = result.hiring_signal;
    company.hiring_confidence = result.hiring_confidence;
    company.hiring_evidence_url = result.evidence_url;
    company.hiring_last_checked = new Date().toISOString().slice(0, 10);
    if (["hiring_likely", "hiring_possible", "careers_page_found"].includes(result.hiring_signal)) {
      company.hiring = true;
    } else if (result.hiring_signal === "not_hiring_signal" && result.hiring_confidence >= 0.65) {
      company.hiring = false;
    }
  }
}

async function main() {
  const options = parseArgs();
  const companies = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const eligible = companies.filter((company) => {
    if (options.onlyWithWebsite && !normalizeUrl(company.website)) return false;
    if (options.onlyUnaudited && company.hiring_signal) return false;
    if (options.town && townFor(company).toLowerCase() !== options.town.toLowerCase()) return false;
    return true;
  });
  const batch = eligible.slice(options.offset, options.offset + options.limit);
  const results = [];

  for (let index = 0; index < batch.length; index += 1) {
    const company = batch[index];
    process.stdout.write(`[${index + 1}/${batch.length}] ${company.name}\n`);
    results.push(await auditCompany(company));
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    options,
    eligible_count: eligible.length,
    audited_count: results.length,
    results
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  if (options.update) {
    applyAudit(companies, results);
    fs.writeFileSync(INPUT, `${JSON.stringify(companies, null, 2)}\n`);
  }

  const summary = results.reduce((counts, result) => {
    counts[result.hiring_signal] = (counts[result.hiring_signal] || 0) + 1;
    return counts;
  }, {});
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
