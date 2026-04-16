#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    i += 1;
  }
  return args;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

function inferFormat(filePath, explicit) {
  const chosen = String(explicit || "auto").toLowerCase();
  if (chosen !== "auto") {
    return chosen;
  }
  if (!filePath) {
    return "none";
  }
  return filePath.toLowerCase().endsWith(".json") ? "json" : "protobuf";
}

async function readJson(filePath, options = {}) {
  if (!filePath) {
    return null;
  }
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (options.optional) {
      return null;
    }
    throw error;
  }
}

async function readBuffer(filePath, options = {}) {
  if (!filePath) {
    return null;
  }

  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (options.optional) {
      return null;
    }
    throw error;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function parseCsvLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cols.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cols.push(current);
  return cols;
}

async function readCsvOptional(filePath) {
  if (!filePath) {
    return [];
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    if (lines.length < 2) {
      return [];
    }

    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return row;
    });
  } catch {
    return [];
  }
}

function indexBy(items = [], keyFn) {
  const out = {};
  items.forEach((item) => {
    const key = keyFn(item);
    if (!key) {
      return;
    }
    out[key] = item;
  });
  return out;
}

function buildLocalLookups(stops = [], routes = []) {
  return {
    stopsById: indexBy(stops, (stop) => stop.id),
    stopsByCode: indexBy(stops, (stop) => normalizeText(stop.code)),
    stopsByName: indexBy(stops, (stop) => normalizeText(stop.name)),
    routesById: indexBy(routes, (route) => route.id),
    routesByShort: indexBy(routes, (route) => normalizeText(route.shortName)),
    routesByLong: indexBy(routes, (route) => normalizeText(route.longName))
  };
}

function buildStaticLookups(gtfsStops = [], gtfsRoutes = [], gtfsTrips = []) {
  return {
    gtfsStopsById: indexBy(gtfsStops, (row) => row.stop_id),
    gtfsRoutesById: indexBy(gtfsRoutes, (row) => row.route_id),
    gtfsTripsById: indexBy(gtfsTrips, (row) => row.trip_id)
  };
}

function mapStopId(gtfsStopId, ctx) {
  if (!gtfsStopId) {
    return null;
  }

  const key = String(gtfsStopId);
  if (ctx.mapping?.stops?.[key]) {
    return ctx.mapping.stops[key];
  }

  if (ctx.local.stopsById[key]) {
    return key;
  }

  const staticStop = ctx.staticLookups.gtfsStopsById[key];
  if (staticStop) {
    const byCode = ctx.local.stopsByCode[normalizeText(staticStop.stop_code)];
    if (byCode) {
      return byCode.id;
    }

    const byName = ctx.local.stopsByName[normalizeText(staticStop.stop_name)];
    if (byName) {
      return byName.id;
    }
  }

  return null;
}

function mapRouteId(gtfsRouteId, ctx) {
  if (!gtfsRouteId) {
    return null;
  }

  const key = String(gtfsRouteId);
  if (ctx.mapping?.routes?.[key]) {
    return ctx.mapping.routes[key];
  }

  if (ctx.local.routesById[key]) {
    return key;
  }

  const staticRoute = ctx.staticLookups.gtfsRoutesById[key];
  if (staticRoute) {
    const byShort = ctx.local.routesByShort[normalizeText(staticRoute.route_short_name)];
    if (byShort) {
      return byShort.id;
    }
    const byLong = ctx.local.routesByLong[normalizeText(staticRoute.route_long_name)];
    if (byLong) {
      return byLong.id;
    }
  }

  const byShortFallback = ctx.local.routesByShort[normalizeText(key)];
  if (byShortFallback) {
    return byShortFallback.id;
  }

  return null;
}

function extractTranslatedText(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value.translation) && value.translation.length) {
    return value.translation[0]?.text || "";
  }

  if (Array.isArray(value.translations) && value.translations.length) {
    return value.translations[0]?.text || "";
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  return "";
}

function statusFromTripUpdate(scheduleRelationship, delaySeconds) {
  const rel = String(scheduleRelationship || "").toUpperCase();
  if (rel.includes("CANCELED") || rel.includes("CANCELLED")) {
    return "cancelled";
  }
  if (rel.includes("SKIPPED")) {
    return "skipped";
  }
  if (rel.includes("NO_DATA")) {
    return "no_data";
  }

  if (toNumber(delaySeconds, 0) >= 120) {
    return "minor_delay";
  }

  return "on_time";
}

