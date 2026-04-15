import { createStore } from "./state/store.js";
import { readStateFromUrl, writeStateToUrl, buildStopShareUrl } from "./utils/urlState.js";
import { addRecentStop, getRecentStops } from "./utils/storage.js";
import { TransitDataService } from "./services/transitDataService.js";
import { DeparturesService } from "./services/departuresService.js";
import { AlertsService } from "./services/alertsService.js";
import { RoutePlannerLite } from "./services/routePlannerLite.js";
import { MapView } from "./ui/mapView.js";
import { SearchController } from "./ui/searchController.js";
import { alertsList, departuresList, modePills, recentStopsList, routeChips } from "./ui/templates.js";

const dataService = new TransitDataService();
const departuresService = new DeparturesService(dataService);
const alertsService = new AlertsService(dataService);

const departureCache = new Map();
const CACHE_TTL_MS = 45 * 1000;

let bundle = null;
let routePlanner = null;
let mapView = null;
let activeStopRequest = 0;
let activeEstimateRequest = 0;

const stateFromUrl = readStateFromUrl();

const store = createStore({
  selectedStopId: stateFromUrl.selectedStopId,
  selectedRouteId: stateFromUrl.selectedRouteId,
  originStopId: stateFromUrl.originStopId,
  destinationStopId: stateFromUrl.destinationStopId,
  filters: {
    tram: true,
    bus: true,
    interchange: true
  },
  selectedStopDepartures: null,
  selectedStopAlerts: [],
  selectedStopStatus: "Select a stop to inspect departures and route coverage.",
  isLoadingStop: false,
  estimateResult: null,
  recentStopIds: getRecentStops()
});

const elements = {
  routeLegend: document.querySelector("#route-legend"),
  stopPanel: document.querySelector("#stop-panel"),
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
  fallbackBanner: document.querySelector("#fallback-banner")
};

async function init() {
  try {
    bundle = await dataService.getBundle();
    routePlanner = new RoutePlannerLite(bundle);

    applyBranding(bundle.config);
    setupMap(bundle);
    setupSearch(bundle);
    setupFilters();
    setupLegendInteractions();
    setupPanelInteractions();

    store.subscribe(() => {
      render();
      syncUrl();
    });

    render();

    if (store.getState().selectedStopId) {
      await refreshSelectedStopData(store.getState().selectedStopId);
    }

    if (store.getState().originStopId && store.getState().destinationStopId) {
      await refreshEstimate();
    }

    setInterval(() => {
      render();
    }, 30 * 1000);
  } catch (error) {
    renderBootError(error);
  }
}

function applyBranding(config) {
  document.querySelectorAll("[data-brand-name]").forEach((node) => {
    node.textContent = config?.app?.name || "CoastPulse Transit";
  });
  if (elements.topDisclaimer) {
    elements.topDisclaimer.textContent = config?.disclaimer?.short || "Unofficial project. Not affiliated with Translink.";
  }
}

