import { createStore } from "./state/store.js";
import { readStateFromUrl, writeStateToUrl, buildStopShareUrl } from "./utils/urlState.js";
import { TransitDataService } from "./services/transitDataService.js";
import { DeparturesService } from "./services/departuresService.js";
import { AlertsService } from "./services/alertsService.js";
import { PlannerLiteService } from "./services/plannerLiteService.js";
import { StopsService } from "./services/stopsService.js";
import { RoutesService } from "./services/routesService.js";
import { storageService } from "./services/storageService.js";
import { MapView } from "./ui/mapView.js";
import { SearchController } from "./ui/searchController.js";
import {
  alertsList,
  connectedInterchangesList,
  departuresList,
  estimateCard,
  favoriteRoutesList,
  favoriteStopsList,
  modePills,
  nearbyStopsList,
  recentRoutesList,
  recentStopsList,
  routeChips
} from "./ui/templates.js";

const dataService = new TransitDataService();
const departuresService = new DeparturesService(dataService);
const alertsService = new AlertsService(dataService);

const departureCache = new Map();
const CACHE_TTL_MS = 45 * 1000;

let bundle = null;
let planner = null;
let stopsService = null;
let routesService = null;
let mapView = null;
let searchController = null;
let activeStopRequest = 0;
let activeCompareRequest = 0;
let activeEstimateRequest = 0;

const stateFromUrl = readStateFromUrl();

const store = createStore({
  selectedRegionId: stateFromUrl.selectedRegionId,
  mapMode: stateFromUrl.mapMode,
  selectedStopId: stateFromUrl.selectedStopId,
  compareStopId: stateFromUrl.compareStopId,
  selectedRouteId: stateFromUrl.selectedRouteId,
  originStopId: stateFromUrl.originStopId,
  destinationStopId: stateFromUrl.destinationStopId,
  filters: {
    tram: stateFromUrl.filters?.tram ?? true,
    bus: stateFromUrl.filters?.bus ?? true,
    interchange: stateFromUrl.filters?.interchange ?? true
  },
  selectedStopDepartures: null,
  selectedStopAlerts: [],
  selectedStopStatus: "Select a stop to inspect departures and route coverage.",
  compareStopDepartures: null,
  compareStopStatus: "",
  isLoadingStop: false,
  estimateResult: null,
  recentStopIds: storageService.getRecentStops(),
  recentRouteIds: storageService.getRecentRoutes(),
  recentTripPairs: storageService.getRecentTrips(),
  favoriteStopIds: storageService.getFavoriteStops(),
  favoriteRouteIds: storageService.getFavoriteRoutes(),
  networkAlertsActive: [],
  networkAlertsRecent: [],
  searchQuery: stateFromUrl.searchQuery || "",
  panelExpanded: false
});

