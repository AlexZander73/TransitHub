#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
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

async function readJsonOptional(filePath) {
  if (!filePath) {
    return null;
  }
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function pickField(obj, keys, fallback = null) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return fallback;
}

function normalizeDepartureEntry(entry = {}) {
  const delaySeconds = pickField(entry, ["delaySeconds", "delay_seconds", "delaySec"], null);
  const delayMinutesFromSeconds = delaySeconds === null ? null : Math.round(toNumber(delaySeconds) / 60);

  const inMinutes = pickField(entry, ["inMinutes", "etaMinutes", "eta_minutes"], null);

  return {
    tripId: pickField(entry, ["tripId", "trip_id"], null),
    routeId: pickField(entry, ["routeId", "route_id", "route", "line", "lineId"], null),
    headsign: pickField(entry, ["headsign", "destination", "trip_headsign"], "Service"),
    expectedTime: pickField(entry, ["expectedTime", "predictedTime", "departureTime", "time"], null),
    scheduledTime: pickField(entry, ["scheduledTime", "plannedTime"], null),
    epochSeconds: pickField(entry, ["epochSeconds", "epoch", "timestamp"], null),
    inMinutes: inMinutes === null ? null : toNumber(inMinutes),
    platform: pickField(entry, ["platform", "platformCode", "bay", "stand"], null),
    status: pickField(entry, ["status", "state"], "scheduled"),
    delayMinutes:
      delayMinutesFromSeconds !== null
        ? delayMinutesFromSeconds
        : toNumber(pickField(entry, ["delayMinutes", "delay_minutes"], 0), 0)
  };
}

function normalizeDepartures(input) {
  if (!input) {
    return { stops: {} };
  }

  const stops = {};

  const assign = (stopId, entries) => {
    if (!stopId || !Array.isArray(entries)) {
      return;
    }
    const normalized = entries.map((entry) => normalizeDepartureEntry(entry));
    const existing = stops[stopId] || [];
    stops[stopId] = [...existing, ...normalized];
  };

  if (input.stops && typeof input.stops === "object") {
    Object.entries(input.stops).forEach(([stopId, entries]) => assign(stopId, entries));
  }

  const departuresArray = Array.isArray(input.departures)
    ? input.departures
    : Array.isArray(input)
    ? input
    : Array.isArray(input.items)
    ? input.items
    : [];

  departuresArray.forEach((entry) => {
    const stopId = pickField(entry, ["stopId", "stop_id", "stopCode", "stop_code"], null);
    if (!stopId) {
      return;
    }
    assign(stopId, [entry]);
  });

  Object.keys(stops).forEach((stopId) => {
    const uniqueBySignature = new Map();
    stops[stopId].forEach((entry) => {
      const signature = `${entry.routeId || "?"}|${entry.headsign || "?"}|${entry.expectedTime || entry.inMinutes || "?"}`;
      if (!uniqueBySignature.has(signature)) {
        uniqueBySignature.set(signature, entry);
      }
    });
    stops[stopId] = Array.from(uniqueBySignature.values()).slice(0, 20);
  });

  return { stops };
}

function normalizeAlertEntry(alert = {}) {
  return {
    id: pickField(alert, ["id", "alertId", "alert_id"], `alert-${Math.random().toString(36).slice(2, 10)}`),
    level: String(pickField(alert, ["level", "severity", "priority"], "info")).toLowerCase(),
    title: pickField(alert, ["title", "header", "summary"], "Service notice"),
    description: pickField(alert, ["description", "details", "body", "message"], ""),
    routes: pickField(alert, ["routes", "routeIds", "route_ids"], []),
    stops: pickField(alert, ["stops", "stopIds", "stop_ids"], []),
    effectiveFrom: pickField(alert, ["effectiveFrom", "startTime", "start", "from"], null),
    effectiveTo: pickField(alert, ["effectiveTo", "endTime", "end", "to"], null),
    status: pickField(alert, ["status", "state"], "active")
  };
}

function normalizeAlerts(input) {
  if (!input) {
    return { alerts: [] };
  }

  const candidates = Array.isArray(input.alerts)
    ? input.alerts
    : Array.isArray(input.incidents)
    ? input.incidents
    : Array.isArray(input.advisories)
    ? input.advisories
    : Array.isArray(input)
    ? input
    : [];

  const alerts = candidates.map((alert) => normalizeAlertEntry(alert));

  const deduped = [];
  const seen = new Set();
  alerts.forEach((alert) => {
    const key = `${alert.id}|${alert.title}|${alert.effectiveFrom || ""}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(alert);
  });

  return { alerts: deduped.slice(0, 60) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out || "./data";
  const departuresPath = args.departures || "./raw/live/departures.json";
  const alertsPath = args.alerts || "./raw/live/alerts.json";

  const [departuresIn, alertsIn] = await Promise.all([readJsonOptional(departuresPath), readJsonOptional(alertsPath)]);

  const departuresOut = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: "merge-live-feeds.mjs",
      sourcePath: departuresPath
    },
    ...normalizeDepartures(departuresIn)
  };

  const alertsOut = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: "merge-live-feeds.mjs",
      sourcePath: alertsPath
    },
    ...normalizeAlerts(alertsIn)
  };

  await fs.mkdir(outDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(outDir, "departures.live.json"), JSON.stringify(departuresOut, null, 2)),
    fs.writeFile(path.join(outDir, "alerts.live.json"), JSON.stringify(alertsOut, null, 2))
  ]);

  console.log(
    `Wrote live files: departures(${Object.keys(departuresOut.stops || {}).length} stops), alerts(${(alertsOut.alerts || []).length})`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
