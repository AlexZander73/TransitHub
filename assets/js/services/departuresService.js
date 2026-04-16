import { addMinutes, dayType, formatClockTime, parseHHMMToDate } from "../utils/time.js";
import { findDirectionForStops, includesStop, travelMinutesBetweenStops } from "../utils/network.js";

function normalizeDeparture(entry, now, source, stopId) {
  let departureDate = null;

  if (typeof entry.inMinutes === "number") {
    departureDate = addMinutes(now, entry.inMinutes);
  } else if (entry.expectedTime) {
    departureDate = new Date(entry.expectedTime);
  } else if (entry.scheduledTime) {
    departureDate = new Date(entry.scheduledTime);
  } else if (typeof entry.epochSeconds === "number") {
    departureDate = new Date(entry.epochSeconds * 1000);
  }

  if (!(departureDate instanceof Date) || Number.isNaN(departureDate.getTime())) {
    return null;
  }

  return {
    tripId: entry.tripId || `${entry.routeId || "X"}-${departureDate.getTime()}`,
    routeId: entry.routeId,
    headsign: entry.headsign || "Service",
    platform: entry.platform || null,
    status: entry.status || "scheduled",
    delayMinutes: Number(entry.delayMinutes || 0),
    stopId,
    source,
    departureTime: departureDate,
    departureIso: departureDate.toISOString(),
    departureLabel: formatClockTime(departureDate)
  };
}

function normalizeFromPayload(payload, now, source, stopId) {
  return (payload || [])
    .map((entry) => normalizeDeparture(entry, now, source, stopId))
    .filter(Boolean)
    .sort((a, b) => a.departureTime - b.departureTime);
}

function isFresh(meta, maxAgeMinutes, now) {
  if (!meta?.generatedAt) {
    return true;
  }
  const generated = new Date(meta.generatedAt);
  if (Number.isNaN(generated.getTime())) {
    return true;
  }
  const ageMinutes = (now.getTime() - generated.getTime()) / (60 * 1000);
  return ageMinutes <= maxAgeMinutes;
}

function pickServiceProfile(direction, type) {
  return direction?.service?.[type] || direction?.service?.weekday || null;
}

function buildScheduledForRouteStop(route, stopId, now, lookAheadMinutes) {
  if (!includesStop(route, stopId) || !Array.isArray(route.directions)) {
    return [];
  }

  const windowEnd = addMinutes(now, lookAheadMinutes);
  const serviceType = dayType(now);
  const output = [];

  route.directions.forEach((direction) => {
    const profile = pickServiceProfile(direction, serviceType);
    if (!profile) {
      return;
    }

    const originTimeOffset = travelMinutesBetweenStops(route, direction.originStopId, stopId);
    if (originTimeOffset === null) {
      return;
    }

    const first = parseHHMMToDate(profile.first, now);
    let last = parseHHMMToDate(profile.last, now);

    if (last < first) {
      last = addMinutes(last, 24 * 60);
    }

    for (let cursor = new Date(first); cursor <= last; cursor = addMinutes(cursor, profile.frequencyMins)) {
      const atStop = addMinutes(cursor, originTimeOffset);
      if (atStop < addMinutes(now, -1)) {
        continue;
      }
      if (atStop > windowEnd) {
        break;
      }

      output.push({
        tripId: `${route.id}-${direction.id}-${cursor.getHours()}${String(cursor.getMinutes()).padStart(2, "0")}`,
        routeId: route.id,
        headsign: direction.headsign,
        platform: null,
        status: "scheduled",
        delayMinutes: 0,
        stopId,
        source: "scheduled",
        departureTime: atStop,
        departureIso: atStop.toISOString(),
        departureLabel: formatClockTime(atStop),
        directionId: direction.id
      });
    }
  });

  return output;
}

