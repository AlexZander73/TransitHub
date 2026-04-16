function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function fuzzyScore(query, text) {
  if (!query || !text) {
    return Number.POSITIVE_INFINITY;
  }
  if (text.startsWith(query)) {
    return 0;
  }
  const index = text.indexOf(query);
  if (index >= 0) {
    return index + 1;
  }

  const tokens = query.split(/\s+/).filter(Boolean);
  let matched = 0;
  tokens.forEach((token) => {
    if (text.includes(token)) {
      matched += 1;
    }
  });

  if (!matched) {
    return Number.POSITIVE_INFINITY;
  }

  return 100 - matched;
}

export class StopsService {
  constructor(bundle) {
    this.bundle = bundle;
  }

  setBundle(bundle) {
    this.bundle = bundle;
  }

  getStopById(stopId) {
    return this.bundle?.stopById?.[stopId] || null;
  }

  listByRegion(regionId) {
    return (this.bundle?.stopsByRegion?.[regionId] || []).slice();
  }

  listFavorites(stopIds = []) {
    return stopIds.map((id) => this.getStopById(id)).filter(Boolean);
  }

  searchStops(query, options = {}) {
    const regionId = options.regionId || null;
    const modesFilter = options.modesFilter || null;

    const items = regionId ? this.listByRegion(regionId) : this.bundle?.stops || [];
    const normQuery = normalizeText(query);

    if (!normQuery) {
      return [];
    }

    return items
      .map((stop) => {
        if (modesFilter) {
          const activeModes = Object.entries(modesFilter)
            .filter(([, enabled]) => enabled)
            .map(([mode]) => mode);
          if (activeModes.length && !activeModes.some((mode) => stop.modes?.includes(mode))) {
            return null;
          }
        }

        const text = normalizeText(`${stop.name} ${stop.code || ""} ${stop.suburb || ""}`);
        const score = fuzzyScore(normQuery, text);
        if (!Number.isFinite(score)) {
          return null;
        }
        return { stop, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, Number(options.limit || 12))
      .map((item) => item.stop);
  }

  getRoutesForStop(stopId) {
    const stop = this.getStopById(stopId);
    if (!stop) {
      return [];
    }

    return (stop.routes || []).map((id) => this.bundle?.routeById?.[id]).filter(Boolean);
  }

  getNearbyStops(stopId, max = 6) {
    const stop = this.getStopById(stopId);
    if (!stop) {
      return [];
    }

    const nearbyIds = stop.nearbyStopIds || [];
    return nearbyIds
      .map((id) => this.getStopById(id))
      .filter(Boolean)
      .slice(0, max);
  }

  getInterchangeForStop(stopId) {
    const stop = this.getStopById(stopId);
    if (!stop?.interchangeId) {
      return null;
    }
    return this.bundle?.interchangeById?.[stop.interchangeId] || null;
  }

  getConnectedInterchanges(stopId) {
    const current = this.getInterchangeForStop(stopId);
    if (!current) {
      return [];
    }

    return (current.connectedInterchanges || [])
      .map((id) => this.bundle?.interchangeById?.[id])
      .filter(Boolean);
  }

  describeStopType(stop) {
    if (!stop) {
      return "Stop";
    }
    const type = String(stop.type || "stop").toLowerCase();
    if (type.includes("interchange")) {
      return "Interchange";
    }
    if (type.includes("station")) {
      return "Station";
    }
    if (type.includes("tram")) {
      return "Tram stop";
    }
    if (type.includes("bus")) {
      return "Bus stop";
    }
    return "Stop";
  }
}