function setupMap(dataBundle) {
  mapView = new MapView({
    svg: elements.mapSvg,
    cameraLayer: elements.mapCamera,
    lineLayer: elements.mapLines,
    stopLayer: elements.mapStops,
    labelLayer: elements.mapLabels,
    onStopSelect: async (stopId) => {
      updateState({ selectedStopId: stopId });
      addRecentStop(stopId);
      updateState({ recentStopIds: getRecentStops() });
      await refreshSelectedStopData(stopId);
    },
    onRouteSelect: (routeId) => {
      setSelectedRoute(routeId);
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
    stops: dataBundle.stops
  });
}

function setupSearch(dataBundle) {
  const search = new SearchController({
    input: elements.searchInput,
    resultList: elements.searchResults,
    clearButton: elements.searchClear,
    onSelectStop: async (stopId) => {
      updateState({ selectedStopId: stopId });
      addRecentStop(stopId);
      updateState({ recentStopIds: getRecentStops() });
      await refreshSelectedStopData(stopId);
    },
    onSelectRoute: (routeId) => {
      setSelectedRoute(routeId);
    }
  });

  search.setData({
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
      updateState({ selectedStopId: stopId });
      addRecentStop(stopId);
      updateState({ recentStopIds: getRecentStops() });
      await refreshSelectedStopData(stopId);
      return;
    }

    const selectedStopId = store.getState().selectedStopId;
    const selectedStop = selectedStopId ? bundle.stopById[selectedStopId] : null;

    if (action === "set-origin" && selectedStop) {
      updateState({ originStopId: selectedStop.id });
      await refreshEstimate();
    }

    if (action === "set-destination" && selectedStop) {
      updateState({ destinationStopId: selectedStop.id });
      await refreshEstimate();
    }

    if (action === "clear-trip") {
      updateState({ originStopId: null, destinationStopId: null, estimateResult: null });
      return;
    }

    if (action === "estimate") {
      await refreshEstimate();
      return;
    }

    if (action === "copy-coords" && selectedStop) {
      await copyToClipboard(`${selectedStop.lat},${selectedStop.lon}`);
      flashActionLabel(target, "Copied");
      return;
    }

    if (action === "copy-link" && selectedStop) {
      await copyToClipboard(buildStopShareUrl(selectedStop.id));
      flashActionLabel(target, "Copied");
      return;
    }
  });

  elements.stopPanel?.addEventListener("change", async (event) => {
    const select = event.target.closest("select[data-action='destination-select']");
    if (!select) {
      return;
    }
    updateState({ destinationStopId: select.value || null });
    await refreshEstimate();
  });
}

function render() {
  const state = store.getState();

  renderFilters(state);
  renderRouteLegend(state);

  mapView?.updateState({
    selectedStopId: state.selectedStopId,
    selectedRouteId: state.selectedRouteId,
    filters: state.filters
  });

  renderFallbackBanner(state);
  renderStopPanel(state);
}

function renderFilters(state) {
  elements.filterButtons.forEach((button) => {
    const mode = button.dataset.filterMode;
    const enabled = state.filters[mode];
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.classList.toggle("active", Boolean(enabled));
  });
}

function renderRouteLegend(state) {
  if (!elements.routeLegend) {
    return;
  }

  const list = bundle.routes
    .slice()
    .sort((a, b) => {
      if (a.mode === b.mode) {
        return String(a.shortName).localeCompare(String(b.shortName));
      }
      return a.mode === "tram" ? -1 : 1;
    })
    .map((route) => {
      const selected = state.selectedRouteId === route.id;
      return `<li>
        <button type="button" data-route-id="${route.id}" class="legend-route ${selected ? "selected" : ""}" style="--route-color:${route.color}">
          <span class="legend-short">${route.shortName}</span>
          <span class="legend-long">${route.longName}</span>
        </button>
      </li>`;
    })
    .join("");

  elements.routeLegend.innerHTML = `<ul>${list}</ul>`;
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
    const recentStops = state.recentStopIds.map((id) => bundle.stopById[id]).filter(Boolean);
    elements.stopPanel.innerHTML = `
      <section class="panel-section">
        <h2>Gold Coast network view</h2>
        <p>Select a tram stop or major bus interchange to see routes, departures, and direct travel estimates.</p>
      </section>
      <section class="panel-section">
        <h3>Recently viewed</h3>
        ${recentStopsList(recentStops)}
      </section>
      <section class="panel-section panel-disclaimer">
        <h3>Unofficial data notice</h3>
        <p>${bundle.config.disclaimer.long}</p>
      </section>
    `;
    return;
  }

  const routesAtStop = bundle.routes.filter((route) => route.stopSequence.includes(selectedStop.id));

  const departureResult = state.selectedStopDepartures;
  const departures = departureResult?.departures || [];
  const alerts = state.selectedStopAlerts || [];

  const originStop = state.originStopId ? bundle.stopById[state.originStopId] : null;
  const destinationStop = state.destinationStopId ? bundle.stopById[state.destinationStopId] : null;

  const mapLinks = buildExternalMapLinks(selectedStop);
  const destinationOptions = originStop
    ? routePlanner.getDirectDestinationIds(originStop.id).map((id) => bundle.stopById[id]).filter(Boolean)
    : [];

  const estimateMarkup = renderEstimate(state.estimateResult, originStop, destinationStop);

  elements.stopPanel.innerHTML = `
    <section class="panel-section stop-header">
      <div>
        <h2>${selectedStop.name}</h2>
        <p class="stop-subtitle">${selectedStop.code} · ${selectedStop.lat.toFixed(5)}, ${selectedStop.lon.toFixed(5)}</p>
      </div>
      <div class="mode-row">${modePills(selectedStop.modes)}</div>
      <div class="stop-actions">
        <button type="button" data-action="set-origin">Set as origin</button>
        <button type="button" data-action="set-destination">Set as destination</button>
        <button type="button" data-action="copy-coords">Copy coordinates</button>
        <button type="button" data-action="copy-link">Share stop link</button>
      </div>
      <div class="map-link-row">
        <a href="${mapLinks.standard}" target="_blank" rel="noreferrer">Open in Google Maps</a>
        <a href="${mapLinks.satellite}" target="_blank" rel="noreferrer">Open satellite view</a>
      </div>
    </section>

    <section class="panel-section">
      <h3>Routes serving this stop</h3>
      <div class="route-chip-list">${routeChips(routesAtStop)}</div>
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
      ${estimateMarkup}
    </section>
  `;
}

