import { formatCountdown } from "../utils/time.js";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sourceTag(source) {
  if (source === "live") {
    return "Live";
  }
  if (source === "sample") {
    return "Sample";
  }
  return "Schedule";
}

function confidenceLabel(confidence) {
  if (!confidence) {
    return "Medium";
  }
  const raw = String(confidence).toLowerCase();
  if (raw === "high") {
    return "High";
  }
  if (raw === "low") {
    return "Low";
  }
  return "Medium";
}

export function modePills(modes = []) {
  return modes
    .map((mode) => `<span class="pill mode-pill mode-${escapeHtml(mode)}">${escapeHtml(mode)}</span>`)
    .join("");
}

export function routeChips(routes = [], options = {}) {
  const favoriteRouteIds = new Set(options.favoriteRouteIds || []);

  return routes
    .map(
      (route) => `<button type="button" class="route-chip" data-route-id="${escapeHtml(route.id)}" style="--route-color:${escapeHtml(
        route.color || "#6a7d92"
      )}">
        <span>${escapeHtml(route.shortName)}</span>
        <small>${escapeHtml(route.longName)}</small>
        ${
          favoriteRouteIds.has(route.id)
            ? '<span class="chip-indicator" aria-label="Saved route" title="Saved route">★</span>'
            : ""
        }
      </button>`
    )
    .join("");
}

export function departuresList(departures = [], routeById = {}, now = new Date()) {
  if (!departures.length) {
    return `<div class="empty-state">No upcoming departures found for this stop.</div>`;
  }

  return `<ul class="departures-list">${departures
    .map((item) => {
      const route = routeById[item.routeId] || null;
      const routeLabel = route?.shortName || item.routeId || "-";
      const routeColor = route?.color || "#5c6f82";
      const countdown = formatCountdown(item.departureTime, now);
      const source = sourceTag(item.source);
      const status = item.status ? String(item.status).replaceAll("_", " ") : "scheduled";

      return `<li class="departure-item">
        <span class="route-dot" style="--route-color:${escapeHtml(routeColor)}"></span>
        <span class="departure-main">
          <span class="departure-route">${escapeHtml(routeLabel)} to ${escapeHtml(item.headsign)}</span>
          <span class="departure-meta">${escapeHtml(item.departureLabel)} · ${escapeHtml(source)}${
            item.platform ? ` · ${escapeHtml(item.platform)}` : ""
          } · ${escapeHtml(status)}</span>
        </span>
        <span class="departure-countdown">${escapeHtml(countdown)}</span>
      </li>`;
    })
    .join("")}</ul>`;
}

export function alertsList(alerts = []) {
  if (!alerts.length) {
    return `<div class="empty-state compact">No active alerts for this context.</div>`;
  }

  return `<ul class="alerts-list">${alerts
    .map(
      (alert) => `<li class="alert-item level-${escapeHtml(alert.level)}">
      <strong>${escapeHtml(alert.title)}</strong>
      <p>${escapeHtml(alert.description)}</p>
      <p class="alert-meta">${escapeHtml(alert.impact || "Service notice")}${
        alert.region ? ` · ${escapeHtml(alert.region)}` : ""
      }</p>
    </li>`
    )
    .join("")}</ul>`;
}

export function recentStopsList(stops = []) {
  if (!stops.length) {
    return `<p class="empty-state compact">No recent stops yet.</p>`;
  }

  return `<div class="recent-stop-list">${stops
    .map(
      (stop) => `<button type="button" class="recent-stop-btn" data-stop-id="${escapeHtml(stop.id)}">${escapeHtml(stop.name)}</button>`
    )
    .join("")}</div>`;
}

export function recentRoutesList(routes = []) {
  if (!routes.length) {
    return `<p class="empty-state compact">No recent routes yet.</p>`;
  }

  return `<div class="recent-stop-list">${routes
    .map(
      (route) => `<button type="button" class="recent-stop-btn" data-route-id="${escapeHtml(route.id)}">${escapeHtml(
        route.shortName
      )} · ${escapeHtml(route.longName)}</button>`
    )
    .join("")}</div>`;
}

export function favoriteStopsList(stops = []) {
  if (!stops.length) {
    return `<p class="empty-state compact">No pinned stops yet.</p>`;
  }

  return `<div class="recent-stop-list">${stops
    .map(
      (stop) => `<button type="button" class="recent-stop-btn" data-stop-id="${escapeHtml(stop.id)}">★ ${escapeHtml(stop.name)}</button>`
    )
    .join("")}</div>`;
}

export function favoriteRoutesList(routes = []) {
  if (!routes.length) {
    return `<p class="empty-state compact">No saved routes yet.</p>`;
  }

  return `<div class="recent-stop-list">${routes
    .map(
      (route) => `<button type="button" class="recent-stop-btn" data-route-id="${escapeHtml(route.id)}">★ ${escapeHtml(
        route.shortName
      )}</button>`
    )
    .join("")}</div>`;
}

export function nearbyStopsList(stops = []) {
  if (!stops.length) {
    return `<p class="empty-state compact">No nearby linked stops available.</p>`;
  }

  return `<ul class="compact-link-list">${stops
    .map(
      (stop) => `<li><button type="button" data-stop-id="${escapeHtml(stop.id)}">${escapeHtml(stop.name)}</button></li>`
    )
    .join("")}</ul>`;
}

export function connectedInterchangesList(interchanges = []) {
  if (!interchanges.length) {
    return `<p class="empty-state compact">No linked interchange notes.</p>`;
  }

  return `<ul class="compact-link-list">${interchanges
    .map(
      (node) => `<li><strong>${escapeHtml(node.name)}</strong><br /><small>${escapeHtml(node.notes || "")}</small></li>`
    )
    .join("")}</ul>`;
}

export function estimateCard(result) {
  if (!result) {
    return `<div class="empty-state">Estimate not computed yet.</div>`;
  }

  if (!result.valid) {
    return `<div class="estimate-card error">
      <p><strong>${escapeHtml(result.code || "Not available")}</strong></p>
      <p>${escapeHtml(result.message || "Direct estimate unavailable.")}</p>
    </div>`;
  }

  return `<div class="estimate-card">
    <p><strong>${escapeHtml(result.routeShortName)}</strong> ${escapeHtml(result.routeLongName)}</p>
    <p>Estimated in-vehicle time: <strong>${escapeHtml(result.minutes)} min</strong></p>
    ${result.distanceKm ? `<p>Distance proxy: ${escapeHtml(result.distanceKm.toFixed(1))} km</p>` : ""}
    <p>Confidence: <strong>${escapeHtml(confidenceLabel(result.confidence))}</strong></p>
    <p>${result.departureLabel ? `Next departure ${escapeHtml(result.departureLabel)}` : "Next departure not available in current window"}</p>
    <p>${result.arrivalLabel ? `Estimated arrival ${escapeHtml(result.arrivalLabel)}` : "Arrival time unavailable"}</p>
    <p class="estimate-note">${escapeHtml(result.eligibilityNote || "Direct estimate only. Transfer planner not yet supported.")}</p>
  </div>`;
}
