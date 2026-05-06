const TINICUM_CENTER = [40.4825, -75.1069];
const RADIUS_MILES = 25;
const RADIUS_METERS = RADIUS_MILES * 1609.344;

const money = new Intl.NumberFormat("en-US");

async function getCompanies() {
  const response = await fetch(pathToRoot() + "companies.json");
  if (!response.ok) throw new Error("Unable to load companies.json");
  const companies = await response.json();
  return companies.filter((company) => distanceMiles(TINICUM_CENTER[0], TINICUM_CENTER[1], company.latitude, company.longitude) <= RADIUS_MILES);
}

function pathToRoot() {
  return window.location.pathname.includes("/company/") ? "../" : "";
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

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function markerIcon(company) {
  const color = company.hiring ? "#2f6f43" : "#716b5f";
  return L.divIcon({
    className: "t3-marker",
    html: `<span style="background:${color};border:3px solid #fff;border-radius:999px;box-shadow:0 6px 16px rgba(0,0,0,.24);display:block;height:24px;width:24px;"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10]
  });
}

function setupMap(elementId, companies, options = {}) {
  const map = L.map(elementId, { scrollWheelZoom: options.scrollWheelZoom ?? false }).setView(TINICUM_CENTER, options.zoom ?? 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  L.circle(TINICUM_CENTER, {
    radius: RADIUS_METERS,
    color: "#2f6f43",
    fillColor: "#8fbd73",
    fillOpacity: 0.12,
    weight: 2
  }).addTo(map);

  const markers = L.layerGroup().addTo(map);
  companies.forEach((company) => {
    const hiring = company.hiring ? '<strong style="color:#2f6f43;">Now Hiring</strong>' : "<strong>Not currently hiring</strong>";
    L.marker([company.latitude, company.longitude], { icon: markerIcon(company), title: company.name })
      .bindPopup(`
        <strong>${company.name}</strong><br>
        ${hiring}<br>
        ${money.format(company.total_employees)} employees<br>
        ${company.description}<br>
        <a href="${pathToRoot()}company/${company.slug}.html">Full company detail</a>
      `)
      .addTo(markers);
  });

  if (companies.length) {
    const bounds = L.latLngBounds(companies.map((company) => [company.latitude, company.longitude]));
    bounds.extend(TINICUM_CENTER);
    map.fitBounds(bounds.pad(0.2));
  }

  return { map, markers };
}

function companyCard(company) {
  const score = company.best_places_score ? `${company.best_places_score}/10` : "Not scored";
  const onboarding = company.onboarding_note ? "Strong onboarding" : "Onboarding not listed";
  return `
    <article class="company-card" data-slug="${company.slug}">
      <div class="card-top">
        <div class="logo" aria-hidden="true">${initials(company.name)}</div>
        <div>
          <h3>${company.name}</h3>
          <p class="meta">${company.category} • ${company.address}</p>
        </div>
      </div>
      <span class="badge ${company.hiring ? "" : "muted"}">${company.hiring ? "Now Hiring" : "Not currently hiring"}</span>
      <p>${company.description}</p>
      <p class="meta">${money.format(company.total_employees)} employees • ${company.years_in_business} years in business • Best Places: ${score} • ${onboarding}</p>
      <div class="card-actions">
        <a class="button secondary" href="${pathToRoot()}company/${company.slug}.html">Company Detail</a>
        <a class="button ghost" href="${pathToRoot()}index.html?company=${company.slug}">View on Map</a>
      </div>
    </article>
  `;
}

function updateStats(companies) {
  const statCompanies = document.querySelector("[data-stat='companies']");
  const statHiring = document.querySelector("[data-stat='hiring']");
  const statEmployees = document.querySelector("[data-stat='employees']");
  if (statCompanies) statCompanies.textContent = money.format(companies.length);
  if (statHiring) statHiring.textContent = money.format(companies.filter((company) => company.hiring).length);
  if (statEmployees) statEmployees.textContent = money.format(companies.reduce((sum, company) => sum + company.total_employees, 0));
}

function renderFeatured(companies) {
  const target = document.querySelector("[data-featured-companies]");
  if (!target) return;
  target.innerHTML = companies.slice(0, 6).map(companyCard).join("");
}

function initHome(companies) {
  updateStats(companies);
  renderFeatured(companies);
  const mapElement = document.getElementById("map");
  if (!mapElement) return;
  const { map } = setupMap("map", companies, { zoom: 10 });
  const slug = new URLSearchParams(window.location.search).get("company");
  const selected = companies.find((company) => company.slug === slug);
  if (selected) {
    map.setView([selected.latitude, selected.longitude], 13);
  }
}

function initDirectory(companies) {
  const results = document.querySelector("[data-directory-results]");
  if (!results) return;

  const categorySelect = document.querySelector("[data-filter='category']");
  const categories = [...new Set(companies.map((company) => company.category))].sort();
  categorySelect.innerHTML = `<option value="">All categories</option>${categories.map((category) => `<option value="${category}">${category}</option>`).join("")}`;

  const controls = document.querySelectorAll("[data-filter], [data-sort]");
  const render = () => {
    const query = document.querySelector("[data-filter='search']").value.trim().toLowerCase();
    const category = categorySelect.value;
    const hiringOnly = document.querySelector("[data-filter='hiring']").checked;
    const onboardingOnly = document.querySelector("[data-filter='onboarding']").checked;
    const sort = document.querySelector("[data-sort]").value;

    let filtered = companies.filter((company) => {
      const haystack = `${company.name} ${company.category} ${company.description} ${company.address}`.toLowerCase();
      return (
        (!query || haystack.includes(query)) &&
        (!category || company.category === category) &&
        (!hiringOnly || company.hiring) &&
        (!onboardingOnly || company.onboarding_note)
      );
    });

    filtered = filtered.sort((a, b) => {
      if (sort === "employees") return b.total_employees - a.total_employees;
      if (sort === "oldest") return b.years_in_business - a.years_in_business;
      if (sort === "newest") return a.years_in_business - b.years_in_business;
      if (sort === "score") return (b.best_places_score ?? -1) - (a.best_places_score ?? -1);
      return a.name.localeCompare(b.name);
    });

    document.querySelector("[data-result-count]").textContent = money.format(filtered.length);
    results.innerHTML = filtered.length ? filtered.map(companyCard).join("") : `<p class="panel">No companies match those filters.</p>`;
  };

  controls.forEach((control) => control.addEventListener("input", render));
  render();
}

function initDetail(companies) {
  const detail = document.querySelector("[data-company-detail]");
  if (!detail) return;
  const slug = document.body.dataset.companySlug;
  const company = companies.find((entry) => entry.slug === slug);
  if (!company) {
    detail.innerHTML = `<section class="panel"><h1>Company not found</h1><p class="lead">This company is not listed in the current T3 directory.</p></section>`;
    return;
  }

  document.title = `${company.name} | T3`;
  document.querySelector("[data-company-name]").textContent = company.name;
  document.querySelector("[data-company-description]").textContent = company.description;
  detail.innerHTML = `
    <section class="panel">
      <div class="card-top">
        <div class="logo" aria-hidden="true">${initials(company.name)}</div>
        <div>
          <span class="badge ${company.hiring ? "" : "muted"}">${company.hiring ? "Now Hiring" : "Not currently hiring"}</span>
          <h1>${company.name}</h1>
          <p class="meta">${company.category} • ${company.address}</p>
        </div>
      </div>
      <p class="lead" style="margin-top:18px;">${company.description}</p>
      <div class="facts">
        <div class="fact"><strong>${money.format(company.total_employees)}</strong><span>Employees</span></div>
        <div class="fact"><strong>${company.years_in_business}</strong><span>Years in business</span></div>
        <div class="fact"><strong>${company.best_places_score ? `${company.best_places_score}/10` : "Not scored"}</strong><span>Best Places score</span></div>
        <div class="fact"><strong>${company.onboarding_note || "Not listed"}</strong><span>Onboarding</span></div>
      </div>
      <div class="actions" style="margin-top:20px;">
        <a class="button" href="${company.website}">Visit Website</a>
        <a class="button secondary" href="../index.html?company=${company.slug}">View on Map</a>
      </div>
    </section>
  `;
  setupMap("mini-map", [company], { zoom: 13, scrollWheelZoom: false });
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const companies = await getCompanies();
    initHome(companies);
    initDirectory(companies);
    initDetail(companies);
  } catch (error) {
    console.error(error);
  }
});
