const fs = require("fs");
const path = require("path");

const REPORT_DIR = "reports";
const DEFAULT_LIMIT = 50;
const REQUEST_DELAY_MS = 900;
const USER_AGENT = "TinicumTalentThrive/1.0 website-discovery-review";

const BLOCKED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "yelp.com",
  "yellowpages.com",
  "yellow-pages.us.com",
  "superpages.com",
  "storeshours.com",
  "mfgpages.com",
  "unilocal.co.uk",
  "bizapedia.com",
  "cataloxy.us",
  "hairsalonsinusa.com",
  "salondiscover.com",
  "beautynailhairsalons.com",
  "tripadvisor.com",
  "theknot.com",
  "weddingwire.com",
  "omglocallife.com",
  "nextdoor.com",
  "visitbuckscounty.com",
  "centralbuckschamber.com",
  "sudentistalatino.org",
  "businessyab.com",
  "berksconnect.com",
  "hoursofoperations.com",
  "winnie.com",
  "doylestownobserver.com",
  "github.com",
  "issuu.com",
  "mapquest.com",
  "manta.com",
  "bbb.org",
  "hotfrog.com",
  "allbiz.com",
  "411.info",
  "cortera.com",
  "optix-now.com",
  "dental.page",
  "wellness.com",
  "birdeye.com",
  "salons10.com",
  "findglocal.com",
  "thebeautyloc.com",
  "countyoffice.org",
  "childcarecenter.us",
  "mallsinamerica.com",
  "opencorporates.com",
  "dnb.com",
  "dandb.com",
  "furnitureloc.com",
  "antiquestoresnearby.com",
  "onmaps.online",
  "buzzfile.com",
  "chamberofcommerce.com",
  "loc8nearme.com",
  "hoursguide.com",
  "local.yahoo.com",
  "whereorg.com",
  "zoominfo.com",
  "indeed.com",
  "glassdoor.com",
  "zillow.com",
  "apartments.com",
  "realtor.com",
  "loopnet.com",
  "openstreetmap.org",
  "google.com"
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: DEFAULT_LIMIT,
    offset: 0,
    towns: [],
    outputPath: path.join(REPORT_DIR, "website-candidates.csv"),
    append: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--limit") options.limit = Number(args[++index]);
    else if (arg === "--offset") options.offset = Number(args[++index]);
    else if (arg === "--town") options.towns.push(args[++index]);
    else if (arg === "--towns") options.towns.push(...args[++index].split(",").map((town) => town.trim()).filter(Boolean));
    else if (arg === "--output") options.outputPath = args[++index];
    else if (arg === "--append") options.append = true;
  }
  options.towns = options.towns.map((town) => town.toLowerCase());
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function stripHtml(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
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

function hasBusinessLikeName(company) {
  const normalized = normalizeText(company.name);
  const businessWords = /\b(restaurant|bar|grill|cafe|pizza|diner|salon|spa|dental|dentist|doctor|health|fitness|market|bakery|auto|tire|hotel|inn|store|shop|school|library|brew|bank|farm|church|center|clinic|pharmacy)\b/;
  if (/^\d+\s/.test(normalized) && !businessWords.test(normalized)) return false;
  return /[a-z]{3,}/.test(normalized);
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

function discoveryQuery(company) {
  return `${company.name} ${townFor(company)} ${company.category} official website`;
}

function cleanDuckDuckGoUrl(rawUrl) {
  const decoded = decodeHtml(rawUrl);
  try {
    const url = decoded.startsWith("//") ? new URL(`https:${decoded}`) : new URL(decoded);
    const uddg = url.searchParams.get("uddg");
    return uddg ? new URL(uddg).href : url.href;
  } catch {
    return null;
  }
}

function blocked(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return BLOCKED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

function parseResults(html) {
  const matches = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  return matches
    .map((match) => ({
      url: cleanDuckDuckGoUrl(match[1]),
      title: stripHtml(match[2])
    }))
    .filter((result) => result.url && !blocked(result.url))
    .slice(0, 8);
}

function scoreCandidate(company, result) {
  const tokens = nameTokens(company.name);
  const town = normalizeText(townFor(company));
  const title = normalizeText(result.title);
  const url = normalizeText(result.url);
  const hostname = normalizeText(new URL(result.url).hostname.replace(/^www\./, "").split(".")[0]);
  let score = 0;
  const reasons = [];

  const hostMatches = tokens.filter((token) => hostname.includes(token) || url.includes(token));
  const titleMatches = tokens.filter((token) => title.includes(token));
  if (hostMatches.length) {
    score += Math.min(8, hostMatches.length * 4);
    reasons.push(`${hostMatches.length} host/url name token matches`);
  }
  if (titleMatches.length) {
    score += Math.min(3, titleMatches.length);
    reasons.push(`${titleMatches.length} title name token matches`);
  }
  if (tokens.length && (hostMatches.length === tokens.length || titleMatches.length === tokens.length)) {
    score += 4;
    reasons.push("all name tokens match");
  }
  if (town && (title.includes(town) || url.includes(town))) {
    score += 2;
    reasons.push("town match");
  }
  if (!/directory|reviews?|hours|near me|map|menu|profile|listing/i.test(result.title)) {
    score += 1;
    reasons.push("non-directory title");
  }
  return { score, reasons: reasons.join("; ") };
}

async function search(company) {
  const query = discoveryQuery(company);
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html"
    }
  });
  if (!response.ok) throw new Error(`Search failed ${response.status}`);
  const html = await response.text();
  const results = parseResults(html).map((result) => ({ ...result, ...scoreCandidate(company, result) }));
  results.sort((a, b) => b.score - a.score);
  return { query, results };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(rows, options) {
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  const headers = [
    "slug",
    "name",
    "town",
    "category",
    "address",
    "search_query",
    "candidate_url",
    "candidate_title",
    "score",
    "reasons",
    "source_url"
  ];
  const includeHeader = !options.append || !fs.existsSync(options.outputPath) || fs.statSync(options.outputPath).size === 0;
  const lines = [
    ...(includeHeader ? [headers.join(",")] : []),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ];
  const payload = `${lines.join("\n")}\n`;
  if (options.append) fs.appendFileSync(options.outputPath, payload);
  else fs.writeFileSync(options.outputPath, payload);
  return options.outputPath;
}

async function main() {
  const options = parseArgs();
  const companies = JSON.parse(fs.readFileSync("companies.json", "utf8"));
  const queue = companies
    .filter((company) => !hasUsableWebsite(company))
    .filter((company) => hasBusinessLikeName(company))
    .filter((company) => !options.towns.length || options.towns.includes(townFor(company).toLowerCase()))
    .slice(options.offset, options.offset + options.limit);

  const rows = [];
  for (let index = 0; index < queue.length; index += 1) {
    const company = queue[index];
    process.stdout.write(`[${index + 1}/${queue.length}] ${company.name}\n`);
    try {
      const { query, results } = await search(company);
      for (const result of results.slice(0, 3)) {
        rows.push({
          slug: company.slug,
          name: company.name,
          town: townFor(company),
          category: company.category,
          address: company.address,
          search_query: query,
          candidate_url: result.url,
          candidate_title: result.title,
          score: result.score,
          reasons: result.reasons,
          source_url: company.source_url
        });
      }
    } catch (error) {
      rows.push({
        slug: company.slug,
        name: company.name,
        town: townFor(company),
        category: company.category,
        address: company.address,
        search_query: discoveryQuery(company),
        candidate_url: "",
        candidate_title: "",
        score: 0,
        reasons: error.message,
        source_url: company.source_url
      });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const filePath = writeCsv(rows, options);
  const strong = rows.filter((row) => Number(row.score) >= 9).length;
  console.log(`Wrote ${rows.length} candidate rows to ${filePath}`);
  console.log(`${strong} candidates scored 9 or higher`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
