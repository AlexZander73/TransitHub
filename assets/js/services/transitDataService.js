import { indexById } from "../utils/network.js";

export class TransitDataService {
  constructor(configPath = "data/config.json") {
    this.configPath = configPath;
    this.jsonCache = new Map();
    this.bundle = null;
  }

  async getBundle() {
    if (this.bundle) {
      return this.bundle;
    }

    const config = await this.loadJson(this.configPath);
    const paths = config.dataPaths || {};

    const [stopsData, routesData, linesData, directTravelData] = await Promise.all([
      this.loadJson(paths.stops),
      this.loadJson(paths.routes),
      this.loadJson(paths.lines),
      this.loadJson(paths.directTravel)
    ]);

    const stops = stopsData?.stops || [];
    const routes = routesData?.routes || [];
    const lines = linesData?.lines || [];
    const directTravelEdges = directTravelData?.edges || [];

    this.bundle = {
      config,
      stops,
      routes,
      lines,
      directTravelEdges,
      stopById: indexById(stops),
      routeById: indexById(routes),
      lineById: indexById(lines)
    };

    return this.bundle;
  }

  async loadJson(path, options = {}) {
    const { optional = false, bypassCache = false } = options;
    if (!path) {
      return null;
    }

    if (!bypassCache && this.jsonCache.has(path)) {
      return this.jsonCache.get(path);
    }

    try {
      const response = await fetch(this.resolvePath(path), { cache: "no-store" });
      if (!response.ok) {
        if (optional) {
          return null;
        }
        throw new Error(`Unable to load ${path} (HTTP ${response.status})`);
      }
      const json = await response.json();
      this.jsonCache.set(path, json);
      return json;
    } catch (error) {
      if (optional) {
        return null;
      }
      throw error;
    }
  }

  resolvePath(path) {
    return new URL(path, window.location.href).toString();
  }
}