const elements = {
  routeLegend: document.querySelector("#route-legend"),
  stopPanel: document.querySelector("#stop-panel"),
  networkStatus: document.querySelector("#network-status"),
  mapContainer: document.querySelector("#leaflet-map"),
  mapSvg: document.querySelector("#network-map"),
  mapCamera: document.querySelector("#map-camera"),
  mapLines: document.querySelector("#line-layer"),
  mapStops: document.querySelector("#stop-layer"),
  mapLabels: document.querySelector("#label-layer"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomReset: document.querySelector("#zoom-reset"),
  searchInput: document.querySelector("#stop-search"),
  searchResults: document.querySelector("#search-results"),
  searchClear: document.querySelector("#search-clear"),
  filterButtons: Array.from(document.querySelectorAll("button[data-filter-mode]")),
  routeClearButton: document.querySelector("#clear-route-selection"),
  topDisclaimer: document.querySelector("#top-disclaimer"),
  fallbackBanner: document.querySelector("#fallback-banner"),
  regionSelect: document.querySelector("#region-select"),
  mapModeButtons: Array.from(document.querySelectorAll("button[data-map-mode]")),
  statusPill: document.querySelector("#alerts-pill"),
  sheetToggle: document.querySelector("#sheet-toggle"),
  panelColumn: document.querySelector(".panel-column")
};

async function init() {
  try {
    bundle = await dataService.getBundle();
    stopsService = new StopsService(bundle);
    routesService = new RoutesService(bundle);
    planner = new PlannerLiteService(bundle);

    initializeDefaultsFromConfig();
    applyBranding(bundle.config);
    setupRegionSelector();
    setupMap(bundle);
    setupSearch(bundle);
    setupFilters();
    setupMapModes();
    setupLegendInteractions();
    setupPanelInteractions();
    setupSheetToggle();
    setupShortcuts();

    store.subscribe(() => {
      render();
      syncUrl();
    });

    await preloadNetworkAlerts();
    render();

    const state = store.getState();
    if (state.selectedStopId) {
      await refreshSelectedStopData(state.selectedStopId);
    }

    if (state.compareStopId) {
      await refreshCompareStopData(state.compareStopId);
    }

    if (state.originStopId && state.destinationStopId) {
      await refreshEstimate();
    }

    setInterval(() => {
      render();
    }, 30 * 1000);

    setInterval(() => {
      preloadNetworkAlerts();
    }, 2 * 60 * 1000);
  } catch (error) {
    renderBootError(error);
  }
}

function initializeDefaultsFromConfig() {
  const state = store.getState();
  const selectedRegionId =
    state.selectedRegionId || bundle.config?.regions?.defaultRegion || bundle.config?.app?.primaryRegion || "gold-coast";
  const mapMode = state.mapMode || bundle.config?.ui?.defaultMapMode || "stylized";

  updateState({
    selectedRegionId,
    mapMode
  });
}

function applyBranding(config) {
  document.querySelectorAll("[data-brand-name]").forEach((node) => {
    node.textContent = config?.app?.name || "CoastPulse Transit Atlas";
  });

  document.querySelectorAll("[data-brand-tagline]").forEach((node) => {
    node.textContent = config?.app?.tagline || "Unofficial map-first transit intelligence for SEQ";
  });

  if (elements.topDisclaimer) {
    elements.topDisclaimer.textContent =
      config?.disclaimer?.short || "Unofficial project. Not affiliated with Translink or the Queensland Government.";
  }
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

  elements.regionSelect.value = store.getState().selectedRegionId;

  elements.regionSelect.addEventListener("change", async () => {
    const nextRegion = elements.regionSelect.value;
    const currentState = store.getState();

    const resetStop = currentState.selectedStopId && bundle.stopById[currentState.selectedStopId]?.region !== nextRegion;
    const resetRoute = currentState.selectedRouteId && bundle.routeById[currentState.selectedRouteId]?.region !== nextRegion;

    updateState({
      selectedRegionId: nextRegion,
      selectedStopId: resetStop ? null : currentState.selectedStopId,
      compareStopId: null,
      selectedRouteId: resetRoute ? null : currentState.selectedRouteId,
      originStopId: resetStop ? null : currentState.originStopId,
      destinationStopId: resetStop ? null : currentState.destinationStopId,
      estimateResult: resetStop ? null : currentState.estimateResult,
      selectedStopDepartures: resetStop ? null : currentState.selectedStopDepartures,
      selectedStopAlerts: resetStop ? [] : currentState.selectedStopAlerts,
      selectedStopStatus: resetStop
        ? "Select a stop to inspect departures and route coverage."
        : currentState.selectedStopStatus
    });

    await preloadNetworkAlerts();

    if (store.getState().selectedStopId) {
      await refreshSelectedStopData(store.getState().selectedStopId);
    }
  });
}

function setupMap(dataBundle) {
  mapView = new MapView({
    mapElement: elements.mapContainer,
    svg: elements.mapSvg,
    cameraLayer: elements.mapCamera,
    lineLayer: elements.mapLines,
    stopLayer: elements.mapStops,
    labelLayer: elements.mapLabels,
    onStopSelect: async (stopId) => {
      await selectStop(stopId);
    },
    onRouteSelect: (routeId) => {
      setSelectedRoute(routeId);
    },
    onBackgroundSelect: () => {
      const state = store.getState();
      if (state.panelExpanded) {
        updateState({ panelExpanded: false });
      }
    },
    mapConfig: dataBundle.config?.map
  });

  mapView.setControls({
    zoomInButton: elements.zoomIn,
    zoomOutButton: elements.zoomOut,
    resetButton: elements.zoomReset
  });

  mapView.setData({
    lines: dataBundle.lines,
    stops: dataBundle.stops,
    routes: dataBundle.routes
  });
}

function setupSearch(dataBundle) {
  searchController = new SearchController({
    input: elements.searchInput,
    resultList: elements.searchResults,
    clearButton: elements.searchClear,
    onSelectStop: async (stopId) => {
      await selectStop(stopId);
    },
    onSelectRoute: (routeId) => {
      setSelectedRoute(routeId);
    },
    onSearchCommit: (query) => {
      storageService.addRecentSearch(query);
      updateState({ searchQuery: query || "" });
    },
    getRecentSearches: () => storageService.getRecentSearches()
  });

  searchController.setData({
    stops: dataBundle.stops,
    routes: dataBundle.routes
  });
}

function setupFilters() {
  elements.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.filterMode;
      const current = store.getState().filters;
      updateState({
        filters: {
          ...current,
          [mode]: !current[mode]
        }
      });
    });
  });

  elements.routeClearButton?.addEventListener("click", () => {
    updateState({ selectedRouteId: null });
    if (store.getState().originStopId && store.getState().destinationStopId) {
      refreshEstimate();
    }
  });
}

