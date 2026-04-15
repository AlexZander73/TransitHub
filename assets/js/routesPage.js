import { TransitDataService } from "./services/transitDataService.js";
import { readStateFromUrl, writeStateToUrl } from "./utils/urlState.js";

const dataService = new TransitDataService();

const elements = {
  routeList: document.querySelector("#routes-list"),
  routeDetail: document.querySelector("#route-detail"),
  brand: document.querySelectorAll("[data-brand-name]"),
  regionTag: document.querySelector("#region-tag")
};

const urlState = readStateFromUrl();
let bundle = null;
let selectedRouteId = urlState.selectedRouteId || null;

async function init() {
  bundle = await dataService.getBundle();
  elements.brand.forEach((node) => {
    node.textContent = bundle.config?.app?.name || "CoastPulse Transit";
  });
  if (elements.regionTag) {
    elements.regionTag.textContent = bundle.config?.app?.region || "Gold Coast";
  }

  if (!selectedRouteId) {
    selectedRouteId = bundle.routes[0]?.id || null;
  }

  renderRouteList();
  renderRouteDetail();
}

function renderRouteList() {
  const html = bundle.routes
    .slice()
    .sort((a, b) => String(a.shortName).localeCompare(String(b.shortName), "en-AU", { numeric: true }))
    .map((route) => {
      const selected = route.id === selectedRouteId;
      return `<li>
        <button type="button" class="routes-page-item ${selected ? "selected" : ""}" data-route-id="${route.id}" style="--route-color:${route.color}">
          <span class="route-badge">${route.shortName}</span>
          <span class="route-text">
            <strong>${route.longName}</strong>
            <small>${route.mode} · ${route.stopSequence.length} stops</small>
          </span>
        </button>
      </li>`;
    })
    .join("");

  elements.routeList.innerHTML = `<ul>${html}</ul>`;

  elements.routeList.querySelectorAll("button[data-route-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRouteId = button.dataset.routeId;
      writeStateToUrl({ selectedRouteId, selectedStopId: null, originStopId: null, destinationStopId: null });
      renderRouteList();
      renderRouteDetail();
    });
  });
}

function renderRouteDetail() {
  const route = bundle.routeById[selectedRouteId];
  if (!route) {
    elements.routeDetail.innerHTML = `<p>No route selected.</p>`;
    return;
  }

  const stopRows = route.stopSequence
    .map((stopId, idx) => {
      const stop = bundle.stopById[stopId];
      const cumulative = route.segmentMinutes.slice(0, idx).reduce((sum, value) => sum + Number(value || 0), 0);
      return `<tr>
        <td>${idx + 1}</td>
        <td><a href="./index.html?stop=${stop.id}&route=${route.id}">${stop.name}</a></td>
        <td>${cumulative} min</td>
      </tr>`;
    })
    .join("");

  const directionRows = route.directions
    .map(
      (direction) => `<li><strong>${direction.headsign}</strong>: ${direction.service.weekday.first}-${direction.service.weekday.last}, approx every ${direction.service.weekday.frequencyMins} min (weekday)</li>`
    )
    .join("");

  elements.routeDetail.innerHTML = `
    <article class="route-detail-card" style="--route-color:${route.color}">
      <header>
        <span class="route-badge">${route.shortName}</span>
        <div>
          <h2>${route.longName}</h2>
          <p>${route.notes || ""}</p>
        </div>
      </header>
      <section>
        <h3>Service pattern</h3>
        <ul>${directionRows}</ul>
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
    </article>
  `;
}

init();
