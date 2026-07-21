import { TransitDataService } from "./services/transitDataService.js";
import { StopsService } from "./services/stopsService.js";
import { storageService } from "./services/storageService.js";
import { readStateFromUrl, writeStateToUrl, buildStopShareUrl } from "./utils/urlState.js";
import { modePills } from "./ui/templates.js";

const dataService = new TransitDataService();

const elements = {
  brand: document.querySelectorAll("[data-brand-name]"),
  brandTagline: document.querySelectorAll("[data-brand-tagline]"),
  regionSelect: document.querySelector("#stops-region-select"),
  searchInput: document.querySelector("#stops-search"),
  list: document.querySelector("#stops-index-list"),
  detail: document.querySelector("#stops-index-detail"),
  clearSearch: document.querySelector("#stops-clear"),
  viewButtons: Array.from(document.querySelectorAll("[data-stop-view]")),
  detailBack: document.querySelector("#stops-detail-back")
};

const urlState = readStateFromUrl();

let bundle = null;
let stopsService = null;
let selectedRegionId = urlState.selectedRegionId || null;
let selectedStopId = urlState.selectedStopId || null;
let query = "";
let stopView = "all";
let hasExplicitStopSelection = Boolean(urlState.selectedStopId);

function revealDetailOnSmallScreen() {
  if (!window.matchMedia("(max-width: 979px)").matches) {
    return;
  }

  document.body.classList.add("mobile-detail-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function init() {
  bundle = await dataService.getBundle();
  stopsService = new StopsService(bundle);

  selectedRegionId = selectedRegionId || bundle.config?.regions?.defaultRegion || "gold-coast";
  if (!selectedStopId) {
    selectedStopId = stopsService.listByRegion(selectedRegionId)[0]?.id || null;
  }

  elements.brand.forEach((node) => {
    node.textContent = bundle.config?.app?.name || "CoastPulse Transit Atlas";
  });
  elements.brandTagline.forEach((node) => {
    node.textContent = bundle.config?.app?.tagline || "Unofficial map-first transit intelligence for SEQ";
  });

  setupRegionSelector();
  setupSearch();
  setupViewFilter();
  elements.detailBack?.addEventListener("click", () => {
    document.body.classList.remove("mobile-detail-open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  render();
}

function setupViewFilter() {
  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      stopView = button.dataset.stopView || "all";
      elements.viewButtons.forEach((candidate) => {
        const active = candidate.dataset.stopView === stopView;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      renderList();
    });
  });
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
    const list = stopsService.listByRegion(selectedRegionId);
    if (!list.find((stop) => stop.id === selectedStopId)) {
      selectedStopId = list[0]?.id || null;
    }
    render();
  });
}

function setupSearch() {
  elements.searchInput?.addEventListener("input", () => {
    query = elements.searchInput.value.trim();
    renderList();
  });

  elements.clearSearch?.addEventListener("click", () => {
    query = "";
    if (elements.searchInput) {
      elements.searchInput.value = "";
    }
    renderList();
  });
}

