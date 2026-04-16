import { indexById } from "../utils/network.js";

function groupByRegion(items = []) {
  return items.reduce((acc, item) => {
    const key = item.region || "unknown";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});
}

function indexManyByKey(items = [], keyName = "routeId") {
  return items.reduce((acc, item) => {
    const key = item[keyName];
    if (!key) {
      return acc;
    }
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});
}

function normalizeConfig(config = {}) {
  const regionDefault =
    config?.regions?.defaultRegion || config?.app?.primaryRegion || config?.regions?.enabled?.[0] || "gold-coast";

  return {
    ...config,
    app: {
      name: "CoastPulse Transit Atlas",
      timezone: "Australia/Brisbane",
      ...config.app
    },
    regions: {
      enabled: ["gold-coast"],
      planned: [],
      defaultRegion: regionDefault,
      ...config.regions
    },
    ui: {
      defaultMapMode: "stylized",
      mapModes: ["stylized", "corridor", "connections"],
      ...config.ui
    }
  };
}

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

    const configRaw = await this.loadJson(this.configPath);
    const config = normalizeConfig(configRaw || {});
    const paths = config.dataPaths || {};

    const [
      regionsData,
      stopsData,
      routesData,
      linesData,
      directTravelData,
      interchangesData,
      routePatternsData
    ] = await Promise.all([
      this.loadJson(paths.regions, { optional: true }),
      this.loadJson(paths.stops),
      this.loadJson(paths.routes),
      this.loadJson(paths.lines),
      this.loadJson(paths.directTravel),
      this.loadJson(paths.interchanges, { optional: true }),
      this.loadJson(paths.routePatterns, { optional: true })
    ]);

    const stops = stopsData?.stops || [];
    const routes = routesData?.routes || [];
    const lines = linesData?.lines || [];
    const directTravelEdges = directTravelData?.edges || [];
    const regions = regionsData?.regions || [];
    const interchanges = interchangesData?.interchanges || [];
    const routePatterns = routePatternsData?.patterns || [];

    const stopById = indexById(stops);
    const routeById = indexById(routes);
    const lineById = indexById(lines);
    const regionById = indexById(regions);
    const interchangeById = indexById(interchanges);

    const routesByRegion = groupByRegion(routes);
    const stopsByRegion = groupByRegion(stops);
    const linesByRegion = groupByRegion(lines);
    const interchangesByRegion = groupByRegion(interchanges);

    this.bundle = {
      config,
      regions,
      stops,
      routes,
      lines,
      directTravelEdges,
      interchanges,
      routePatterns,
      stopById,
      routeById,
      lineById,
      regionById,
      interchangeById,
      routesByRegion,
      stopsByRegion,
      linesByRegion,
      interchangesByRegion,
      patternsByRouteId: indexManyByKey(routePatterns, "routeId"),
      stopsByInterchangeId: stops.reduce((acc, stop) => {
        if (!stop.interchangeId) {
          return acc;
        }
        if (!acc[stop.interchangeId]) {
          acc[stop.interchangeId] = [];
        }
        acc[stop.interchangeId].push(stop);
        return acc;
      }, {})
    };

    return this.bundle;
  }

  async getRegionBundle(regionId) {
    const bundle = await this.getBundle();
    const id = regionId || bundle.config?.regions?.defaultRegion || "gold-coast";

    return {
      ...bundle,
      selectedRegionId: id,
      selectedRegion: bundle.regionById[id] || null,
      routes: bundle.routesByRegion[id] || [],
      stops: bundle.stopsByRegion[id] || [],
      lines: bundle.linesByRegion[id] || [],
      interchanges: bundle.interchangesByRegion[id] || []
    };
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
