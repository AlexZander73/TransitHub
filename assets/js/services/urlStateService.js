const URL_KEYS = [
  "stop",
  "route",
  "origin",
  "destination",
  "compareStop",
  "region",
  "mapMode",
  "search",
  "tram",
  "bus",
  "interchange"
];

function boolFromParam(value, fallback = true) {
  if (value === null) {
    return fallback;
  }
  if (["0", "false", "off", "no"].includes(String(value).toLowerCase())) {
    return false;
  }
  return true;
}

function setOrDelete(params, key, value) {
  if (value === undefined || value === null || value === "") {
    params.delete(key);
    return;
  }
  params.set(key, String(value));
}

export function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);

  return {
    selectedStopId: params.get("stop") || null,
    selectedRouteId: params.get("route") || null,
    originStopId: params.get("origin") || null,
    destinationStopId: params.get("destination") || null,
    compareStopId: params.get("compareStop") || null,
    selectedRegionId: params.get("region") || null,
    mapMode: params.get("mapMode") || null,
    searchQuery: params.get("search") || "",
    filters: {
      tram: boolFromParam(params.get("tram"), true),
      bus: boolFromParam(params.get("bus"), true),
      interchange: boolFromParam(params.get("interchange"), true)
    }
  };
}

export function writeStateToUrl(state = {}, options = {}) {
  const current = new URL(window.location.href);

  setOrDelete(current.searchParams, "stop", state.selectedStopId);
  setOrDelete(current.searchParams, "route", state.selectedRouteId);
  setOrDelete(current.searchParams, "origin", state.originStopId);
  setOrDelete(current.searchParams, "destination", state.destinationStopId);
  setOrDelete(current.searchParams, "compareStop", state.compareStopId);
  setOrDelete(current.searchParams, "region", state.selectedRegionId);
  setOrDelete(current.searchParams, "mapMode", state.mapMode);
  setOrDelete(current.searchParams, "search", state.searchQuery || null);

  if (state.filters) {
    setOrDelete(current.searchParams, "tram", state.filters.tram ? "1" : "0");
    setOrDelete(current.searchParams, "bus", state.filters.bus ? "1" : "0");
    setOrDelete(current.searchParams, "interchange", state.filters.interchange ? "1" : "0");
  }

  URL_KEYS.forEach((key) => {
    if (!current.searchParams.get(key)) {
      current.searchParams.delete(key);
    }
  });

  if (options.replace === false) {
    history.pushState({}, "", current);
    return;
  }

  history.replaceState({}, "", current);
}

export function buildStopShareUrl(stopId, state = {}) {
  const url = new URL(window.location.href);
  setOrDelete(url.searchParams, "stop", stopId);
  setOrDelete(url.searchParams, "region", state.selectedRegionId || null);
  setOrDelete(url.searchParams, "route", state.selectedRouteId || null);
  return url.toString();
}

export function buildRouteShareUrl(routeId, state = {}) {
  const url = new URL(window.location.href);
  setOrDelete(url.searchParams, "route", routeId);
  setOrDelete(url.searchParams, "region", state.selectedRegionId || null);
  return url.toString();
}