function dedupeDepartures(departures) {
  const seen = new Set();
  return departures
    .sort((a, b) => a.departureTime - b.departureTime)
    .filter((item) => {
      const key = `${item.routeId}|${item.headsign}|${item.departureIso}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export class DeparturesService {
  constructor(dataService) {
    this.dataService = dataService;
  }

  async getDeparturesForStop(stopId, options = {}) {
    const bundle = await this.dataService.getBundle();
    const config = bundle.config || {};
    const now = options.now || new Date();
    const stop = bundle.stopById?.[stopId];

    if (!stop) {
      return {
        departures: [],
        source: "none",
        liveAvailable: false,
        fallbackUsed: true,
        message: "Stop not found"
      };
    }

    const regionRoutes = stop.region ? bundle.routesByRegion?.[stop.region] || [] : bundle.routes || [];

    const limit = Number(options.limit || config?.fallback?.defaultDepartureLimit || 6);
    const lookAhead = Number(config?.fallback?.departureLookaheadMinutes || 90);

    const liveResult = await this.getLiveDepartures(stopId, now, config);
    const sampleResult = await this.getSampleDepartures(stopId, now, config);
    const scheduledResult = regionRoutes.flatMap((route) => buildScheduledForRouteStop(route, stopId, now, lookAhead));

    const merged = dedupeDepartures([...liveResult.departures, ...sampleResult.departures, ...scheduledResult]).slice(0, limit);

    let source = "none";
    if (liveResult.departures.length) {
      source = "live";
    } else if (sampleResult.departures.length) {
      source = "sample";
    } else if (scheduledResult.length) {
      source = "scheduled";
    }

    return {
      departures: merged,
      source,
      liveAvailable: liveResult.liveAvailable,
      fallbackUsed: source !== "live",
      message: this.getStatusMessage(source, liveResult.liveAvailable, config)
    };
  }

  async getLiveDepartures(stopId, now, config) {
    const liveConfig = config?.liveData;
    if (!liveConfig?.enabled) {
      return {
        liveAvailable: false,
        departures: []
      };
    }

    const payload = await this.dataService.loadJson(liveConfig.departuresPath, { optional: true, bypassCache: true });
    if (!payload) {
      return {
        liveAvailable: false,
        departures: []
      };
    }

    const fresh = isFresh(payload.meta, Number(liveConfig.maxAgeMinutes || 3), now);
    if (!fresh) {
      return {
        liveAvailable: false,
        departures: []
      };
    }

    const stopPayload = payload.stops?.[stopId] || [];
    const departures = normalizeFromPayload(stopPayload, now, "live", stopId).filter((d) => d.departureTime >= addMinutes(now, -1));

    return {
      liveAvailable: true,
      departures
    };
  }

  async getSampleDepartures(stopId, now, config) {
    const samplePath = config?.dataPaths?.departuresSample;
    const payload = await this.dataService.loadJson(samplePath, { optional: true });
    if (!payload) {
      return {
        departures: []
      };
    }

    const stopPayload = payload.stops?.[stopId] || [];
    const departures = normalizeFromPayload(stopPayload, now, "sample", stopId).filter((d) => d.departureTime >= addMinutes(now, -1));

    return { departures };
  }

  pickDepartureForDirectTrip(route, originId, destinationId, departuresAtOrigin = []) {
    const direction = findDirectionForStops(route, originId, destinationId);
    if (!direction) {
      return null;
    }

    const normHeadsign = direction.headsign.toLowerCase();
    return (
      departuresAtOrigin.find((item) => item.routeId === route.id && item.headsign.toLowerCase().includes(normHeadsign)) ||
      departuresAtOrigin.find((item) => item.routeId === route.id) ||
      null
    );
  }

  getStatusMessage(source, liveAvailable, config = {}) {
    if (source === "live") {
      return "Live times active";
    }
    if (source === "sample") {
      return liveAvailable ? "Live feed empty, using sample + schedule" : "Live times unavailable, using sample + schedule";
    }
    if (source === "scheduled") {
      return "Live times unavailable, showing scheduled estimates";
    }
    return config?.fallback?.noDataMessage || "No departure data currently available";
  }
}
