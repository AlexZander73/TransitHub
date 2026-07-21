#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    args[key] = value;
    if (value !== "true") {
      index += 1;
    }
  }
  return args;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

async function readCsv(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.replace(/\r/g, "").split("\n").filter(Boolean);
  const headers = parseCsvLine(lines.shift() || "");
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(station|interchange|stop|platform|light rail|tram|busway)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function haversineMetres(a, b) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function perpendicularDistance(point, start, end) {
  const dx = end[1] - start[1];
  const dy = end[0] - start[0];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[1] - start[1], point[0] - start[0]);
  }
  const t = Math.max(0, Math.min(1, ((point[1] - start[1]) * dx + (point[0] - start[0]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[1] - (start[1] + t * dx), point[0] - (start[0] + t * dy));
}

function simplify(points, tolerance = 0.00008) {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let maxIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= tolerance) {
    return [points[0], points[points.length - 1]];
  }

  const first = simplify(points.slice(0, maxIndex + 1), tolerance);
  const second = simplify(points.slice(maxIndex), tolerance);
  return [...first.slice(0, -1), ...second];
}

function pickStaticRoute(localRoute, staticRoutes, claimedRouteIds) {
  const localShort = normalize(localRoute.shortName);
  const modeType = localRoute.mode === "tram" ? "0" : localRoute.mode === "train" ? "2" : "3";
  const candidates = staticRoutes.filter((route) => {
    if (claimedRouteIds.has(route.route_id) || String(route.route_type) !== modeType) {
      return false;
    }
    if (localRoute.mode === "tram") {
      return normalize(route.route_long_name).includes("light rail") || normalize(route.route_short_name).includes("gcl");
    }
    return normalize(route.route_short_name) === localShort;
  });
  return candidates[0] || null;
}

function nameSimilarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 3;
  }
  if (left.includes(right) || right.includes(left)) {
    return 2;
  }
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const overlap = [...leftTokens].filter((token) => token.length > 2 && rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size, 1);
}

