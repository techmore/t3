# Data Sources and Scraping Plan

This project is still a static GitHub Pages site. The scraping/audit layer is intentionally offline: collect candidate companies, verify them, then publish the curated result into `companies.json`.

## Current seeded sources

- Peddler's Village shop directory PDF, March 2025: `https://peddlersvillage.com/wp-content/uploads/2025/03/PV-Map0325.pdf`
- Peddler's Village official site: `https://peddlersvillage.com/`
- OpenStreetMap Overpass candidate import: `https://overpass-api.de/api/interpreter`
- Pennsylvania CWIA Bucks County Top 50 Employers PDF: `https://www.pa.gov/content/dam/copapwp-pagov/en/dli/documents/cwia/products/top-50-emp-ind/bucks_county_top_50.pdf`
- Known individual Peddler's Village business sites where available from public search results:
  - Buttonwood Grill: `https://buttonwoodgrill.com/`
  - Hart's Tavern: `https://hartstavern.com/`
  - Painted Pony Cafe: `https://giggleberryfair.com/painted-pony-cafe/`
  - Fox & Holly: `https://www.foxandhollybuckscounty.com/`
  - Giggleberry Fair: `https://giggleberryfair.com/`

## Pennsylvania public business data

Pennsylvania's Business One-Stop Shop and Department of State pages point users to Business Filing Services for entity lookup. As of this build, detailed Business Filing Services search appears to sit behind the Business Hub login flow, so it should be treated as an audit/manual lookup source unless a documented public export or API is found.

Potential official sources to audit:

- PA Business One-Stop Shop: `https://business.pa.gov/`
- PA Business Hub: `https://hub.business.pa.gov/`
- PA Department of State business page: `https://www.pa.gov/agencies/dos/programs/business`

## Recommended expansion workflow

1. Seed candidate employers from official town, chamber, shopping center, visitor bureau, school, healthcare, and municipal directories.
2. Normalize each candidate into the `companies.json` model.
3. Geocode addresses and discard records outside the 25-mile Tinicum radius.
4. Audit each website for:
   - current website URL
   - address
   - category
   - hiring or careers page signal
   - employee count where publicly stated
   - onboarding or training language
5. Mark low-confidence entries with `data_status: "needs-website-audit"` until verified.

## OpenStreetMap import

Run this after `node tools/build-companies.js` to add broad local business candidates from OpenStreetMap:

```bash
node tools/import-osm-businesses.js
```

This importer pulls named `shop`, `amenity`, `office`, `craft`, `tourism`, and `leisure` records within 25 miles of Tinicum Township. It deduplicates against existing names, preserves OSM source URLs, and marks imported records as `needs-website-audit`.

## Anchor employers

Run this after the OSM import to add or update larger regional anchor employers:

```bash
node tools/add-anchor-employers.js
```

The first anchor pass focuses on Doylestown and nearby major employers from official pages and the PA CWIA Bucks County Top 50 Employers list.

## Hiring signal audit

Run:

```bash
node tools/audit-hiring.js --town Doylestown --limit 50 --update
```

Use `--only-unaudited` for repeat passes so previously checked records are skipped.

The audit checks company websites for likely careers links and hiring language. It records evidence URLs and confidence scores, but it should not be treated as definitive. Some websites use third-party applicant tracking systems, block crawlers, or mention jobs without current openings. Use this as a prioritization queue for human review.

## Nearby source targets

- Peddler's Village businesses
- New Hope and Lambertville business directories
- Doylestown business directories
- Plumstead, Bedminster, Dublin, Ottsville, Riegelsville, Frenchtown, and Upper Black Eddy local directories
- Bucks County tourism and chamber listings
- Major schools, healthcare providers, farms, manufacturers, logistics firms, and hospitality groups inside the radius
