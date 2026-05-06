const fs = require("fs");

const TOP_50_SOURCE = "https://www.pa.gov/content/dam/copapwp-pagov/en/dli/documents/cwia/products/top-50-emp-ind/bucks_county_top_50.pdf";

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function anchor(overrides) {
  return {
    name: overrides.name,
    slug: `anchor-${slugify(overrides.name)}`,
    latitude: overrides.latitude,
    longitude: overrides.longitude,
    address: overrides.address,
    total_employees: overrides.total_employees ?? null,
    hiring: overrides.hiring ?? true,
    years_in_business: overrides.years_in_business ?? null,
    best_places_score: null,
    onboarding_note: overrides.onboarding_note ?? null,
    category: overrides.category,
    website: overrides.website,
    description: overrides.description,
    logo_url: null,
    source_name: overrides.source_name,
    source_url: overrides.source_url,
    data_status: "anchor-employer"
  };
}

const anchors = [
  anchor({
    name: "Penn Medicine Doylestown Health",
    latitude: 40.2987,
    longitude: -75.1524,
    address: "595 West State Street, Doylestown, PA 18901",
    total_employees: 2700,
    years_in_business: 100,
    category: "Healthcare",
    website: "https://www.doylestownhealth.org/careers",
    onboarding_note: "Career site and health system onboarding should be audited for role-specific details",
    description: "A major regional healthcare network anchored by Doylestown Hospital, now part of Penn Medicine.",
    source_name: "Penn Medicine Doylestown Health official site and PA CWIA Bucks County Top 50 Employers",
    source_url: "https://www.doylestownhealth.org/about-us"
  }),
  anchor({
    name: "Central Bucks School District",
    latitude: 40.3104,
    longitude: -75.1301,
    address: "20 Welden Drive, Doylestown, PA 18901",
    total_employees: 3000,
    category: "Education",
    website: "https://www.cbsd.org/",
    description: "One of Bucks County's largest employers and the public school district serving Doylestown and surrounding Central Bucks communities.",
    source_name: "Central Bucks School District contact page and PA CWIA Bucks County Top 50 Employers",
    source_url: "https://www.cbsd.org/Page/1420"
  }),
  anchor({
    name: "Bucks County Government",
    latitude: 40.3102,
    longitude: -75.1308,
    address: "55 East Court Street, Doylestown, PA 18901",
    category: "Government",
    website: "https://buckscounty.gov/27/Government",
    description: "County government operations based in Doylestown, including administration, courts, human services, parks, elections, and workforce functions.",
    source_name: "Bucks County official government page and PA CWIA Bucks County Top 50 Employers",
    source_url: "https://buckscounty.gov/27/Government"
  }),
  anchor({
    name: "Delaware Valley University",
    latitude: 40.2979,
    longitude: -75.1589,
    address: "700 East Butler Avenue, Doylestown, PA 18901",
    years_in_business: 130,
    category: "Education",
    website: "https://delval.edu/",
    description: "A private university in the Doylestown area with undergraduate, graduate, continuing education, agricultural, and life sciences programs.",
    source_name: "Delaware Valley University official site",
    source_url: "https://delval.edu/about/visit-delval/maps-directions-parking"
  }),
  anchor({
    name: "Pennsylvania Biotechnology Center",
    latitude: 40.3294,
    longitude: -75.1282,
    address: "3805 Old Easton Road, Doylestown, PA 18902",
    category: "Tech",
    website: "https://pabiocenter.org/careers/",
    description: "A Doylestown life sciences campus and incubator that is home to more than 50 small to mid-size companies.",
    source_name: "Pennsylvania Biotechnology Center careers page",
    source_url: "https://pabiocenter.org/careers/"
  }),
  anchor({
    name: "Bucks County Intermediate Unit 22",
    latitude: 40.2822,
    longitude: -75.1217,
    address: "705 North Shady Retreat Road, Doylestown, PA 18901",
    category: "Education",
    website: "https://www.bucksiu.org/",
    description: "Regional educational service agency supporting Bucks County school districts, educators, students, and families.",
    source_name: "PA CWIA Bucks County Top 50 Employers",
    source_url: TOP_50_SOURCE
  }),
  anchor({
    name: "Pennridge School District",
    latitude: 40.3741,
    longitude: -75.2932,
    address: "1200 North 5th Street, Perkasie, PA 18944",
    category: "Education",
    website: "https://www.pennridge.org/",
    description: "A major Upper Bucks public school district and one of Bucks County's top employers.",
    source_name: "PA CWIA Bucks County Top 50 Employers",
    source_url: TOP_50_SOURCE
  }),
  anchor({
    name: "Grand View Health",
    latitude: 40.3636,
    longitude: -75.3232,
    address: "700 Lawn Avenue, Sellersville, PA 18960",
    category: "Healthcare",
    website: "https://www.gvh.org/careers/",
    description: "A regional health system and hospital serving Upper Bucks and nearby communities.",
    source_name: "Regional anchor employer seed; website audit recommended",
    source_url: "https://www.gvh.org/careers/"
  }),
  anchor({
    name: "St. Luke's Upper Bucks Campus",
    latitude: 40.4296,
    longitude: -75.3508,
    address: "3000 St. Luke's Drive, Quakertown, PA 18951",
    category: "Healthcare",
    website: "https://www.slhn.org/careers",
    description: "A St. Luke's hospital campus serving Upper Bucks and the Quakertown region.",
    source_name: "PA CWIA Bucks County Top 50 Employers",
    source_url: TOP_50_SOURCE
  }),
  anchor({
    name: "Bucks County Community College - Upper Bucks Campus",
    latitude: 40.4301,
    longitude: -75.3495,
    address: "1 Hillendale Road, Perkasie, PA 18944",
    category: "Education",
    website: "https://www.bucks.edu/",
    description: "Upper Bucks campus presence for Bucks County Community College, a countywide education employer.",
    source_name: "PA CWIA Bucks County Top 50 Employers",
    source_url: TOP_50_SOURCE
  })
];

const companies = JSON.parse(fs.readFileSync("companies.json", "utf8"));
const byName = new Map(companies.map((company) => [company.name.toLowerCase(), company]));
let added = 0;
let replaced = 0;

for (const item of anchors) {
  const key = item.name.toLowerCase();
  if (byName.has(key)) {
    Object.assign(byName.get(key), item);
    replaced += 1;
  } else {
    companies.push(item);
    added += 1;
  }
}

companies.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync("companies.json", `${JSON.stringify(companies, null, 2)}\n`);
console.log(`Added ${added} anchor employers; updated ${replaced}; wrote ${companies.length} companies`);
