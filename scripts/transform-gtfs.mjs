#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current.startsWith("--")) {
      const key = current.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
      args[key] = value;
      if (value !== "true") {
        i += 1;
      }
    }
  }
  return args;
}

function parseCsvLine(line) {
  const out = [];
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
      out.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current);
  return out;
}

async function readCsv(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) {
    return [];
  }
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toMode(routeType) {
  if (routeType === "0" || routeType === 0) {
    return "tram";
  }
  if (routeType === "2" || routeType === 2) {
    return "train";
  }
  return "bus";
}

function modeFallbackMinutes(mode) {
  if (mode === "tram") {
    return 3;
  }
  if (mode === "train") {
    return 4;
  }
  return 5;
}

function modeSpeedKmh(mode) {
  if (mode === "tram") {
    return 27;
  }
  if (mode === "train") {
    return 45;
  }
  return 24;
}

function haversineKm(a, b) {
  if (!a || !b) {
    return 0;
  }

  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const lat1 = toRad(toNumber(a.stop_lat));
  const lon1 = toRad(toNumber(a.stop_lon));
  const lat2 = toRad(toNumber(b.stop_lat));
  const lon2 = toRad(toNumber(b.stop_lon));

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizeMapPoint(lat, lon, bounds) {
  const xMin = 110;
  const xMax = 930;
  const yMin = 80;
  const yMax = 1520;

  const lonRatio = (lon - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1);
  const latRatio = (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1);

  return {
    x: Math.round(xMin + lonRatio * (xMax - xMin)),
    y: Math.round(yMax - latRatio * (yMax - yMin))
  };
}

function pickRepresentativeTrips(trips, stopTimesByTrip) {
  const byRoute = new Map();

  trips.forEach((trip) => {
    const tripStopTimes = stopTimesByTrip.get(trip.trip_id) || [];
    const current = byRoute.get(trip.route_id);

    if (!current || tripStopTimes.length > current.stopTimes.length) {
      byRoute.set(trip.route_id, {
        trip,
        stopTimes: tripStopTimes
      });
    }
  });

  return byRoute;
}

function buildSegmentMinutes(stopTimes, stopById, mode) {
  const out = [];
  const defaultMinutes = modeFallbackMinutes(mode);
  const defaultSpeedKmh = modeSpeedKmh(mode);

  for (let i = 0; i < stopTimes.length - 1; i += 1) {
    const current = stopTimes[i];
    const next = stopTimes[i + 1];

    const departure = current.departure_time || current.arrival_time;
    const arrival = next.arrival_time || next.departure_time;

    if (departure && arrival) {
      const depMinutes = hhmmssToMinutes(departure);
      const arrMinutes = hhmmssToMinutes(arrival);
      const diff = arrMinutes - depMinutes;
      if (diff > 0 && diff < 120) {
        out.push(diff);
        continue;
      }
    }

    const shapeDistanceCurrent = toNumber(current.shape_dist_traveled, NaN);
    const shapeDistanceNext = toNumber(next.shape_dist_traveled, NaN);
    const shapeDistanceDeltaKm =
      Number.isFinite(shapeDistanceCurrent) && Number.isFinite(shapeDistanceNext)
        ? Math.max(0, shapeDistanceNext - shapeDistanceCurrent)
        : NaN;

    let normalizedShapeKm = shapeDistanceDeltaKm;
    if (Number.isFinite(normalizedShapeKm) && normalizedShapeKm > 100) {
      // Some feeds publish meters in shape_dist_traveled; normalize heuristically.
      normalizedShapeKm = normalizedShapeKm / 1000;
    }

    if (Number.isFinite(normalizedShapeKm) && normalizedShapeKm > 0) {
      const estimated = Math.max(1, Math.round((normalizedShapeKm / defaultSpeedKmh) * 60));
      out.push(estimated);
      continue;
    }

    const currentStop = stopById.get(current.stop_id);
    const nextStop = stopById.get(next.stop_id);
    const geoKm = haversineKm(currentStop, nextStop);

    if (geoKm > 0) {
      const estimated = Math.max(1, Math.round((geoKm / defaultSpeedKmh) * 60));
      out.push(estimated);
      continue;
    }

    out.push(defaultMinutes);
  }

  return out;
}

function hhmmssToMinutes(value) {
  const [h, m, s] = value.split(":").map((part) => Number(part));
  return h * 60 + m + Math.round((s || 0) / 60);
}

function distinct(values) {
  return [...new Set(values)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = args.input || "./raw/gtfs";
  const outputDir = args.output || "./data";

  const requiredFiles = ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"];
  for (const fileName of requiredFiles) {
    const target = path.join(inputDir, fileName);
    try {
      await fs.access(target);
    } catch {
      throw new Error(`Missing required GTFS file: ${target}`);
    }
  }

  const [stopsRaw, routesRaw, tripsRaw, stopTimesRaw] = await Promise.all([
    readCsv(path.join(inputDir, "stops.txt")),
    readCsv(path.join(inputDir, "routes.txt")),
    readCsv(path.join(inputDir, "trips.txt")),
    readCsv(path.join(inputDir, "stop_times.txt"))
  ]);

  const stopById = new Map(stopsRaw.map((stop) => [stop.stop_id, stop]));

  const bounds = {
    minLat: Math.min(...stopsRaw.map((row) => toNumber(row.stop_lat, -90))),
    maxLat: Math.max(...stopsRaw.map((row) => toNumber(row.stop_lat, 90))),
    minLon: Math.min(...stopsRaw.map((row) => toNumber(row.stop_lon, -180))),
    maxLon: Math.max(...stopsRaw.map((row) => toNumber(row.stop_lon, 180)))
  };

  const stopTimesByTrip = new Map();
  stopTimesRaw.forEach((row) => {
    const list = stopTimesByTrip.get(row.trip_id) || [];
    list.push(row);
    stopTimesByTrip.set(row.trip_id, list);
  });
  stopTimesByTrip.forEach((list) => {
    list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  });

  const representativeTrips = pickRepresentativeTrips(tripsRaw, stopTimesByTrip);

  const routeIdsInUse = distinct(tripsRaw.map((trip) => trip.route_id));
  const routesFiltered = routesRaw.filter((row) => routeIdsInUse.includes(row.route_id));

  const stopUsage = new Map();
  const routesOut = [];
  const linesOut = [];

  routesFiltered.forEach((routeRow) => {
    const picked = representativeTrips.get(routeRow.route_id);
    if (!picked || picked.stopTimes.length < 2) {
      return;
    }

    const mode = toMode(routeRow.route_type);
    const stopSequence = picked.stopTimes.map((row) => row.stop_id);
    const segmentMinutes = buildSegmentMinutes(picked.stopTimes, stopById, mode);

    stopSequence.forEach((stopId) => {
      const list = stopUsage.get(stopId) || [];
      list.push(routeRow.route_id);
      stopUsage.set(stopId, list);
    });

    const shortName = routeRow.route_short_name || routeRow.route_id;
    const longName = routeRow.route_long_name || `Route ${shortName}`;
    const color = routeRow.route_color ? `#${routeRow.route_color}` : mode === "tram" ? "#00b39f" : "#1477ff";

    const firstStopId = stopSequence[0];
    const lastStopId = stopSequence[stopSequence.length - 1];

    routesOut.push({
      id: routeRow.route_id,
      region: "gold-coast",
      lineId: `line-${routeRow.route_id}`,
      shortName,
      longName,
      mode,
      operator: "Imported GTFS",
      color,
      textColor: "#ffffff",
      stopSequence,
      segmentMinutes,
      directions: [
        {
          id: "forward",
          headsign: picked.trip.trip_headsign || lastStopId,
          originStopId: firstStopId,
          destinationStopId: lastStopId,
          service: {
            weekday: { first: "05:00", last: "23:00", frequencyMins: 15 },
            weekend: { first: "05:30", last: "23:00", frequencyMins: 20 }
          }
        },
        {
          id: "reverse",
          headsign: firstStopId,
          originStopId: lastStopId,
          destinationStopId: firstStopId,
          service: {
            weekday: { first: "05:00", last: "23:00", frequencyMins: 15 },
            weekend: { first: "05:30", last: "23:00", frequencyMins: 20 }
          }
        }
      ],
      notes: "Generated from GTFS using transform-gtfs.mjs"
    });
  });

  const stopsOut = stopsRaw.map((row) => {
    const lat = toNumber(row.stop_lat);
    const lon = toNumber(row.stop_lon);
    const modes = distinct((stopUsage.get(row.stop_id) || []).map((routeId) => routesOut.find((route) => route.id === routeId)?.mode).filter(Boolean));

    return {
      id: row.stop_id,
      region: "gold-coast",
      name: row.stop_name || row.stop_id,
      code: row.stop_code || row.stop_id,
      modes: modes.length ? modes : ["bus"],
      lat,
      lon,
      map: normalizeMapPoint(lat, lon, bounds),
      routes: distinct(stopUsage.get(row.stop_id) || []),
      importance: modes.includes("tram") || modes.length > 1 ? "major" : "local"
    };
  });

  routesOut.forEach((route) => {
    const pathPoints = route.stopSequence
      .map((stopId) => stopsOut.find((stop) => stop.id === stopId))
      .filter(Boolean)
      .map((stop) => ({ x: stop.map.x, y: stop.map.y }));

    linesOut.push({
      id: route.lineId,
      region: "gold-coast",
      name: `${route.shortName} ${route.longName}`,
      mode: route.mode,
      color: route.color,
      textColor: route.textColor,
      routeIds: [route.id],
      path: pathPoints
    });
  });

  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "stops.json"),
      JSON.stringify(
        {
          meta: {
            dataset: "gtfs-import",
            generatedAt: new Date().toISOString(),
            version: "0.1.0",
            notes: "Generated from GTFS by scripts/transform-gtfs.mjs"
          },
          stops: stopsOut
        },
        null,
        2
      )
    ),
    fs.writeFile(
      path.join(outputDir, "routes.json"),
      JSON.stringify(
        {
          meta: {
            dataset: "gtfs-import",
            generatedAt: new Date().toISOString(),
            version: "0.1.0"
          },
          routes: routesOut
        },
        null,
        2
      )
    ),
    fs.writeFile(
      path.join(outputDir, "lines.json"),
      JSON.stringify(
        {
          meta: {
            dataset: "gtfs-import",
            generatedAt: new Date().toISOString(),
            version: "0.1.0"
          },
          lines: linesOut,
          regions: [
            {
              id: "gold-coast",
              label: "Gold Coast",
              default: true
            }
          ]
        },
        null,
        2
      )
    )
  ]);

  console.log(`GTFS transformation complete. Wrote ${stopsOut.length} stops, ${routesOut.length} routes.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