function setupMapModes() {
  elements.mapModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mapMode;
      if (!mode) {
        return;
      }
      updateState({ mapMode: mode });
    });
  });
}

function setupLegendInteractions() {
  elements.routeLegend?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-route-id]");
    if (!button) {
      return;
    }
    const routeId = button.dataset.routeId;
    setSelectedRoute(routeId);
  });
}

function setupPanelInteractions() {
  elements.stopPanel?.addEventListener("click", async (event) => {
    const target = event.target.closest("button, a");
    if (!target) {
      return;
    }

    const action = target.dataset.action;
    const stopId = target.dataset.stopId;
    const routeId = target.dataset.routeId;

    if (routeId) {
      setSelectedRoute(routeId);
      return;
    }

    if (stopId) {
      await selectStop(stopId);
      return;
    }

    if (action === "toggle-favorite-stop") {
      const selectedStop = bundle.stopById[store.getState().selectedStopId];
      if (!selectedStop) {
        return;
      }
      storageService.toggleFavoriteStop(selectedStop.id);
      updateState({ favoriteStopIds: storageService.getFavoriteStops() });
      return;
    }

    if (action === "toggle-favorite-route") {
      const state = store.getState();
      if (!state.selectedRouteId) {
        return;
      }
      storageService.toggleFavoriteRoute(state.selectedRouteId);
      updateState({ favoriteRouteIds: storageService.getFavoriteRoutes() });
      return;
    }

    if (action === "set-origin") {
      const selectedStop = bundle.stopById[store.getState().selectedStopId];
      if (!selectedStop) {
        return;
      }
      updateState({ originStopId: selectedStop.id });
      await refreshEstimate();
      return;
    }

    if (action === "set-destination") {
      const selectedStop = bundle.stopById[store.getState().selectedStopId];
      if (!selectedStop) {
        return;
      }
      updateState({ destinationStopId: selectedStop.id });
      await refreshEstimate();
      return;
    }

    if (action === "clear-trip") {
      updateState({ originStopId: null, destinationStopId: null, estimateResult: null });
      return;
    }

    if (action === "estimate") {
      await refreshEstimate();
      return;
    }

    if (action === "copy-coords") {
      const selectedStop = bundle.stopById[store.getState().selectedStopId];
      if (!selectedStop) {
        return;
      }
      await copyToClipboard(`${selectedStop.lat},${selectedStop.lon}`);
      flashActionLabel(target, "Copied");
      return;
    }

    if (action === "copy-link") {
      const selectedStop = bundle.stopById[store.getState().selectedStopId];
      if (!selectedStop) {
        return;
      }
      await copyToClipboard(buildStopShareUrl(selectedStop.id, store.getState()));
      flashActionLabel(target, "Copied");
      return;
    }

    if (action === "load-trip") {
      const originStopId = target.dataset.originStopId;
      const destinationStopId = target.dataset.destinationStopId;
      if (!originStopId || !destinationStopId) {
        return;
      }
      updateState({ originStopId, destinationStopId });
      await refreshEstimate();
      return;
    }

    if (action === "toggle-panel") {
      updateState({ panelExpanded: !store.getState().panelExpanded });
      return;
    }
  });

  elements.stopPanel?.addEventListener("change", async (event) => {
    const destinationSelect = event.target.closest("select[data-action='destination-select']");
    if (destinationSelect) {
      updateState({ destinationStopId: destinationSelect.value || null });
      await refreshEstimate();
      return;
    }

    const compareSelect = event.target.closest("select[data-action='compare-select']");
    if (compareSelect) {
      const compareStopId = compareSelect.value || null;
      updateState({ compareStopId, compareStopDepartures: null, compareStopStatus: "" });
      if (compareStopId) {
        await refreshCompareStopData(compareStopId);
      }
    }
  });
}

