const KEYS = {
  recentStops: "coastpulse_recent_stops",
  recentRoutes: "coastpulse_recent_routes",
  recentSearches: "coastpulse_recent_searches",
  favoriteStops: "coastpulse_favorite_stops",
  favoriteRoutes: "coastpulse_favorite_routes",
  recentTrips: "coastpulse_recent_trips"
};

const LIMITS = {
  recentStops: 10,
  recentRoutes: 10,
  recentSearches: 12,
  recentTrips: 6
};

function hasStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function safeParse(raw, fallback) {
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function dedupeList(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export class StorageService {
  constructor(storage = hasStorage() ? window.localStorage : null) {
    this.storage = storage;
  }

  getList(key) {
    if (!this.storage) {
      return [];
    }
    return ensureArray(safeParse(this.storage.getItem(key), []));
  }

  setList(key, list) {
    if (!this.storage) {
      return;
    }
    this.storage.setItem(key, JSON.stringify(dedupeList(list)));
  }

  pushRecent(keyName, value) {
    const key = KEYS[keyName];
    if (!key || !value) {
      return;
    }
    const list = this.getList(key).filter((item) => item !== value);
    list.unshift(value);
    const limit = LIMITS[keyName] || 10;
    this.setList(key, list.slice(0, limit));
  }

  addRecentStop(stopId) {
    this.pushRecent("recentStops", stopId);
  }

  addRecentRoute(routeId) {
    this.pushRecent("recentRoutes", routeId);
  }

  addRecentSearch(query) {
    if (!query || query.length < 2) {
      return;
    }
    this.pushRecent("recentSearches", query.trim());
  }

  addRecentTrip(pair) {
    if (!pair?.originStopId || !pair?.destinationStopId) {
      return;
    }
    const encoded = `${pair.originStopId}__${pair.destinationStopId}`;
    this.pushRecent("recentTrips", encoded);
  }

  getRecentStops() {
    return this.getList(KEYS.recentStops);
  }

  getRecentRoutes() {
    return this.getList(KEYS.recentRoutes);
  }

  getRecentSearches() {
    return this.getList(KEYS.recentSearches);
  }

  getRecentTrips() {
    return this.getList(KEYS.recentTrips)
      .map((entry) => {
        const [originStopId, destinationStopId] = String(entry).split("__");
        if (!originStopId || !destinationStopId) {
          return null;
        }
        return { originStopId, destinationStopId };
      })
      .filter(Boolean);
  }

  toggleFavoriteStop(stopId) {
    return this.toggleFavorite(KEYS.favoriteStops, stopId);
  }

  toggleFavoriteRoute(routeId) {
    return this.toggleFavorite(KEYS.favoriteRoutes, routeId);
  }

  toggleFavorite(key, value) {
    if (!value) {
      return false;
    }
    const list = this.getList(key);
    const exists = list.includes(value);
    const next = exists ? list.filter((item) => item !== value) : [value, ...list];
    this.setList(key, next);
    return !exists;
  }

  getFavoriteStops() {
    return this.getList(KEYS.favoriteStops);
  }

  getFavoriteRoutes() {
    return this.getList(KEYS.favoriteRoutes);
  }

  isFavoriteStop(stopId) {
    return this.getFavoriteStops().includes(stopId);
  }

  isFavoriteRoute(routeId) {
    return this.getFavoriteRoutes().includes(routeId);
  }

  clearAll() {
    if (!this.storage) {
      return;
    }
    Object.values(KEYS).forEach((key) => this.storage.removeItem(key));
  }
}

export const storageService = new StorageService();
