const URL_KEYS = ["stop", "route", "origin", "destination"];

export function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    selectedStopId: params.get("stop") || null,
    selectedRouteId: params.get("route") || null,
    originStopId: params.get("origin") || null,
    destinationStopId: params.get("destination") || null
  };
}

export function writeStateToUrl(state) {
  const current = new URL(window.location.href);

  setOrDelete(current.searchParams, "stop", state.selectedStopId);
  setOrDelete(current.searchParams, "route", state.selectedRouteId);
  setOrDelete(current.searchParams, "origin", state.originStopId);
  setOrDelete(current.searchParams, "destination", state.destinationStopId);

  URL_KEYS.forEach((key) => {
    if (!current.searchParams.get(key)) {
      current.searchParams.delete(key);
    }
  });

  history.replaceState({}, "", current);
}

export function buildStopShareUrl(stopId) {
  const url = new URL(window.location.href);
  url.searchParams.set("stop", stopId);
  return url.toString();
}

function setOrDelete(params, key, value) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}