function getVisibleStops() {
  const favorites = new Set(storageService.getFavoriteStops());
  const regionStops = stopsService
    .listByRegion(selectedRegionId)
    .filter((stop) => stopView !== "favorites" || favorites.has(stop.id));

  if (!query) {
    return regionStops.sort((a, b) => a.name.localeCompare(b.name));
  }

  return stopsService
    .searchStops(query, { regionId: selectedRegionId, limit: 200 })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function render() {
  renderList();
  renderDetail();

  writeStateToUrl({
    selectedRegionId,
    selectedStopId,
    selectedRouteId: null,
    originStopId: null,
    destinationStopId: null
  });
}

function renderList() {
  const stops = getVisibleStops();

  if (!stops.length) {
    elements.list.innerHTML = `<p class="empty-state">${
      stopView === "favorites" ? "No favorite stops yet." : "No stops found for this query."
    }</p>`;
    return;
  }

  const favorites = new Set(storageService.getFavoriteStops());

  elements.list.innerHTML = `<ul>${stops
    .map((stop) => {
      const selected = stop.id === selectedStopId && (hasExplicitStopSelection || !window.matchMedia("(max-width: 860px)").matches);
      const favorite = favorites.has(stop.id);
      const routeBadges = (stop.routes || [])
        .map((routeId) => bundle.routeById[routeId])
        .filter(Boolean)
        .slice(0, 4)
        .map(
          (route) =>
            `<span class="stop-route-chip" style="--route-color:${route.color}">${route.shortName}</span>`
        )
        .join("");
      return `<li>
        <button type="button" class="routes-page-item ${selected ? "selected" : ""}" data-stop-id="${stop.id}">
          <span class="stop-list-icon" aria-hidden="true">
            <svg class="ui-icon" viewBox="0 0 24 24"><path d="M12 21s6-5.2 6-11a6 6 0 0 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2"></circle></svg>
          </span>
          <span class="route-text">
            <strong>${stop.name}${favorite ? " ★" : ""}</strong>
            <small>${stopsService.describeStopType(stop)} · ${stop.suburb || stop.region}</small>
            <span class="stop-route-chips">${routeBadges}</span>
          </span>
          <span class="row-chevron" aria-hidden="true">&rsaquo;</span>
        </button>
      </li>`;
    })
    .join("")}</ul>`;

  elements.list.querySelectorAll("button[data-stop-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedStopId = button.dataset.stopId;
      hasExplicitStopSelection = true;
      storageService.addRecentStop(selectedStopId);
      render();
      requestAnimationFrame(revealDetailOnSmallScreen);
    });
  });
}

function renderDetail() {
  const stop = bundle.stopById[selectedStopId];
  if (!stop) {
    elements.detail.innerHTML = `<p class="empty-state">No stop selected.</p>`;
    return;
  }

  const routes = (stop.routes || []).map((id) => bundle.routeById[id]).filter(Boolean);
  const nearby = stopsService.getNearbyStops(stop.id, 10);
  const favorite = storageService.isFavoriteStop(stop.id);

  elements.detail.innerHTML = `
    <article class="route-detail-card">
      <header>
        <span class="route-badge">${stop.code}</span>
        <div>
          <h2>${stop.name}</h2>
          <p>${stopsService.describeStopType(stop)} · ${stop.suburb || stop.region}</p>
        </div>
      </header>
      <section>
        <h3>Modes</h3>
        <div class="mode-row">${modePills(stop.modes || [])}</div>
      </section>
      <section>
        <h3>Serving routes</h3>
        <ul>${routes.map((route) => `<li><a href="./routes.html?region=${route.region}&route=${route.id}">${route.shortName} · ${route.longName}</a></li>`).join("")}</ul>
      </section>
      <section>
        <h3>Nearby linked stops</h3>
        <ul>${nearby.map((node) => `<li>${node.name}</li>`).join("")}</ul>
      </section>
      <section class="route-detail-actions">
        <a href="./index.html?region=${encodeURIComponent(stop.region)}&stop=${encodeURIComponent(stop.id)}">Open on map</a>
        <button type="button" id="toggle-stop-favorite">${favorite ? "Unpin stop" : "Pin stop"}</button>
        <button type="button" id="copy-stop-link">Copy stop link</button>
      </section>
    </article>
  `;

  elements.detail.querySelector("#toggle-stop-favorite")?.addEventListener("click", () => {
    storageService.toggleFavoriteStop(stop.id);
    render();
  });

  elements.detail.querySelector("#copy-stop-link")?.addEventListener("click", async () => {
    if (!navigator.clipboard?.writeText) {
      return;
    }
    await navigator.clipboard.writeText(buildStopShareUrl(stop.id, { selectedRegionId }));
  });
}

init();
