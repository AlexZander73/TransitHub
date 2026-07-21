#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const OFFICIAL_SEQ_ROOT = "https://gtfsrt.api.translink.com.au/api/realtime/SEQ";

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

function isHttpSource(source) {
  return /^https?:\/\//i.test(String(source || ""));
}

function parseHeaders(headerPairs) {
  const headers = {};
  (headerPairs || []).forEach((pair) => {
    if (!pair || typeof pair !== "string") {
      return;
    }
    const index = pair.indexOf(":");
    if (index <= 0) {
      return;
    }
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key || !value) {
      return;
    }
    headers[key] = value;
  });
  return headers;
}

function inferFormat(format, fallback = "protobuf") {
  const value = String(format || fallback).toLowerCase();
  if (["protobuf", "json", "text"].includes(value)) {
    return value;
  }
  return fallback;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readSource(source, format, options) {
  if (!source) {
    return null;
  }

  if (isHttpSource(source)) {
    return fetchSource(source, format, options);
  }

  return readLocalSource(source, format);
}

async function fetchSource(url, format, options) {
  const timeoutMs = Number(options.timeoutMs || 20000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: options.headers || {},
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (format === "protobuf") {
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        bytes: buffer.length,
        buffer
      };
    }

    const text = await response.text();
    if (format === "json") {
      JSON.parse(text);
    }

    return {
      bytes: Buffer.byteLength(text),
      text
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readLocalSource(filePath, format) {
  if (format === "protobuf") {
    const buffer = await fs.readFile(filePath);
    return {
      bytes: buffer.length,
      buffer
    };
  }

  const text = await fs.readFile(filePath, "utf8");
  if (format === "json") {
    JSON.parse(text);
  }

  return {
    bytes: Buffer.byteLength(text),
    text
  };
}

async function writePayload(outputPath, payload, format) {
  await ensureDir(path.dirname(outputPath));

  if (!payload) {
    return;
  }

  if (format === "protobuf") {
    await fs.writeFile(outputPath, payload.buffer);
    return;
  }

  await fs.writeFile(outputPath, payload.text);
}

function extForFormat(format, fallback) {
  if (format === "protobuf") {
    return "pb";
  }
  if (format === "json") {
    return "json";
  }
  if (format === "text") {
    return fallback || "txt";
  }
  return fallback || "dat";
}

function makeSummaryRow(source, format, outputPath) {
  return {
    source: source || null,
    format,
    outputPath,
    fetched: false,
    bytes: 0,
    error: null
  };
}

async function collectSource({ source, format, outputPath, timeoutMs, headers }) {
  const summary = makeSummaryRow(source, format, outputPath);

  if (!source) {
    return summary;
  }

  try {
    const payload = await readSource(source, format, { timeoutMs, headers });
    await writePayload(outputPath, payload, format);
    summary.fetched = true;
    summary.bytes = payload?.bytes || 0;
    return summary;
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    return summary;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const outRawDir = args["out-raw-dir"] || "./raw/live";
  const timeoutMs = Number(args["timeout-ms"] || process.env.LIVE_FETCH_TIMEOUT_MS || 20000);

  const headers = parseHeaders([
    process.env.LIVE_HEADER_1,
    process.env.LIVE_HEADER_2,
    process.env.LIVE_HEADER_3,
    process.env.LIVE_HEADER_4
  ]);

  const tripUpdatesSource =
    args["trip-updates-source"] || process.env.GTFSRT_TRIP_UPDATES_SOURCE || `${OFFICIAL_SEQ_ROOT}/TripUpdates`;
  const vehiclePositionsSource =
    args["vehicle-positions-source"] ||
    process.env.GTFSRT_VEHICLE_POSITIONS_SOURCE ||
    `${OFFICIAL_SEQ_ROOT}/VehiclePositions`;
  const serviceAlertsSource =
    args["service-alerts-source"] || process.env.GTFSRT_SERVICE_ALERTS_SOURCE || `${OFFICIAL_SEQ_ROOT}/alerts`;
  const tramTripUpdatesSource =
    args["tram-trip-updates-source"] ||
    process.env.GTFSRT_TRAM_TRIP_UPDATES_SOURCE ||
    `${OFFICIAL_SEQ_ROOT}/TripUpdates/Tram`;
  const tramVehiclePositionsSource =
    args["tram-vehicle-positions-source"] ||
    process.env.GTFSRT_TRAM_VEHICLE_POSITIONS_SOURCE ||
    `${OFFICIAL_SEQ_ROOT}/VehiclePositions/Tram`;

  const tripUpdatesFormat = inferFormat(args["trip-updates-format"] || process.env.GTFSRT_TRIP_UPDATES_FORMAT, "protobuf");
  const serviceAlertsFormat = inferFormat(
    args["service-alerts-format"] || process.env.GTFSRT_SERVICE_ALERTS_FORMAT,
    "protobuf"
  );
  const vehiclePositionsFormat = inferFormat(
    args["vehicle-positions-format"] || process.env.GTFSRT_VEHICLE_POSITIONS_FORMAT,
    "protobuf"
  );
  const tramTripUpdatesFormat = inferFormat(
    args["tram-trip-updates-format"] || process.env.GTFSRT_TRAM_TRIP_UPDATES_FORMAT,
    "protobuf"
  );
  const tramVehiclePositionsFormat = inferFormat(
    args["tram-vehicle-positions-format"] || process.env.GTFSRT_TRAM_VEHICLE_POSITIONS_FORMAT,
    "protobuf"
  );

  const gtfsStopsSource = args["gtfs-stops-source"] || process.env.GTFS_STATIC_STOPS_SOURCE || "";
  const gtfsRoutesSource = args["gtfs-routes-source"] || process.env.GTFS_STATIC_ROUTES_SOURCE || "";
  const gtfsTripsSource = args["gtfs-trips-source"] || process.env.GTFS_STATIC_TRIPS_SOURCE || "";
  const mappingSource = args["mapping-source"] || process.env.GTFS_ID_MAP_SOURCE || "";

  if (!tripUpdatesSource && !vehiclePositionsSource && !serviceAlertsSource) {
    throw new Error(
      "No GTFS-RT sources configured. Provide trip updates, vehicle positions, or service alerts."
    );
  }

  const tripUpdatesPath = path.join(outRawDir, `trip-updates.${extForFormat(tripUpdatesFormat, "pb")}`);
  const vehiclePositionsPath = path.join(
    outRawDir,
    `vehicle-positions.${extForFormat(vehiclePositionsFormat, "pb")}`
  );
  const serviceAlertsPath = path.join(outRawDir, `service-alerts.${extForFormat(serviceAlertsFormat, "pb")}`);
  const tramTripUpdatesPath = path.join(
    outRawDir,
    `tram-trip-updates.${extForFormat(tramTripUpdatesFormat, "pb")}`
  );
  const tramVehiclePositionsPath = path.join(
    outRawDir,
    `tram-vehicle-positions.${extForFormat(tramVehiclePositionsFormat, "pb")}`
  );

  const [
    tripSummary,
    vehicleSummary,
    alertSummary,
    tramTripSummary,
    tramVehicleSummary,
    stopsSummary,
    routesSummary,
    tripsSummary,
    mappingSummary
  ] = await Promise.all([
    collectSource({
      source: tripUpdatesSource,
      format: tripUpdatesFormat,
      outputPath: tripUpdatesPath,
      timeoutMs,
      headers
    }),
    collectSource({
      source: vehiclePositionsSource,
      format: vehiclePositionsFormat,
      outputPath: vehiclePositionsPath,
      timeoutMs,
      headers
    }),
    collectSource({
      source: serviceAlertsSource,
      format: serviceAlertsFormat,
      outputPath: serviceAlertsPath,
      timeoutMs,
      headers
    }),
    collectSource({
      source: tramTripUpdatesSource,
      format: tramTripUpdatesFormat,
      outputPath: tramTripUpdatesPath,
      timeoutMs,
      headers
    }),
    collectSource({
      source: tramVehiclePositionsSource,
      format: tramVehiclePositionsFormat,
      outputPath: tramVehiclePositionsPath,
      timeoutMs,
      headers
    }),
    collectSource({
      source: gtfsStopsSource,
      format: "text",
      outputPath: path.join(outRawDir, "gtfs", "stops.txt"),
      timeoutMs,
      headers
    }),
    collectSource({
      source: gtfsRoutesSource,
      format: "text",
      outputPath: path.join(outRawDir, "gtfs", "routes.txt"),
      timeoutMs,
      headers
    }),
    collectSource({
      source: gtfsTripsSource,
      format: "text",
      outputPath: path.join(outRawDir, "gtfs", "trips.txt"),
      timeoutMs,
      headers
    }),
    collectSource({
      source: mappingSource,
      format: "json",
      outputPath: path.join(outRawDir, "gtfs-id-map.json"),
      timeoutMs,
      headers
    })
  ]);

  const summary = {
    generatedAt: new Date().toISOString(),
    outRawDir,
    tripUpdates: tripSummary,
    vehiclePositions: vehicleSummary,
    serviceAlerts: alertSummary,
    tramTripUpdates: tramTripSummary,
    tramVehiclePositions: tramVehicleSummary,
    gtfsStatic: {
      stops: stopsSummary,
      routes: routesSummary,
      trips: tripsSummary
    },
    mapping: mappingSummary
  };

  await ensureDir(outRawDir);
  await fs.writeFile(path.join(outRawDir, "summary.gtfsrt.json"), JSON.stringify(summary, null, 2));

  const failures = [
    tripSummary.error,
    vehicleSummary.error,
    alertSummary.error,
    tramTripSummary.error,
    tramVehicleSummary.error,
    stopsSummary.error,
    routesSummary.error,
    tripsSummary.error,
    mappingSummary.error
  ].filter(Boolean);

  if (failures.length) {
    throw new Error(`One or more GTFS-RT sources failed: ${failures.join(" | ")}`);
  }

  console.log(
    `GTFS-RT fetch complete. trips=${tripSummary.fetched ? "ok" : "skip"}, vehicles=${
      vehicleSummary.fetched ? "ok" : "skip"
    }, tramTrips=${tramTripSummary.fetched ? "ok" : "skip"}, tramVehicles=${
      tramVehicleSummary.fetched ? "ok" : "skip"
    }, alerts=${alertSummary.fetched ? "ok" : "skip"}`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