function setupSheetToggle() {
  elements.sheetToggle?.addEventListener("click", () => {
    updateState({ panelExpanded: !store.getState().panelExpanded });
  });
}

function setupShortcuts() {
  document.addEventListener("keydown", (event) => {
    const cmdOrCtrl = event.metaKey || event.ctrlKey;
    if (cmdOrCtrl && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.searchInput?.focus();
      return;
    }

    if (!cmdOrCtrl && event.key === "/") {
      if (document.activeElement === elements.searchInput) {
        return;
      }
      event.preventDefault();
      elements.searchInput?.focus();
    }
  });
}

function render() {
  const state = store.getState();

  renderFilters(state);
  renderMapModes(state);
  renderRegionSelector(state);
  renderRouteLegend(state);
  renderNetworkStatus(state);

  searchController?.setContext({
    regionId: state.selectedRegionId,
    filters: state.filters
  });

  mapView?.updateState({
    selectedRegionId: state.selectedRegionId,
    selectedStopId: state.selectedStopId,
    compareStopId: state.compareStopId,
    selectedRouteId: state.selectedRouteId,
    filters: state.filters,
    mapMode: state.mapMode,
    favoriteStopIds: state.favoriteStopIds
  });

  renderFallbackBanner(state);
  renderStopPanel(state);

  if (elements.panelColumn) {
    elements.panelColumn.classList.toggle("expanded", Boolean(state.panelExpanded));
  }

  if (elements.sheetToggle) {
    elements.sheetToggle.setAttribute("aria-expanded", String(Boolean(state.panelExpanded)));
  }
}

function renderFilters(state) {
  elements.filterButtons.forEach((button) => {
    const mode = button.dataset.filterMode;
    const enabled = state.filters[mode];
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.classList.toggle("active", Boolean(enabled));
  });
}

