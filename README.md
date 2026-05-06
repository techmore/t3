# T3 - Tinicum Talent Transformation

A production-ready static GitHub Pages site for Tinicum Talent Thrive. T3 is a hyper-local company directory and opportunity map for Tinicum Township and the surrounding 25-mile radius in Bucks County, PA.

## What is included

- Static HTML, CSS, and vanilla JavaScript
- Leaflet.js map with OpenStreetMap tiles
- Marker clustering for large local datasets
- 25-mile radius centered on `40.4825, -75.1069`
- Company markers, popups, and individual detail pages
- Filterable and sortable directory
- Single `companies.json` data source
- Offline source/audit notes in `sources.md`
- Data builder in `tools/build-companies.js`
- OpenStreetMap candidate importer in `tools/import-osm-businesses.js`
- Anchor employer seed script in `tools/add-anchor-employers.js`
- Hiring signal audit script in `tools/audit-hiring.js`
- Hiring review page at `hiring-audit.html`
- Data quality dashboard at `data-quality.html`
- GitHub Pages-ready root folder structure

## Run locally

Because the site fetches `companies.json`, run it with a local web server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to GitHub Pages

1. Push this repository to `https://github.com/techmore/t3`.
2. In GitHub, open **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder.
5. Save. GitHub Pages will publish the static site.

## Add or update companies

Edit `companies.json`. Each company object should include:

```json
{
  "name": "Company Name",
  "slug": "company-name",
  "latitude": 40.4825,
  "longitude": -75.1069,
  "address": "Street, Town, PA ZIP",
  "total_employees": 100,
  "hiring": true,
  "years_in_business": 12,
  "best_places_score": 8.5,
  "onboarding_note": "Excellent onboarding program",
  "category": "Manufacturing",
  "website": "https://example.com",
  "description": "Short paragraph about the company.",
  "logo_url": null
}
```

Use a URL-safe `slug`. Detail pages are available through `company/index.html?slug=your-company-slug`, so new companies do not require a new HTML file.

Companies outside the 25-mile radius are automatically hidden by the map and directory scripts.

## Rebuild the seeded directory

The current expanded directory is generated from `tools/build-companies.js`, including a seeded Peddler's Village directory from the official March 2025 map PDF.

```bash
node tools/build-companies.js
```

After rebuilding, review `companies.json` before publishing. Entries with `data_status: "needs-website-audit"` need human or scripted verification for website, hiring status, employee count, and onboarding details.

To significantly expand candidate listings from OpenStreetMap:

```bash
node tools/import-osm-businesses.js
```

Run the OSM import after the base build. It adds broad local candidates and preserves source URLs for audit. The importer intentionally requires usable names and addresses so the public directory remains navigable.

Then add larger regional anchor employers:

```bash
node tools/add-anchor-employers.js
```

## Audit hiring signals

Run a website audit batch to look for careers pages, job links, and hiring language:

```bash
node tools/audit-hiring.js --town Doylestown --limit 50 --update
```

To avoid re-checking records that already have a signal:

```bash
node tools/audit-hiring.js --town Doylestown --only-unaudited --limit 50 --update
```

The script writes `reports/hiring-audit.json`. With `--update`, it also adds fields such as `hiring_signal`, `hiring_confidence`, `hiring_evidence_url`, and `hiring_last_checked` to matching company records. Treat these as evidence signals, not final truth; records still need manual review before being advertised as verified.

To export CSV review queues:

```bash
node tools/export-review-queues.js
```

To apply manually discovered websites, create `reports/website-updates.csv` with `slug,website`, then run:

```bash
node tools/apply-website-updates.js
```

After applying new websites, rerun `tools/audit-hiring.js --only-unaudited --update` to audit the new website-backed records.

To generate candidate website matches for review:

```bash
node tools/discover-websites.js --town Doylestown --limit 50
```

This writes `reports/website-candidates.csv`. Review the candidates before applying them.

Discovery can also target several towns and write to a dedicated file:

```bash
node tools/discover-websites.js --towns Doylestown,Quakertown --limit 100 --output reports/priority-website-candidates.csv
```

Use `--append` to add another run to an existing candidate file.

To fetch candidate sites and add a verification score:

```bash
node tools/verify-website-candidates.js --input reports/priority-website-candidates.csv --output reports/priority-verified-websites.csv --min-score 12
```

This still does not update `companies.json`; it produces a stronger review queue.

To prepare update rows from verified candidates:

```bash
node tools/prepare-website-updates.js --input reports/priority-verified-websites.csv --output reports/priority-website-updates.csv --min-score 12 --min-verification-score 24
```

To prepare a reviewable update file from discovered candidates:

```bash
node tools/prepare-website-updates.js
```

The generated `reports/website-updates.csv` includes an `approved` column. Set `approved=yes` for rows you trust before running `tools/apply-website-updates.js`.

You can tighten candidate selection with:

```bash
node tools/prepare-website-updates.js --min-score 16
```