async function collectStopUsage(stopTimesPath, tripToLocalRoute) {
  const usage = new Map();
  const stream = createReadStream(stopTimesPath, { encoding: "utf8" });
  const input = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;

  for await (const line of input) {
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    const values = parseCsvLine(line);
    const tripId = values[headers.indexOf("trip_id")];
    const localRouteId = tripToLocalRoute.get(tripId);
    if (!localRouteId) {
      continue;
    }
    const stopId = values[headers.indexOf("stop_id")];
    if (!usage.has(stopId)) {
      usage.set(stopId, new Set());
    }
    usage.get(stopId).add(localRouteId);
  }

  return usage;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gtfsDir = args.gtfs || "./raw/gtfs";
  const dataDir = args.data || "./data";
  const stopsPath = path.join(dataDir, "stops.json");
  const routesPath = path.join(dataDir, "routes.json");
  const maxDistanceMetres = Number(args["max-stop-distance"] || 650);

  const [localStopsPayload, localRoutesPayload, staticRoutes, staticTrips, staticStops] = await Promise.all([
    fs.readFile(stopsPath, "utf8").then(JSON.parse),
    fs.readFile(routesPath, "utf8").then(JSON.parse),
    readCsv(path.join(gtfsDir, "routes.txt")),
    readCsv(path.join(gtfsDir, "trips.txt")),
    readCsv(path.join(gtfsDir, "stops.txt"))
  ]);

  const localStops = localStopsPayload.stops || [];
  const localRoutes = localRoutesPayload.routes || [];
  const localStopById = new Map(localStops.map((stop) => [stop.id, stop]));
  const claimedRouteIds = new Set();
  const providerRouteToLocal = {};
  const localToProviderRoute = new Map();

  for (const localRoute of localRoutes) {
    const staticRoute = pickStaticRoute(localRoute, staticRoutes, claimedRouteIds);
    if (!staticRoute) {
      continue;
    }
    claimedRouteIds.add(staticRoute.route_id);
    providerRouteToLocal[staticRoute.route_id] = localRoute.id;
    localToProviderRoute.set(localRoute.id, staticRoute.route_id);
  }

  const targetRouteIds = new Set(Object.keys(providerRouteToLocal));
  const targetTrips = staticTrips.filter((trip) => targetRouteIds.has(trip.route_id) && trip.shape_id);
  const targetShapeIds = new Set(targetTrips.map((trip) => trip.shape_id));
  const tripToLocalRoute = new Map(
    targetTrips.map((trip) => [trip.trip_id, providerRouteToLocal[trip.route_id]])
  );

  const shapes = new Map();
  const shapeRows = await readCsv(path.join(gtfsDir, "shapes.txt"));
  for (const row of shapeRows) {
    if (!targetShapeIds.has(row.shape_id)) {
      continue;
    }
    if (!shapes.has(row.shape_id)) {
      shapes.set(row.shape_id, []);
    }
    shapes.get(row.shape_id).push({
      sequence: toNumber(row.shape_pt_sequence),
      point: [toNumber(row.shape_pt_lat), toNumber(row.shape_pt_lon)]
    });
  }
  shapes.forEach((rows) => rows.sort((a, b) => a.sequence - b.sequence));

  const shapeOutput = {};
  for (const localRoute of localRoutes) {
    const providerRouteId = localToProviderRoute.get(localRoute.id);
    if (!providerRouteId) {
      continue;
    }
    const trips = targetTrips.filter((trip) => trip.route_id === providerRouteId);
    const byDirection = new Map();
    for (const trip of trips) {
      const points = shapes.get(trip.shape_id) || [];
      const directionId = String(trip.direction_id || "0");
      const current = byDirection.get(directionId);
      if (!current || points.length > current.points.length) {
        byDirection.set(directionId, {
          directionId,
          headsign: trip.trip_headsign || "",
          shapeId: trip.shape_id,
          points
        });
      }
    }
    const routeShapes = [...byDirection.values()]
      .map((shape) => ({
        directionId: shape.directionId,
        headsign: shape.headsign,
        sourceShapeId: shape.shapeId,
        points: simplify(shape.points.map((row) => row.point))
      }))
      .filter((shape) => shape.points.length > 1);
    if (routeShapes.length) {
      shapeOutput[localRoute.id] = {
        sourceRouteId: providerRouteId,
        shapes: routeShapes
      };
    }
  }

  const stopUsage = await collectStopUsage(path.join(gtfsDir, "stop_times.txt"), tripToLocalRoute);
  const providerStopToLocal = {};
  const matchesByLocalStop = new Map();

  for (const staticStop of staticStops) {
    const localRouteIds = stopUsage.get(staticStop.stop_id);
    if (!localRouteIds?.size) {
      continue;
    }
    const candidates = localStops.filter((stop) =>
      (stop.routes || []).some((routeId) => localRouteIds.has(routeId))
    );
    const point = { lat: toNumber(staticStop.stop_lat), lon: toNumber(staticStop.stop_lon) };
    const ranked = candidates
      .map((stop) => ({
        stop,
        distance: haversineMetres(point, stop),
        nameScore: nameSimilarity(staticStop.stop_name, stop.name)
      }))
      .filter((candidate) => candidate.distance <= maxDistanceMetres || (candidate.nameScore >= 2 && candidate.distance <= 1400))
      .sort((a, b) => b.nameScore - a.nameScore || a.distance - b.distance);
    const best = ranked[0];
    if (!best) {
      continue;
    }
    providerStopToLocal[staticStop.stop_id] = best.stop.id;
    if (!matchesByLocalStop.has(best.stop.id)) {
      matchesByLocalStop.set(best.stop.id, []);
    }
    matchesByLocalStop.get(best.stop.id).push({
      id: staticStop.stop_id,
      name: staticStop.stop_name,
      lat: point.lat,
      lon: point.lon,
      distance: best.distance,
      nameScore: best.nameScore
    });
  }

  let correctedStopCount = 0;
  for (const [localStopId, matches] of matchesByLocalStop) {
    const localStop = localStopById.get(localStopId);
    if (!localStop) {
      continue;
    }
    matches.sort((a, b) => b.nameScore - a.nameScore || a.distance - b.distance);
    const bestScore = matches[0].nameScore;
    const coordinateMatches = matches.filter((match) => match.nameScore === bestScore && match.distance <= maxDistanceMetres);
    const chosen = coordinateMatches.length ? coordinateMatches : [matches[0]];
    localStop.lat = Number((chosen.reduce((sum, match) => sum + match.lat, 0) / chosen.length).toFixed(6));
    localStop.lon = Number((chosen.reduce((sum, match) => sum + match.lon, 0) / chosen.length).toFixed(6));
    localStop.gtfsStopIds = matches.map((match) => match.id).sort();
    correctedStopCount += 1;
  }

  const generatedAt = new Date().toISOString();
  const routeShapesPayload = {
    meta: {
      generatedAt,
      source: "Translink SEQ GTFS shapes.txt",
      license: "CC BY 4.0",
      routeCount: Object.keys(shapeOutput).length
    },
    routes: shapeOutput
  };
  const mappingPayload = {
    meta: {
      generatedAt,
      source: "Translink SEQ GTFS",
      license: "CC BY 4.0",
      notes: "Provider GTFS IDs mapped to CoastPulse model IDs."
    },
    routes: providerRouteToLocal,
    stops: providerStopToLocal,
    tripHeadsigns: Object.fromEntries(
      targetTrips.filter((trip) => trip.trip_headsign).map((trip) => [trip.trip_id, trip.trip_headsign])
    )
  };

  localStopsPayload.meta = {
    ...(localStopsPayload.meta || {}),
    coordinatesUpdatedAt: generatedAt,
    coordinateSource: "Translink SEQ GTFS stops.txt"
  };

  await fs.mkdir(dataDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(dataDir, "route-shapes.json"), JSON.stringify(routeShapesPayload, null, 2)),
    fs.writeFile(path.join(dataDir, "gtfs-id-map.json"), JSON.stringify(mappingPayload, null, 2)),
    fs.writeFile(stopsPath, JSON.stringify(localStopsPayload, null, 2))
  ]);

  console.log(
    `Built Translink map data: routes=${Object.keys(shapeOutput).length}, mappedStops=${Object.keys(providerStopToLocal).length}, correctedStops=${correctedStopCount}`
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
