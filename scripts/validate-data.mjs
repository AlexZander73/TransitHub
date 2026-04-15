#!/usr/bin/env node

import { promises as fs } from "node:fs";

const REQUIRED_FILES = [
  "data/config.json",
  "data/stops.json",
  "data/routes.json",
  "data/lines.json",
  "data/departures.sample.json",
  "data/alerts.sample.json",
  "data/direct-travel.sample.json"
];

const OPTIONAL_LIVE_FILES = ["data/departures.live.json", "data/alerts.live.json"];

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const missing = [];
  for (const file of REQUIRED_FILES) {
    if (!(await fileExists(file))) {
      missing.push(file);
    }
  }

  if (missing.length) {
    throw new Error(`Missing required data files:\n${missing.join("\n")}`);
  }

  const [stopsJson, routesJson, linesJson, directJson] = await Promise.all([
    readJson("data/stops.json"),
    readJson("data/routes.json"),
    readJson("data/lines.json"),
    readJson("data/direct-travel.sample.json")
  ]);

  const stops = stopsJson.stops || [];
  const routes = routesJson.routes || [];
  const lines = linesJson.lines || [];
  const edges = directJson.edges || [];

  const stopIds = new Set(stops.map((stop) => stop.id));
  const routeIds = new Set(routes.map((route) => route.id));

  const issues = [];

  routes.forEach((route) => {
    if (!Array.isArray(route.stopSequence) || route.stopSequence.length < 2) {
      issues.push(`Route ${route.id} has invalid stopSequence`);
    }
    route.stopSequence.forEach((stopId) => {
      if (!stopIds.has(stopId)) {
        issues.push(`Route ${route.id} references missing stop ${stopId}`);
      }
    });

    if ((route.segmentMinutes || []).length !== route.stopSequence.length - 1) {
      issues.push(`Route ${route.id} segmentMinutes count should equal stopSequence length - 1`);
    }
  });

  lines.forEach((line) => {
    (line.routeIds || []).forEach((routeId) => {
      if (!routeIds.has(routeId)) {
        issues.push(`Line ${line.id} references missing route ${routeId}`);
      }
    });
  });

  edges.forEach((edge) => {
    if (!stopIds.has(edge.origin)) {
      issues.push(`Direct edge origin missing stop: ${edge.origin}`);
    }
    if (!stopIds.has(edge.destination)) {
      issues.push(`Direct edge destination missing stop: ${edge.destination}`);
    }
    if (!routeIds.has(edge.routeId)) {
      issues.push(`Direct edge references missing route: ${edge.routeId}`);
    }
  });

  const optionalLiveState = {};
  for (const file of OPTIONAL_LIVE_FILES) {
    optionalLiveState[file] = await fileExists(file);
  }

  if (optionalLiveState["data/departures.live.json"]) {
    const liveDepartures = await readJson("data/departures.live.json");
    const stopsMap = liveDepartures?.stops || {};

    Object.entries(stopsMap).forEach(([stopId, entries]) => {
      if (!stopIds.has(stopId)) {
        issues.push(`Live departures references missing stop key ${stopId}`);
      }
      if (!Array.isArray(entries)) {
        issues.push(`Live departures stop ${stopId} is not an array`);
        return;
      }
      entries.forEach((entry, index) => {
        if (entry.routeId && !routeIds.has(entry.routeId)) {
          issues.push(`Live departures ${stopId}[${index}] references missing route ${entry.routeId}`);
        }
      });
    });
  }

  if (optionalLiveState["data/alerts.live.json"]) {
    const liveAlerts = await readJson("data/alerts.live.json");
    const alerts = liveAlerts?.alerts || [];
    if (!Array.isArray(alerts)) {
      issues.push("Live alerts payload `alerts` field is not an array");
    } else {
      alerts.forEach((alert, index) => {
        (alert.routes || []).forEach((routeId) => {
          if (!routeIds.has(routeId)) {
            issues.push(`Live alerts[${index}] references missing route ${routeId}`);
          }
        });
        (alert.stops || []).forEach((stopId) => {
          if (!stopIds.has(stopId)) {
            issues.push(`Live alerts[${index}] references missing stop ${stopId}`);
          }
        });
      });
    }
  }

  if (issues.length) {
    throw new Error(`Data validation failed:\n${issues.join("\n")}`);
  }

  const liveFlags = OPTIONAL_LIVE_FILES.map((file) => `${file}:${optionalLiveState[file] ? "present" : "absent"}`).join(", ");
  console.log(
    `Data validation passed: ${stops.length} stops, ${routes.length} routes, ${lines.length} lines. Optional live files -> ${liveFlags}`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