function levelFromAlert(effect, cause) {
  const eff = String(effect || "").toUpperCase();
  const cse = String(cause || "").toUpperCase();

  if (eff.includes("NO_SERVICE") || eff.includes("SIGNIFICANT_DELAYS") || cse.includes("STRIKE")) {
    return { level: "major", severity: 3 };
  }

  if (eff.includes("DETOUR") || eff.includes("MODIFIED") || eff.includes("REDUCED")) {
    return { level: "minor", severity: 2 };
  }

  return { level: "info", severity: 1 };
}

function isoFromEpoch(epochSeconds) {
  const num = toNumber(epochSeconds, null);
  if (!num) {
    return null;
  }
  const date = new Date(num * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getTripHeadsign(tripId, trip, staticLookups, mapping) {
  if (mapping?.tripHeadsigns?.[tripId]) {
    return mapping.tripHeadsigns[tripId];
  }

  if (trip?.tripHeadsign || trip?.trip_headsign) {
    return trip.tripHeadsign || trip.trip_headsign;
  }

  const staticTrip = staticLookups.gtfsTripsById[tripId];
  return staticTrip?.trip_headsign || "Service";
}

async function decodeFeed(filePath, format, feedType) {
  if (!filePath || format === "none") {
    return null;
  }

  if (format === "json") {
    return readJson(filePath, { optional: true });
  }

  if (format !== "protobuf") {
    throw new Error(`Unsupported ${feedType} format: ${format}`);
  }

  const buffer = await readBuffer(filePath, { optional: true });
  if (!buffer) {
    return null;
  }

  let bindings;
  try {
    const loaded = await import("gtfs-realtime-bindings");
    bindings = loaded.default || loaded;
  } catch {
    throw new Error(
      "gtfs-realtime-bindings is required for protobuf GTFS-RT decoding. Run `npm install` before using protobuf mode."
    );
  }

  const message = bindings.transit_realtime.FeedMessage.decode(buffer);
  return bindings.transit_realtime.FeedMessage.toObject(message, {
    longs: Number,
    enums: String,
    defaults: false
  });
}

function normalizeFeedEntityList(feed) {
  if (!feed) {
    return [];
  }

  if (Array.isArray(feed.entity)) {
    return feed.entity;
  }

  if (Array.isArray(feed.entities)) {
    return feed.entities;
  }

  if (Array.isArray(feed)) {
    return feed;
  }

  return [];
}

function normalizeTripUpdateEntity(entity) {
  return entity?.tripUpdate || entity?.trip_update || null;
}

function normalizeAlertEntity(entity) {
  return entity?.alert || null;
}

function normalizeStopTimeUpdates(tripUpdate) {
  return ensureArray(tripUpdate?.stopTimeUpdate || tripUpdate?.stop_time_update);
}

function normalizeInformedEntities(alert) {
  return ensureArray(alert?.informedEntity || alert?.informed_entity);
}

function normalizeActivePeriods(alert) {
  return ensureArray(alert?.activePeriod || alert?.active_period);
}

function parseTripUpdates(feed, ctx, options = {}) {
  const now = options.now || new Date();
  const nowEpoch = Math.floor(now.getTime() / 1000);
  const maxLookAheadMinutes = Number(options.maxLookAheadMinutes || 240);
  const upperEpoch = nowEpoch + maxLookAheadMinutes * 60;

  const stops = {};
  let totalRows = 0;
  let mappedRows = 0;
  let unmappedStops = 0;
  let unmappedRoutes = 0;

  normalizeFeedEntityList(feed).forEach((entity) => {
    const tripUpdate = normalizeTripUpdateEntity(entity);
    if (!tripUpdate) {
      return;
    }

    const trip = tripUpdate.trip || {};
    const routeId = mapRouteId(trip.routeId || trip.route_id, ctx);

    if (!routeId && (trip.routeId || trip.route_id)) {
      unmappedRoutes += 1;
    }

    const tripId = String(trip.tripId || trip.trip_id || entity?.id || `trip-${totalRows + 1}`);
    const headsign = getTripHeadsign(tripId, trip, ctx.staticLookups, ctx.mapping);
    const tripStatus = statusFromTripUpdate(trip.scheduleRelationship || trip.schedule_relationship, 0);

    normalizeStopTimeUpdates(tripUpdate).forEach((update) => {
      totalRows += 1;

      const stopId = mapStopId(update.stopId || update.stop_id, ctx);
      if (!stopId) {
        unmappedStops += 1;
        return;
      }

      const departure = update.departure || {};
      const arrival = update.arrival || {};

      const epochSeconds =
        toNumber(departure.time, null) ?? toNumber(arrival.time, null) ?? toNumber(update.time, null) ?? null;

      if (!epochSeconds) {
        return;
      }

      if (epochSeconds < nowEpoch - 120 || epochSeconds > upperEpoch) {
        return;
      }

      const delaySeconds =
        toNumber(departure.delay, null) ?? toNumber(arrival.delay, null) ?? toNumber(update.delay, 0) ?? 0;

      const status = statusFromTripUpdate(
        update.scheduleRelationship || update.schedule_relationship || trip.scheduleRelationship,
        delaySeconds
      );

      if (!stops[stopId]) {
        stops[stopId] = [];
      }

      stops[stopId].push({
        tripId,
        routeId,
        headsign: headsign || "Service",
        expectedTime: isoFromEpoch(epochSeconds),
        scheduledTime: null,
        epochSeconds,
        inMinutes: Math.max(0, Math.round((epochSeconds - nowEpoch) / 60)),
        platform: update.stopSequence ? `Stop ${update.stopSequence}` : null,
        status: status || tripStatus || "on_time",
        delayMinutes: Math.round(toNumber(delaySeconds, 0) / 60)
      });

      mappedRows += 1;
    });
  });

  Object.keys(stops).forEach((stopId) => {
    const deduped = new Map();
    stops[stopId]
      .sort((a, b) => (a.epochSeconds || 0) - (b.epochSeconds || 0))
      .forEach((item) => {
        const key = `${item.tripId}|${item.routeId || "?"}|${item.epochSeconds || "?"}`;
        if (!deduped.has(key)) {
          deduped.set(key, item);
        }
      });

    stops[stopId] = Array.from(deduped.values()).slice(0, 20);
  });

  return {
    stops,
    stats: {
      rows: totalRows,
      mappedRows,
      unmappedStops,
      unmappedRoutes,
      mappedStopCount: Object.keys(stops).length
    }
  };
}

function parseAlerts(feed, ctx) {
  const alerts = [];
  let total = 0;
  let mapped = 0;

  normalizeFeedEntityList(feed).forEach((entity) => {
    const alert = normalizeAlertEntity(entity);
    if (!alert) {
      return;
    }

    total += 1;

    const informed = normalizeInformedEntities(alert);

    const routeIds = unique(
      informed
        .map((ref) => mapRouteId(ref.routeId || ref.route_id, ctx))
        .filter(Boolean)
    );

    const stopIds = unique(
      informed
        .map((ref) => mapStopId(ref.stopId || ref.stop_id, ctx))
        .filter(Boolean)
    );

    const interchanges = unique(stopIds.map((stopId) => ctx.local.stopsById[stopId]?.interchangeId).filter(Boolean));

    const regionCandidates = [
      ...routeIds.map((routeId) => ctx.local.routesById[routeId]?.region),
      ...stopIds.map((stopId) => ctx.local.stopsById[stopId]?.region)
    ];
    const regions = unique(regionCandidates.filter(Boolean));

    const periods = normalizeActivePeriods(alert);
    const firstPeriod = periods[0] || {};

    const levelMeta = levelFromAlert(alert.effect, alert.cause);
    const title = extractTranslatedText(alert.headerText || alert.header_text) || "Service notice";
    const description = extractTranslatedText(alert.descriptionText || alert.description_text) || "";

    alerts.push({
      id: String(entity?.id || `gtfsrt-alert-${total}`),
      region: regions.length === 1 ? regions[0] : null,
      level: levelMeta.level,
      severity: levelMeta.severity,
      title,
      description,
      routes: routeIds,
      stops: stopIds,
      interchanges,
      effectiveFrom: isoFromEpoch(firstPeriod.start),
      effectiveTo: isoFromEpoch(firstPeriod.end),
      status: "active",
      impact: String(alert.effect || "Service notice").replaceAll("_", " ")
    });

    mapped += 1;
  });

  return {
    alerts,
    stats: {
      rows: total,
      mappedRows: mapped
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const outDir = args.out || "./data";
  const tripUpdatesPath = args["trip-updates"] || "./raw/live/trip-updates.pb";
  const alertsPath = args["service-alerts"] || "./raw/live/service-alerts.pb";

  const tripUpdatesFormat = inferFormat(tripUpdatesPath, args["trip-updates-format"]);
  const alertsFormat = inferFormat(alertsPath, args["service-alerts-format"]);

  const stopsPath = args.stops || "./data/stops.json";
  const routesPath = args.routes || "./data/routes.json";
  const mappingPath = args.mapping || "./data/gtfs-id-map.json";

  const gtfsStopsPath = args["gtfs-stops"] || "./raw/live/gtfs/stops.txt";
  const gtfsRoutesPath = args["gtfs-routes"] || "./raw/live/gtfs/routes.txt";
  const gtfsTripsPath = args["gtfs-trips"] || "./raw/live/gtfs/trips.txt";

  const maxLookAheadMinutes = Number(args["max-lookahead-minutes"] || 240);

  const [stopsJson, routesJson, mapping, gtfsStops, gtfsRoutes, gtfsTrips, tripFeed, alertFeed] = await Promise.all([
    readJson(stopsPath),
    readJson(routesPath),
    readJson(mappingPath, { optional: true }),
    readCsvOptional(gtfsStopsPath),
    readCsvOptional(gtfsRoutesPath),
    readCsvOptional(gtfsTripsPath),
    decodeFeed(tripUpdatesPath, tripUpdatesFormat, "trip updates"),
    decodeFeed(alertsPath, alertsFormat, "service alerts")
  ]);

  const local = buildLocalLookups(stopsJson?.stops || [], routesJson?.routes || []);
  const staticLookups = buildStaticLookups(gtfsStops, gtfsRoutes, gtfsTrips);

  const context = {
    local,
    staticLookups,
    mapping: mapping || { stops: {}, routes: {}, tripHeadsigns: {} }
  };

  const departuresOut = parseTripUpdates(tripFeed, context, { maxLookAheadMinutes });
  const alertsOut = parseAlerts(alertFeed, context);

  await ensureDir(outDir);

  const generatedAt = new Date().toISOString();

  const departuresPayload = {
    meta: {
      generatedAt,
      source: "build-live-from-gtfsrt.mjs",
      feedFormat: tripUpdatesFormat,
      sourcePath: tripUpdatesPath,
      maxLookAheadMinutes,
      stats: departuresOut.stats
    },
    stops: departuresOut.stops
  };

  const alertsPayload = {
    meta: {
      generatedAt,
      source: "build-live-from-gtfsrt.mjs",
      feedFormat: alertsFormat,
      sourcePath: alertsPath,
      stats: alertsOut.stats
    },
    alerts: alertsOut.alerts.slice(0, 120)
  };

  await Promise.all([
    fs.writeFile(path.join(outDir, "departures.live.json"), JSON.stringify(departuresPayload, null, 2)),
    fs.writeFile(path.join(outDir, "alerts.live.json"), JSON.stringify(alertsPayload, null, 2))
  ]);

  const mappingNotes = [
    mapping ? `mapping=${mappingPath}` : "mapping=none",
    gtfsStops.length ? `gtfsStops=${gtfsStops.length}` : "gtfsStops=none",
    gtfsRoutes.length ? `gtfsRoutes=${gtfsRoutes.length}` : "gtfsRoutes=none",
    gtfsTrips.length ? `gtfsTrips=${gtfsTrips.length}` : "gtfsTrips=none"
  ];

  console.log(
    `Built live payloads from GTFS-RT: stops=${Object.keys(departuresOut.stops).length}, alerts=${alertsPayload.alerts.length} (${mappingNotes.join(", ")})`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
