import { formatCountdown } from "../utils/time.js";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function modePills(modes = []) {
  return modes
    .map((mode) => `<span class="pill mode-pill mode-${escapeHtml(mode)}">${escapeHtml(mode)}</span>`)
    .join("");
}

export function routeChips(routes = []) {
  return routes
    .map(
      (route) =>
        `<button type="button" class="route-chip" data-route-id="${escapeHtml(route.id)}" style="--route-color:${escapeHtml(
          route.color || "#6a7d92"
        )}"><span>${escapeHtml(route.shortName)}</span><small>${escapeHtml(route.longName)}</small></button>`
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
      const sourceLabel = item.source === "live" ? "Live" : item.source === "sample" ? "Sample" : "Schedule";

      return `<li class="departure-item">
        <span class="route-dot" style="--route-color:${escapeHtml(routeColor)}"></span>
        <span class="departure-main">
          <span class="departure-route">${escapeHtml(routeLabel)} to ${escapeHtml(item.headsign)}</span>
          <span class="departure-meta">${escapeHtml(item.departureLabel)} · ${escapeHtml(sourceLabel)}${
            item.platform ? ` · ${escapeHtml(item.platform)}` : ""
          }</span>
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
      (stop) =>
        `<button type="button" class="recent-stop-btn" data-stop-id="${escapeHtml(stop.id)}">${escapeHtml(stop.name)}</button>`
    )
    .join("")}</div>`;
}
