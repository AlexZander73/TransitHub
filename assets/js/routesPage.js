import { TransitDataService } from "./services/transitDataService.js";
import { RoutesService } from "./services/routesService.js";
import { StopsService } from "./services/stopsService.js";
import { storageService } from "./services/storageService.js";
import { readStateFromUrl, writeStateToUrl, buildRouteShareUrl } from "./utils/urlState.js";

const dataService = new TransitDataService();

const elements = {
  routeList: document.querySelector("#routes-list"),
  routeDetail: document.querySelector("#route-detail"),
  routeSearch: document.querySelector("#route-search"),
  regionSelect: document.querySelector("#routes-region-select"),
  favoriteToggle: document.querySelector("#route-favorite-toggle"),
  copyRouteLink: document.querySelector("#copy-route-link"),
  brand: document.querySelectorAll("[data-brand-name]"),
  brandTagline: document.querySelectorAll("[data-brand-tagline]")
};

const urlState = readStateFromUrl();
let bundle = null;
let routesService = null;
let stopsService = null;
let selectedRegionId = urlState.selectedRegionId || null;
let selectedRouteId = urlState.selectedRouteId || null;
let routeSearchQuery = "";

async function init() {
  bundle = await dataService.getBundle();
  routesService = new RoutesService(bundle);
  stopsService = new StopsService(bundle);

  selectedRegionId = selectedRegionId || bundle.config?.regions?.defaultRegion || "gold-coast";
  if (!selectedRouteId) {
    selectedRouteId = routesService.listByRegion(selectedRegionId)[0]?.id || null;
  }

  elements.brand.forEach((node) => {
    node.textContent = bundle.config?.app?.name || "CoastPulse Transit Atlas";
  });
  elements.brandTagline.forEach((node) => {
    node.textContent = bundle.config?.app?.tagline || "Unofficial map-first transit intelligence for SEQ";
  });

  setupRegionSelector();
  setupSearch();
  setupActions();

  render();
}

function setupRegionSelector() {
  if (!elements.regionSelect) {
    return;
  }

  const enabled = new Set(bundle.config?.regions?.enabled || []);
  const options = bundle.regions.filter((region) => enabled.has(region.id) || region.status === "preview");

  elements.regionSelect.innerHTML = options
    .map(
      (region) =>
        `<option value="${region.id}">${region.label}${region.status === "preview" ? " (Preview)" : ""}</option>`
    )
    .join("");

  elements.regionSelect.value = selectedRegionId;

  elements.regionSelect.addEventListener("change", () => {
    selectedRegionId = elements.regionSelect.value;
    const regionRoutes = routesService.listByRegion(selectedRegionId);
    if (!regionRoutes.find((route) => route.id === selectedRouteId)) {
      selectedRouteId = regionRoutes[0]?.id || null;
    }
    render();
  });
}

function setupSearch() {
  elements.routeSearch?.addEventListener("input", () => {
    routeSearchQuery = elements.routeSearch.value.trim();
    renderRouteList();
  });
}

function setupActions() {
  elements.favoriteToggle?.addEventListener("click", () => {
    if (!selectedRouteId) {
      return;
    }
    storageService.toggleFavoriteRoute(selectedRouteId);
    render();
  });

  elements.copyRouteLink?.addEventListener("click", async () => {
    if (!selectedRouteId || !navigator.clipboard?.writeText) {
      return;
    }
    await navigator.clipboard.writeText(buildRouteShareUrl(selectedRouteId, { selectedRegionId }));
    const original = elements.copyRouteLink.textContent;
    elements.copyRouteLink.textContent = "Copied";
    setTimeout(() => {
      elements.copyRouteLink.textContent = original;
    }, 900);
  });
}

function render() {
  renderRouteList();
  renderRouteDetail();
  syncUrl();
}