function renderEstimate(result, originStop, destinationStop) {
  if (!originStop || !destinationStop) {
    return `<div class="empty-state">Set origin and destination to estimate a direct trip.</div>`;
  }

  if (!result) {
    return `<div class="empty-state">Estimate not computed yet.</div>`;
  }

  if (!result.valid) {
    return `<div class="estimate-card error">${result.message}</div>`;
  }

  return `<div class="estimate-card">
    <p><strong>${result.routeShortName}</strong> ${result.routeLongName}</p>
    <p>Estimated in-vehicle time: <strong>${result.minutes} min</strong></p>
    <p>${result.departureLabel ? `Next departure ${result.departureLabel}` : "Next departure not available in current window"}</p>
    <p>${result.arrivalLabel ? `Estimated arrival ${result.arrivalLabel}` : "Arrival time unavailable"}</p>
  </div>`;
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
  const [departuresResult, alerts] = await Promise.all([
    getDeparturesCached(stopId),
    alertsService.getAlertsForContext({ stopId, routeIds: stop.routes })
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

  if (store.getState().originStopId && store.getState().destinationStopId) {
    await refreshEstimate();
  }
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

  const result = routePlanner.estimateDirectJourney({
    originStopId,
    destinationStopId,
    preferredRouteId: selectedRouteId || null,
    departuresAtOrigin: originDepartures.departures
  });

  updateState({ estimateResult: result });
}

function buildExternalMapLinks(stop) {
  const coords = `${stop.lat},${stop.lon}`;
  return {
    standard: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`,
    satellite: `https://www.google.com/maps/@?api=1&map_action=map&center=${encodeURIComponent(coords)}&zoom=18&basemap=satellite`
  };
}

function syncUrl() {
  const state = store.getState();
  writeStateToUrl(state);
}

function updateState(patch) {
  store.setState(patch);
}

function setSelectedRoute(routeId) {
  const current = store.getState().selectedRouteId;
  const next = current === routeId ? null : routeId;
  updateState({ selectedRouteId: next });
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
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function renderBootError(error) {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  elements.stopPanel.innerHTML = `<section class="panel-section"><h2>Unable to start</h2><p>${message}</p></section>`;
}

init();
