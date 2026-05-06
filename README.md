# T3 - Tinicum Talent Transformation

A production-ready static GitHub Pages site for Tinicum Talent Thrive. T3 is a hyper-local company directory and opportunity map for Tinicum Township and the surrounding 25-mile radius in Bucks County, PA.

## What is included

- Static HTML, CSS, and vanilla JavaScript
- Leaflet.js map with OpenStreetMap tiles
- 25-mile radius centered on `40.4825, -75.1069`
- Company markers, popups, and individual detail pages
- Filterable and sortable directory
- Single `companies.json` data source
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

Use a URL-safe `slug` because each detail page lives at `company/[slug].html`. If you add a new company, duplicate any existing file in `company/`, rename it to the new slug, and update the `data-company-slug` value in the `<body>` tag.

Companies outside the 25-mile radius are automatically hidden by the map and directory scripts.