function renderRouteList() {
  const query = routeSearchQuery.toLowerCase();

  const routes = routesService
    .listByRegion(selectedRegionId)
    .filter((route) => {
      if (!query) {
        return true;
      }
      const text = `${route.shortName} ${route.longName} ${route.mode}`.toLowerCase();
      return text.includes(query);
    })
    .sort((a, b) => String(a.shortName).localeCompare(String(b.shortName), "en-AU", { numeric: true }));

  if (!routes.length) {
    elements.routeList.innerHTML = `<p class="empty-state">No routes match your search.</p>`;
    return;
  }

  const favorites = new Set(storageService.getFavoriteRoutes());

  elements.routeList.innerHTML = `<ul>${routes
    .map((route) => {
      const selected = route.id === selectedRouteId;
      const isFavorite = favorites.has(route.id);
      return `<li>
        <button type="button" class="routes-page-item ${selected ? "selected" : ""}" data-route-id="${route.id}" style="--route-color:${
          route.color
        }">
          <span class="route-badge">${route.shortName}</span>
          <span class="route-text">
            <strong>${route.longName}</strong>
            <small>${route.mode} · ${route.stopSequence.length} stops ${isFavorite ? "· saved" : ""}</small>
          </span>
        </button>
      </li>`;
    })
    .join("")}</ul>`;

  elements.routeList.querySelectorAll("button[data-route-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRouteId = button.dataset.routeId;
      storageService.addRecentRoute(selectedRouteId);
      render();
    });
  });
}

function renderRouteDetail() {
  const route = bundle.routeById[selectedRouteId];
  if (!route) {
    elements.routeDetail.innerHTML = `<p class="empty-state">No route selected.</p>`;
    return;
  }

  const stopRows = route.stopSequence
    .map((stopId, idx) => {
      const stop = bundle.stopById[stopId];
      const cumulative = route.segmentMinutes.slice(0, idx).reduce((sum, value) => sum + Number(value || 0), 0);
      return `<tr>
        <td>${idx + 1}</td>
        <td><a href="./index.html?region=${encodeURIComponent(route.region)}&stop=${encodeURIComponent(stop.id)}&route=${encodeURIComponent(
          route.id
        )}">${stop.name}</a></td>
        <td>${cumulative} min</td>
      </tr>`;
    })
    .join("");

  const directionRows = (route.directions || [])
    .map(
      (direction) =>
        `<li><strong>${direction.headsign}</strong>: ${direction.service.weekday.first}-${direction.service.weekday.last}, approx every ${direction.service.weekday.frequencyMins} min (weekday)</li>`
    )
    .join("");

  const patterns = routesService.getPatternsForRoute(route.id);
  const patternRows = patterns.length
    ? `<ul>${patterns
        .map(
          (pattern) =>
            `<li><strong>${pattern.name}</strong> · ${pattern.stopSequence.length} stops · ${pattern.sampleTripMinutes} min sample</li>`
        )
        .join("")}</ul>`
    : `<p class="empty-state compact">No explicit patterns recorded.</p>`;

  const isFavorite = storageService.isFavoriteRoute(route.id);

  elements.routeDetail.innerHTML = `
    <article class="route-detail-card" style="--route-color:${route.color}">
      <header>
        <span class="route-badge">${route.shortName}</span>
        <div>
          <h2>${route.longName}</h2>
          <p>${route.notes || ""}</p>
          <p class="panel-meta">${route.mode} · ${route.status || "active"} · ${route.stopSequence.length} stops</p>
        </div>
      </header>
      <section>
        <h3>Service pattern</h3>
        <ul>${directionRows}</ul>
      </section>
      <section>
        <h3>Recorded route variants</h3>
        ${patternRows}
      </section>
      <section>
        <h3>Stops and direct in-vehicle timing</h3>
        <table>
          <thead>
            <tr><th>#</th><th>Stop</th><th>Approx cumulative</th></tr>
          </thead>
          <tbody>${stopRows}</tbody>
        </table>
      </section>
      <section class="route-detail-actions">
        <a href="./index.html?region=${encodeURIComponent(route.region)}&route=${encodeURIComponent(route.id)}">Open on map</a>
        <span>${isFavorite ? "Saved route" : "Not saved"}</span>
      </section>
    </article>
  `;

  if (elements.favoriteToggle) {
    elements.favoriteToggle.textContent = isFavorite ? "Unsave route" : "Save route";
  }
}

function syncUrl() {
  writeStateToUrl({
    selectedRouteId,
    selectedRegionId,
    selectedStopId: null,
    originStopId: null,
    destinationStopId: null
  });
}

init();
