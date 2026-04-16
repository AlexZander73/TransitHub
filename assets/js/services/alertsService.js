function toDateOrNull(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isActiveAlert(alert, now) {
  if (alert.status && String(alert.status).toLowerCase() === "inactive") {
    return false;
  }
  const from = toDateOrNull(alert.effectiveFrom);
  const to = toDateOrNull(alert.effectiveTo);
  if (from && now < from) {
    return false;
  }
  if (to && now > to) {
    return false;
  }
  return true;
}

function normalizeAlerts(payload) {
  return (payload?.alerts || []).map((alert) => ({
    id: alert.id,
    region: alert.region || null,
    level: String(alert.level || "info").toLowerCase(),
    severity: Number(alert.severity || 1),
    title: alert.title || "Service notice",
    description: alert.description || "",
    routes: alert.routes || [],
    stops: alert.stops || [],
    interchanges: alert.interchanges || [],
    impact: alert.impact || null,
    effectiveFrom: alert.effectiveFrom || null,
    effectiveTo: alert.effectiveTo || null,
    status: alert.status || "active"
  }));
}

function sortAlerts(alerts = []) {
  return alerts
    .slice()
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return b.severity - a.severity;
      }
      return String(a.title).localeCompare(String(b.title));
    });
}

export class AlertsService {
  constructor(dataService) {
    this.dataService = dataService;
  }

  async getAlertsForContext(context = {}) {
    const bundle = await this.dataService.getBundle();
    const now = context.now || new Date();
    const all = await this.getBestAlertsSource(bundle.config);

    const active = all.filter((alert) => isActiveAlert(alert, now));

    const stopId = context.stopId || null;
    const routeIds = new Set(context.routeIds || []);
    const regionId = context.regionId || null;
    const interchangeIds = new Set(context.interchangeIds || []);

    const filtered = active.filter((alert) => {
      const matchesRegion = regionId ? !alert.region || alert.region === regionId : true;
      const matchesStop = stopId ? !alert.stops.length || alert.stops.includes(stopId) : true;
      const matchesRoute = routeIds.size ? !alert.routes.length || alert.routes.some((id) => routeIds.has(id)) : true;
      const matchesInterchange = interchangeIds.size
        ? !alert.interchanges.length || alert.interchanges.some((id) => interchangeIds.has(id))
        : true;
      return matchesRegion && matchesStop && matchesRoute && matchesInterchange;
    });

    return sortAlerts(filtered);
  }

  async getAllAlerts(options = {}) {
    const bundle = await this.dataService.getBundle();
    const source = await this.getBestAlertsSource(bundle.config);
    const now = options.now || new Date();
    const regionId = options.regionId || null;

    const active = source.filter((alert) => isActiveAlert(alert, now));
    const recent = source.filter((alert) => !isActiveAlert(alert, now));

    const filterByRegion = (alerts) =>
      regionId ? alerts.filter((alert) => !alert.region || alert.region === regionId) : alerts;

    return {
      active: sortAlerts(filterByRegion(active)),
      recent: sortAlerts(filterByRegion(recent))
    };
  }

  async getBestAlertsSource(config) {
    const liveConfig = config?.liveData || {};

    if (liveConfig.enabled) {
      const livePayload = await this.dataService.loadJson(liveConfig.alertsPath, { optional: true, bypassCache: true });
      if (livePayload?.alerts?.length) {
        return normalizeAlerts(livePayload);
      }
    }

    const samplePayload = await this.dataService.loadJson(config?.dataPaths?.alertsSample, { optional: true });
    return normalizeAlerts(samplePayload);
  }
}
