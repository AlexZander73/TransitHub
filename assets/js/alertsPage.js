import { TransitDataService } from "./services/transitDataService.js";
import { AlertsService } from "./services/alertsService.js";
import { readStateFromUrl, writeStateToUrl } from "./utils/urlState.js";

const dataService = new TransitDataService();
const alertsService = new AlertsService(dataService);

const elements = {
  brand: document.querySelectorAll("[data-brand-name]"),
  brandTagline: document.querySelectorAll("[data-brand-tagline]"),
  regionSelect: document.querySelector("#alerts-region-select"),
  severityFilter: document.querySelector("#alerts-severity-filter"),
  activeList: document.querySelector("#alerts-active"),
  recentList: document.querySelector("#alerts-recent"),
  summary: document.querySelector("#alerts-summary")
};

const urlState = readStateFromUrl();

let bundle = null;
let selectedRegionId = urlState.selectedRegionId || null;
let severityFilter = "all";

async function init() {
  bundle = await dataService.getBundle();

  selectedRegionId = selectedRegionId || bundle.config?.regions?.defaultRegion || "gold-coast";

  elements.brand.forEach((node) => {
    node.textContent = bundle.config?.app?.name || "CoastPulse Transit Atlas";
  });

  elements.brandTagline.forEach((node) => {
    node.textContent = bundle.config?.app?.tagline || "Unofficial map-first transit intelligence for SEQ";
  });

  setupRegionSelector();
  setupSeverityFilter();

  await render();
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

  elements.regionSelect.addEventListener("change", async () => {
    selectedRegionId = elements.regionSelect.value;
    await render();
  });
}

function setupSeverityFilter() {
  elements.severityFilter?.addEventListener("change", async () => {
    severityFilter = elements.severityFilter.value;
    await render();
  });
}

function filterSeverity(alerts = []) {
  if (severityFilter === "all") {
    return alerts;
  }
  return alerts.filter((alert) => alert.level === severityFilter);
}

function renderAlerts(alerts = []) {
  if (!alerts.length) {
    return `<p class="empty-state">No alerts in this filter.</p>`;
  }

  return `<ul class="alerts-list">${alerts
    .map(
      (alert) => `<li class="alert-item level-${alert.level}">
        <strong>${alert.title}</strong>
        <p>${alert.description}</p>
        <p class="alert-meta">${alert.level.toUpperCase()} · ${alert.impact || "Service notice"}</p>
      </li>`
    )
    .join("")}</ul>`;
}

async function render() {
  const alerts = await alertsService.getAllAlerts({ regionId: selectedRegionId });
  const active = filterSeverity(alerts.active);
  const recent = filterSeverity(alerts.recent).slice(0, 12);

  if (elements.summary) {
    elements.summary.innerHTML = `<p><strong>${active.length}</strong> active and <strong>${recent.length}</strong> recent notices in ${bundle.regionById[selectedRegionId]?.label || "selected region"}.</p>`;
  }

  elements.activeList.innerHTML = renderAlerts(active);
  elements.recentList.innerHTML = renderAlerts(recent);

  writeStateToUrl({
    selectedRegionId,
    selectedStopId: null,
    selectedRouteId: null,
    originStopId: null,
    destinationStopId: null
  });
}

init();
