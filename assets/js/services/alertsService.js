function toDateOrNull(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isActiveAlert(alert, now) {
  if (alert.status && alert.status.toLowerCase() === "inactive") {
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
    level: (alert.level || "info").toLowerCase(),
    title: alert.title || "Service notice",
    description: alert.description || "",
    routes: alert.routes || [],
    stops: alert.stops || [],
    effectiveFrom: alert.effectiveFrom || null,
    effectiveTo: alert.effectiveTo || null,
    status: alert.status || "active"
  }));
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

    return active.filter((alert) => {
      const matchesStop = stopId ? !alert.stops.length || alert.stops.includes(stopId) : true;
      const matchesRoute = routeIds.size ? !alert.routes.length || alert.routes.some((id) => routeIds.has(id)) : true;
      return matchesStop && matchesRoute;
    });
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
