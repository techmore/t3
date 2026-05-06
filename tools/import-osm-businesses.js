const fs = require("fs");

const CENTER = { latitude: 40.4825, longitude: -75.1069 };
const RADIUS_METERS = Math.round(25 * 1609.344);
const SOURCE_URL = "https://overpass-api.de/api/interpreter";
const IMPORT_KEYS = ["shop", "amenity", "office", "craft", "tourism", "leisure", "building", "industrial", "healthcare"];
const CATEGORY_LIMITS = {
  Dining: 850,
  Retail: 850,
  "Professional Services": 700,
  Healthcare: 550,
  Automotive: 450,
  "Beauty & Wellness": 425,
  Hospitality: 375,
  "Specialty Food & Gifts": 375,
  "Lifestyle & Home Decor": 360,
  Services: 350,
  Education: 300,
  "Business Services": 300,
  "Financial & Services": 260,
  "Sports & Recreation": 260,
  "Skilled Trades": 240,
  Manufacturing: 220,
  "Local Business": 180
};

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function distanceMiles(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function categoryFor(tags) {
  if (tags.shop) return shopCategory(tags.shop);
  if (tags.amenity) return amenityCategory(tags.amenity);
  if (tags.office) return officeCategory(tags.office);
  if (tags.healthcare) return "Healthcare";
  if (tags.industrial) return "Manufacturing";
  if (tags.building) return buildingCategory(tags.building);
  if (tags.craft) return "Skilled Trades";
  if (tags.tourism) return "Hospitality";
  if (tags.leisure) return "Sports & Recreation";
  return "Local Business";
}

function shopCategory(value) {
  const food = new Set(["bakery", "butcher", "cheese", "coffee", "confectionery", "deli", "farm", "greengrocer", "seafood", "spices", "tea", "wine"]);
  const retail = new Set(["books", "boutique", "clothes", "convenience", "department_store", "florist", "gift", "jewelry", "shoes", "sports", "supermarket", "toys"]);
  const home = new Set(["antiques", "appliance", "doityourself", "furniture", "garden_centre", "hardware", "houseware", "interior_decoration"]);
  const auto = new Set(["car", "car_repair", "motorcycle", "tyres"]);
  if (food.has(value)) return "Specialty Food & Gifts";
  if (retail.has(value)) return "Retail";
  if (home.has(value)) return "Lifestyle & Home Decor";
  if (auto.has(value)) return "Automotive";
  if (value === "hairdresser" || value === "beauty") return "Beauty & Wellness";
  return "Retail";
}

function amenityCategory(value) {
  if (["bar", "biergarten", "cafe", "fast_food", "ice_cream", "pub", "restaurant"].includes(value)) return "Dining";
  if (["bank", "post_office"].includes(value)) return "Financial & Services";
  if (["clinic", "dentist", "doctors", "pharmacy", "veterinary"].includes(value)) return "Healthcare";
  if (["school", "college", "kindergarten", "library"].includes(value)) return "Education";
  if (["fuel", "car_wash"].includes(value)) return "Automotive";
  return "Services";
}

function officeCategory(value) {
  if (["accountant", "financial", "insurance", "lawyer", "real_estate", "tax_advisor"].includes(value)) return "Professional Services";
  if (value === "company" || value === "it") return "Business Services";
  return "Professional Services";
}

function buildingCategory(value) {
  if (["commercial", "office", "retail", "supermarket", "kiosk"].includes(value)) return "Business Services";
  if (["industrial", "warehouse"].includes(value)) return "Manufacturing";
  if (["hotel"].includes(value)) return "Hospitality";
  if (["hospital", "clinic"].includes(value)) return "Healthcare";
  return "Local Business";
}

function addressFor(tags) {
  const parts = [];
  if (tags["addr:housenumber"] || tags["addr:street"]) parts.push(`${tags["addr:housenumber"] || ""} ${tags["addr:street"] || ""}`.trim());
  if (tags["addr:city"]) parts.push(tags["addr:city"]);
  if (tags["addr:state"]) parts.push(tags["addr:state"]);
  if (tags["addr:postcode"]) parts.push(tags["addr:postcode"]);
  return parts.length ? parts.join(", ") : "Address needs audit";
}

function hasUsableAddress(tags) {
  return Boolean(tags["addr:street"] && (tags["addr:city"] || tags["addr:postcode"]));
}

function hasUsableName(name) {
  return /[a-zA-Z]{3,}/.test(name) && !/^\d+[A-Za-z]?$/.test(name.trim());
}

function descriptionFor(name, tags) {
  const type = tags.shop || tags.amenity || tags.office || tags.craft || tags.tourism || tags.leisure || "business";
  return `${name} is a named ${type.replaceAll("_", " ")} listing from OpenStreetMap inside the 25-mile Tinicum radius. Website, address, hiring, employee count, and onboarding details should be audited before publication as verified employer data.`;
}

function normalize(element) {
  const tags = element.tags || {};
  const name = tags.name && tags.name.trim();
  const latitude = element.lat || element.center?.lat;
  const longitude = element.lon || element.center?.lon;
  if (!name || !hasUsableName(name) || !latitude || !longitude || !hasUsableAddress(tags)) return null;
  if (distanceMiles(CENTER.latitude, CENTER.longitude, latitude, longitude) > 25) return null;

  const slug = `osm-${slugify(name)}-${element.type}-${element.id}`;
  return {
    name,
    slug,
    latitude,
    longitude,
    address: addressFor(tags),
    total_employees: null,
    hiring: false,
    years_in_business: null,
    best_places_score: null,
    onboarding_note: null,
    category: categoryFor(tags),
    website: tags.website || tags["contact:website"] || tags.url || null,
    description: descriptionFor(name, tags),
    logo_url: null,
    source_name: "OpenStreetMap Overpass business candidate import",
    source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    data_status: "needs-website-audit"
  };
}

async function main() {
  const existing = JSON.parse(fs.readFileSync("companies.json", "utf8"));
  const existingNames = new Set(existing.map((company) => company.name.toLowerCase()));
  const elements = [];
  for (const key of IMPORT_KEYS) {
    const query = `
      [out:json][timeout:60];
      (
        node["name"]["${key}"](around:${RADIUS_METERS},${CENTER.latitude},${CENTER.longitude});
        way["name"]["${key}"](around:${RADIUS_METERS},${CENTER.latitude},${CENTER.longitude});
        relation["name"]["${key}"](around:${RADIUS_METERS},${CENTER.latitude},${CENTER.longitude});
      );
      out center tags;
    `;
    const url = `${SOURCE_URL}?data=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "TinicumTalentThrive/1.0 (candidate data audit)"
      }
    });
    if (!response.ok) {
      throw new Error(`Overpass ${key} request failed: ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    elements.push(...(payload.elements || []));
  }

  const imported = [];
  const seenNames = new Set();
  const categoryCounts = new Map();
  for (const element of elements) {
    const company = normalize(element);
    if (!company) continue;
    const key = company.name.toLowerCase();
    if (existingNames.has(key) || seenNames.has(key)) continue;
    const limit = CATEGORY_LIMITS[company.category] ?? 40;
    const count = categoryCounts.get(company.category) || 0;
    if (count >= limit) continue;
    seenNames.add(key);
    categoryCounts.set(company.category, count + 1);
    imported.push(company);
  }

  imported.sort((a, b) => a.name.localeCompare(b.name));
  const combined = [...existing, ...imported].sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync("companies.json", `${JSON.stringify(combined, null, 2)}\n`);
  console.log(`Imported ${imported.length} OpenStreetMap business candidates`);
  console.log(`Wrote ${combined.length} companies to companies.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
