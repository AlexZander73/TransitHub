#!/usr/bin/env node

import { promises as fs } from "node:fs";

const REQUIRED_FILES = [
  "data/config.json",
  "data/regions.json",
  "data/stops.json",
  "data/routes.json",
  "data/lines.json",
  "data/interchanges.json",
  "data/route-patterns.json",
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

  const [config, regionsJson, stopsJson, routesJson, linesJson, interchangesJson, patternsJson, directJson] = await Promise.all([
    readJson("data/config.json"),
    readJson("data/regions.json"),
    readJson("data/stops.json"),
    readJson("data/routes.json"),
    readJson("data/lines.json"),
    readJson("data/interchanges.json"),
    readJson("data/route-patterns.json"),
    readJson("data/direct-travel.sample.json")
  ]);

  const regions = regionsJson.regions || [];
  const stops = stopsJson.stops || [];
  const routes = routesJson.routes || [];
  const lines = linesJson.lines || [];
  const interchanges = interchangesJson.interchanges || [];
  const patterns = patternsJson.patterns || [];
  const edges = directJson.edges || [];

  const regionIds = new Set(regions.map((region) => region.id));
  const stopIds = new Set(stops.map((stop) => stop.id));
  const routeIds = new Set(routes.map((route) => route.id));
  const interchangeIds = new Set(interchanges.map((node) => node.id));

  const issues = [];

  const configuredPaths = config?.dataPaths || {};
  ["regions", "stops", "routes", "lines", "interchanges", "routePatterns", "directTravel"].forEach((key) => {
    if (!configuredPaths[key]) {
      issues.push(`config.dataPaths.${key} missing`);
    }
  });

  stops.forEach((stop) => {
    if (!regionIds.has(stop.region)) {
      issues.push(`Stop ${stop.id} references unknown region ${stop.region}`);
    }
    (stop.routes || []).forEach((routeId) => {
      if (!routeIds.has(routeId)) {
        issues.push(`Stop ${stop.id} references missing route ${routeId}`);
      }
    });
    if (stop.interchangeId && !interchangeIds.has(stop.interchangeId)) {
      issues.push(`Stop ${stop.id} references missing interchange ${stop.interchangeId}`);
    }
  });

  routes.forEach((route) => {
    if (!regionIds.has(route.region)) {
      issues.push(`Route ${route.id} references unknown region ${route.region}`);
    }
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
    if (!regionIds.has(line.region)) {
      issues.push(`Line ${line.id} references unknown region ${line.region}`);
    }
    (line.routeIds || []).forEach((routeId) => {
      if (!routeIds.has(routeId)) {
        issues.push(`Line ${line.id} references missing route ${routeId}`);
      }
    });
  });

  interchanges.forEach((node) => {
    if (!regionIds.has(node.region)) {
      issues.push(`Interchange ${node.id} references unknown region ${node.region}`);
    }
    (node.stopIds || []).forEach((stopId) => {
      if (!stopIds.has(stopId)) {
        issues.push(`Interchange ${node.id} references missing stop ${stopId}`);
      }
    });
    (node.connectedInterchanges || []).forEach((linkedId) => {
      if (!interchangeIds.has(linkedId)) {
        issues.push(`Interchange ${node.id} links to missing interchange ${linkedId}`);
      }
    });
  });

  patterns.forEach((pattern) => {
    if (!routeIds.has(pattern.routeId)) {
      issues.push(`Pattern ${pattern.id} references missing route ${pattern.routeId}`);
    }
    if (!regionIds.has(pattern.region)) {
      issues.push(`Pattern ${pattern.id} references unknown region ${pattern.region}`);
    }
    (pattern.stopSequence || []).forEach((stopId) => {
      if (!stopIds.has(stopId)) {
        issues.push(`Pattern ${pattern.id} references missing stop ${stopId}`);
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
    if (edge.region && !regionIds.has(edge.region)) {
      issues.push(`Direct edge references unknown region: ${edge.region}`);
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
    `Data validation passed: ${regions.length} regions, ${stops.length} stops, ${routes.length} routes, ${lines.length} lines, ${interchanges.length} interchanges. Optional live files -> ${liveFlags}`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
