function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

export class RoutesService {
  constructor(bundle) {
    this.bundle = bundle;
  }

  setBundle(bundle) {
    this.bundle = bundle;
  }

  getRouteById(routeId) {
    return this.bundle?.routeById?.[routeId] || null;
  }

  listByRegion(regionId) {
    return (this.bundle?.routesByRegion?.[regionId] || []).slice();
  }

  searchRoutes(query, options = {}) {
    const regionId = options.regionId || null;
    const items = regionId ? this.listByRegion(regionId) : this.bundle?.routes || [];
    const q = normalizeText(query);

    if (!q) {
      return [];
    }

    return items
      .map((route) => {
        const text = normalizeText(`${route.shortName} ${route.longName} ${route.mode}`);
        if (!text.includes(q)) {
          return null;
        }
        const starts = text.startsWith(q) || String(route.shortName || "").startsWith(q);
        return { route, score: starts ? 0 : text.indexOf(q) + 1 };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, Number(options.limit || 10))
      .map((row) => row.route);
  }

  getStopsForRoute(routeId) {
    const route = this.getRouteById(routeId);
    if (!route) {
      return [];
    }

    return (route.stopSequence || []).map((id) => this.bundle?.stopById?.[id]).filter(Boolean);
  }

  getPatternsForRoute(routeId) {
    return (this.bundle?.patternsByRouteId?.[routeId] || []).slice();
  }

  listFavorites(routeIds = []) {
    return routeIds.map((id) => this.getRouteById(id)).filter(Boolean);
  }
}