function renderMapModes(state) {
  elements.mapModeButtons.forEach((button) => {
    const active = button.dataset.mapMode === state.mapMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function renderRegionSelector(state) {
  if (!elements.regionSelect) {
    return;
  }
  if (elements.regionSelect.value !== state.selectedRegionId) {
    elements.regionSelect.value = state.selectedRegionId;
  }
}

function renderRouteLegend(state) {
  if (!elements.routeLegend) {
    return;
  }

  const routes = routesService
    .listByRegion(state.selectedRegionId)
    .slice()
    .sort((a, b) => {
      if (a.mode === b.mode) {
        return String(a.shortName).localeCompare(String(b.shortName), "en-AU", { numeric: true });
      }
      return a.mode === "tram" ? -1 : 1;
    });

  const list = routes
    .map((route) => {
      const selected = state.selectedRouteId === route.id;
      const favorite = state.favoriteRouteIds.includes(route.id);
      return `<li>
        <button type="button" data-route-id="${route.id}" class="legend-route ${selected ? "selected" : ""}" style="--route-color:${
          route.color
        }">
          <span class="legend-short">${route.shortName}${favorite ? " ★" : ""}</span>
          <span class="legend-long">${route.longName}</span>
        </button>
      </li>`;
    })
    .join("");

  elements.routeLegend.innerHTML = `<ul>${list}</ul>`;
}

function renderNetworkStatus(state) {
  const activeCount = state.networkAlertsActive.length;
  const region = bundle.regionById[state.selectedRegionId];

  if (elements.statusPill) {
    elements.statusPill.textContent = activeCount ? `${activeCount} active alert${activeCount === 1 ? "" : "s"}` : "No active alerts";
    elements.statusPill.classList.toggle("has-alerts", activeCount > 0);
  }

  if (!elements.networkStatus) {
    return;
  }

  elements.networkStatus.innerHTML = `
    <article class="status-card">
      <h3>${region?.label || "Region"}</h3>
      <p>${region?.description || "Transit network overview"}</p>
    </article>
    <article class="status-card">
      <h3>Alerts</h3>
      <p>${activeCount ? `${activeCount} active service alert${activeCount === 1 ? "" : "s"}` : "No active service alerts"}</p>
      <a href="./alerts.html?region=${encodeURIComponent(state.selectedRegionId)}">Open alerts page</a>
    </article>
  `;
}

function renderFallbackBanner(state) {
  if (!elements.fallbackBanner) {
    return;
  }

  const status = state.selectedStopStatus || "";
  elements.fallbackBanner.textContent = status;
  elements.fallbackBanner.classList.toggle("warning", status.toLowerCase().includes("unavailable"));
}

function renderStopPanel(state) {
  const selectedStop = state.selectedStopId ? bundle.stopById[state.selectedStopId] : null;

  if (!selectedStop) {
    const recentStops = state.recentStopIds.map((id) => bundle.stopById[id]).filter((stop) => stop?.region === state.selectedRegionId);
    const recentRoutes = state.recentRouteIds
      .map((id) => bundle.routeById[id])
      .filter((route) => route?.region === state.selectedRegionId);

    const favoriteStops = state.favoriteStopIds
      .map((id) => bundle.stopById[id])
      .filter((stop) => stop?.region === state.selectedRegionId);
    const favoriteRoutes = state.favoriteRouteIds
      .map((id) => bundle.routeById[id])
      .filter((route) => route?.region === state.selectedRegionId);

    const tripButtons = state.recentTripPairs
      .map((pair) => {
        const origin = bundle.stopById[pair.originStopId];
        const destination = bundle.stopById[pair.destinationStopId];
        if (!origin || !destination || origin.region !== state.selectedRegionId) {
          return null;
        }
        return `<button type="button" class="recent-stop-btn" data-action="load-trip" data-origin-stop-id="${origin.id}" data-destination-stop-id="${destination.id}">${origin.name} → ${destination.name}</button>`;
      })
      .filter(Boolean)
      .join("");

    elements.stopPanel.innerHTML = `
      <section class="panel-section">
        <h2>${bundle.regionById[state.selectedRegionId]?.label || "Network"} map</h2>
        <p>Select a stop or route to inspect departures, alerts, and direct estimates.</p>
      </section>
      <section class="panel-section">
        <h3>Pinned stops</h3>
        ${favoriteStopsList(favoriteStops)}
      </section>
      <section class="panel-section">
        <h3>Saved routes</h3>
        ${favoriteRoutesList(favoriteRoutes)}
      </section>
      <section class="panel-section">
        <h3>Recently viewed stops</h3>
        ${recentStopsList(recentStops)}
      </section>
      <section class="panel-section">
        <h3>Recent routes</h3>
        ${recentRoutesList(recentRoutes)}
      </section>
      <section class="panel-section">
        <h3>Recent direct trips</h3>
        ${tripButtons ? `<div class="recent-stop-list">${tripButtons}</div>` : '<p class="empty-state compact">No recent direct-trip checks.</p>'}
      </section>
      <section class="panel-section panel-disclaimer">
        <h3>Unofficial data notice</h3>
        <p>${bundle.config.disclaimer.long}</p>
      </section>
    `;
    return;
  }

  const routesAtStop = stopsService
    .getRoutesForStop(selectedStop.id)
    .filter((route) => route.region === state.selectedRegionId)
    .sort((a, b) => String(a.shortName).localeCompare(String(b.shortName), "en-AU", { numeric: true }));

  const departureResult = state.selectedStopDepartures;
  const departures = departureResult?.departures || [];
  const alerts = state.selectedStopAlerts || [];

  const originStop = state.originStopId ? bundle.stopById[state.originStopId] : null;
  const destinationStop = state.destinationStopId ? bundle.stopById[state.destinationStopId] : null;
  const compareStop = state.compareStopId ? bundle.stopById[state.compareStopId] : null;

  const mapLinks = buildExternalMapLinks(selectedStop);
  const destinationOptions = originStop
    ? planner
        .getDirectDestinationIds(originStop.id, state.selectedRouteId || null)
        .map((id) => bundle.stopById[id])
        .filter((stop) => stop && stop.region === state.selectedRegionId)
    : [];

  const compareOptions = stopsService.getNearbyStops(selectedStop.id, 8);

  const nearbyStops = stopsService.getNearbyStops(selectedStop.id, 8);
  const connectedInterchanges = stopsService.getConnectedInterchanges(selectedStop.id);
  const interchange = stopsService.getInterchangeForStop(selectedStop.id);

  const favoriteStop = state.favoriteStopIds.includes(selectedStop.id);
  const favoriteRoute = state.selectedRouteId ? state.favoriteRouteIds.includes(state.selectedRouteId) : false;

  elements.stopPanel.innerHTML = `
    <section class="panel-section stop-header">
      <div>
        <h2>${selectedStop.name}</h2>
        <p class="stop-subtitle">${selectedStop.code} · ${selectedStop.suburb || selectedStop.region} · ${selectedStop.lat.toFixed(5)}, ${selectedStop.lon.toFixed(5)}</p>
      </div>
      <div class="mode-row">${modePills(selectedStop.modes)}</div>
      <p class="stop-type-badge">${stopsService.describeStopType(selectedStop)}${interchange ? ` · ${interchange.name}` : ""}</p>
      <div class="stop-actions">
        <button type="button" data-action="set-origin">Set as origin</button>
        <button type="button" data-action="set-destination">Set as destination</button>
        <button type="button" data-action="toggle-favorite-stop">${favoriteStop ? "Unpin stop" : "Pin stop"}</button>
        <button type="button" data-action="copy-coords">Copy coordinates</button>
        <button type="button" data-action="copy-link">Share stop link</button>
      </div>
      <div class="map-link-row">
        <a href="${mapLinks.standard}" target="_blank" rel="noreferrer">Open in Google Maps</a>
        <a href="${mapLinks.satellite}" target="_blank" rel="noreferrer">Satellite view</a>
        <a href="${mapLinks.osm}" target="_blank" rel="noreferrer">OpenStreetMap</a>
      </div>
    </section>

    <section class="panel-section">
      <div class="section-row">
        <h3>Routes serving this stop</h3>
        <button type="button" data-action="toggle-favorite-route">${favoriteRoute ? "Unsave route" : "Save selected route"}</button>
      </div>
      <div class="route-chip-list">${routeChips(routesAtStop, { favoriteRouteIds: state.favoriteRouteIds })}</div>
    </section>

    <section class="panel-section">
      <h3>Next departures</h3>
      <p class="panel-meta">${state.isLoadingStop ? "Loading departures..." : state.selectedStopStatus}</p>
      ${departuresList(departures, bundle.routeById, new Date())}
    </section>

    <section class="panel-section">
      <h3>Alerts and disruptions</h3>
      ${alertsList(alerts)}
    </section>

    <section class="panel-section">
      <h3>Nearby connections</h3>
      ${nearbyStopsList(nearbyStops)}
      <h4>Linked interchange notes</h4>
      ${connectedInterchangesList(connectedInterchanges)}
    </section>

    <section class="panel-section">
      <h3>Direct travel estimate</h3>
      <div class="trip-pill-row">
        <span class="trip-pill">Origin: ${originStop ? originStop.name : "Not selected"}</span>
        <span class="trip-pill">Destination: ${destinationStop ? destinationStop.name : "Not selected"}</span>
      </div>
      <label for="destination-select" class="label">Choose destination on direct route</label>
      <select id="destination-select" data-action="destination-select">
        <option value="">Select destination</option>
        ${destinationOptions
          .map(
            (stop) =>
              `<option value="${stop.id}" ${state.destinationStopId === stop.id ? "selected" : ""}>${stop.name}</option>`
          )
          .join("")}
      </select>
      <div class="travel-actions">
        <button type="button" data-action="estimate">Estimate direct trip</button>
        <button type="button" data-action="clear-trip">Clear trip</button>
      </div>
      ${estimateCard(state.estimateResult)}
    </section>

    <section class="panel-section">
      <h3>Compare nearby stop</h3>
      <label for="compare-select" class="label">Choose nearby stop</label>
      <select id="compare-select" data-action="compare-select">
        <option value="">No compare stop</option>
        ${compareOptions
          .map((stop) => `<option value="${stop.id}" ${stop.id === state.compareStopId ? "selected" : ""}>${stop.name}</option>`)
          .join("")}
      </select>
      ${
        compareStop
          ? `<div class="compare-card">
              <p><strong>${compareStop.name}</strong></p>
              <p class="panel-meta">${state.compareStopStatus || "No compare departures yet."}</p>
              ${departuresList(state.compareStopDepartures?.departures || [], bundle.routeById, new Date())}
            </div>`
          : '<p class="empty-state compact">Choose a nearby stop to compare departures.</p>'
      }
    </section>
  `;
}

async function preloadNetworkAlerts() {
  const state = store.getState();
  const allAlerts = await alertsService.getAllAlerts({ regionId: state.selectedRegionId });

  updateState({
    networkAlertsActive: allAlerts.active,
    networkAlertsRecent: allAlerts.recent
  });
}

async function selectStop(stopId) {
  const stop = bundle.stopById[stopId];
  if (!stop) {
    return;
  }

  if (stop.region !== store.getState().selectedRegionId) {
    updateState({ selectedRegionId: stop.region });
  }

  updateState({ selectedStopId: stopId, panelExpanded: true });
  storageService.addRecentStop(stopId);
  updateState({ recentStopIds: storageService.getRecentStops() });
  await refreshSelectedStopData(stopId);
}

async function refreshSelectedStopData(stopId) {
  if (!stopId || !bundle.stopById[stopId]) {
    updateState({
      selectedStopDepartures: null,
      selectedStopAlerts: [],
      selectedStopStatus: "Select a stop to inspect departures and route coverage."
    });
    return;
  }

  const requestId = ++activeStopRequest;
  updateState({ isLoadingStop: true });

  const stop = bundle.stopById[stopId];
  const stopRoutes = stop.routes || [];
  const interchange = stopsService.getInterchangeForStop(stop.id);

  const [departuresResult, alerts] = await Promise.all([
    getDeparturesCached(stopId),
    alertsService.getAlertsForContext({
      stopId,
      routeIds: stopRoutes,
      regionId: stop.region,
      interchangeIds: interchange ? [interchange.id] : []
    })
  ]);

  if (requestId !== activeStopRequest) {
    return;
  }

  updateState({
    selectedStopDepartures: departuresResult,
    selectedStopAlerts: alerts,
    selectedStopStatus: departuresResult.message,
    isLoadingStop: false
  });

  const state = store.getState();
  if (state.originStopId && state.destinationStopId) {
    await refreshEstimate();
  }
}

async function refreshCompareStopData(stopId) {
  if (!stopId || !bundle.stopById[stopId]) {
    updateState({ compareStopDepartures: null, compareStopStatus: "" });
    return;
  }

  const requestId = ++activeCompareRequest;
  const departures = await getDeparturesCached(stopId);

  if (requestId !== activeCompareRequest) {
    return;
  }

  updateState({
    compareStopDepartures: departures,
    compareStopStatus: departures.message
  });
}

async function getDeparturesCached(stopId) {
  const cached = departureCache.get(stopId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const value = await departuresService.getDeparturesForStop(stopId);
  departureCache.set(stopId, {
    cachedAt: Date.now(),
    value
  });
  return value;
}

async function refreshEstimate() {
  const requestId = ++activeEstimateRequest;
  const { originStopId, destinationStopId, selectedRouteId } = store.getState();

  if (!originStopId || !destinationStopId) {
    updateState({ estimateResult: null });
    return;
  }

  const originDepartures = await getDeparturesCached(originStopId);

  if (requestId !== activeEstimateRequest) {
    return;
  }

  const result = planner.estimateDirectJourney({
    originStopId,
    destinationStopId,
    preferredRouteId: selectedRouteId || null,
    departuresAtOrigin: originDepartures.departures
  });

  updateState({ estimateResult: result });

  if (result?.valid) {
    storageService.addRecentTrip({ originStopId, destinationStopId });
    updateState({ recentTripPairs: storageService.getRecentTrips() });
  }
}

function buildExternalMapLinks(stop) {
  const coords = `${stop.lat},${stop.lon}`;
  return {
    standard: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`,
    satellite: `https://www.google.com/maps/@?api=1&map_action=map&center=${encodeURIComponent(coords)}&zoom=18&basemap=satellite`,
    osm: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(stop.lat)}&mlon=${encodeURIComponent(stop.lon)}#map=17/${encodeURIComponent(
      stop.lat
    )}/${encodeURIComponent(stop.lon)}`
  };
}

function syncUrl() {
  const state = store.getState();
  writeStateToUrl({
    selectedStopId: state.selectedStopId,
    selectedRouteId: state.selectedRouteId,
    originStopId: state.originStopId,
    destinationStopId: state.destinationStopId,
    compareStopId: state.compareStopId,
    selectedRegionId: state.selectedRegionId,
    mapMode: state.mapMode,
    searchQuery: elements.searchInput?.value || "",
    filters: state.filters
  });
}

function updateState(patch) {
  store.setState(patch);
}

function setSelectedRoute(routeId) {
  if (!routeId) {
    updateState({ selectedRouteId: null });
    return;
  }

  const route = bundle.routeById[routeId];
  if (!route) {
    return;
  }

  if (route.region !== store.getState().selectedRegionId) {
    updateState({ selectedRegionId: route.region });
  }

  const current = store.getState().selectedRouteId;
  const next = current === routeId ? null : routeId;

  updateState({ selectedRouteId: next });

  if (next) {
    storageService.addRecentRoute(next);
    updateState({ recentRouteIds: storageService.getRecentRoutes() });
  }

  if (store.getState().originStopId && store.getState().destinationStopId) {
    refreshEstimate();
  }
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const tempInput = document.createElement("textarea");
  tempInput.value = text;
  document.body.append(tempInput);
  tempInput.select();
  document.execCommand("copy");
  tempInput.remove();
}

function flashActionLabel(button, label) {
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = original;
  }, 900);
}

function renderBootError(error) {
  console.error(error);
  if (elements.stopPanel) {
    elements.stopPanel.innerHTML = `
      <section class="panel-section">
        <h2>Unable to load transit data</h2>
        <p class="empty-state">${error?.message || "Unexpected error"}</p>
      </section>
    `;
  }
}

init();
