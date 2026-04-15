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

function isHttpSource(source) {
  return /^https?:\/\//i.test(String(source || ""));
}

function sanitizeHeaderName(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function parseHeaders(headerPairs) {
  const headers = {};
  (headerPairs || []).forEach((pair) => {
    if (typeof pair !== "string" || !pair.trim()) {
      return;
    }
    const separator = pair.indexOf(":");
    if (separator <= 0) {
      return;
    }
    const key = sanitizeHeaderName(pair.slice(0, separator));
    const value = pair.slice(separator + 1).trim();
    if (!key || !value) {
      return;
    }
    headers[key] = value;
  });
  return headers;
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 20000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: options.headers || {},
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text();

    try {
      const json = JSON.parse(rawBody);
      return {
        payload: json,
        contentType,
        bytes: Buffer.byteLength(rawBody)
      };
    } catch {
      throw new Error(`Response was not valid JSON for ${url}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    payload: parsed,
    contentType: "application/json",
    bytes: Buffer.byteLength(raw)
  };
}

async function readSource(source, options) {
  if (!source) {
    return null;
  }

  if (isHttpSource(source)) {
    return fetchJson(source, options);
  }

  return readJsonFile(source);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const departuresSource = args["departures-source"] || process.env.LIVE_DEPARTURES_SOURCE || "";
  const alertsSource = args["alerts-source"] || process.env.LIVE_ALERTS_SOURCE || "";

  const outRawDir = args["out-raw-dir"] || "./raw/live";
  const timeoutMs = Number(args["timeout-ms"] || process.env.LIVE_FETCH_TIMEOUT_MS || 20000);

  const headers = parseHeaders([
    process.env.LIVE_HEADER_1,
    process.env.LIVE_HEADER_2,
    process.env.LIVE_HEADER_3,
    process.env.LIVE_HEADER_4
  ]);

  if (!departuresSource && !alertsSource) {
    throw new Error(
      "No live sources provided. Set --departures-source/--alerts-source or LIVE_DEPARTURES_SOURCE/LIVE_ALERTS_SOURCE."
    );
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    outRawDir,
    departures: {
      source: departuresSource || null,
      fetched: false,
      bytes: 0,
      error: null
    },
    alerts: {
      source: alertsSource || null,
      fetched: false,
      bytes: 0,
      error: null
    }
  };

  if (departuresSource) {
    try {
      const result = await readSource(departuresSource, { timeoutMs, headers });
      if (result) {
        await writeJson(path.join(outRawDir, "departures.json"), result.payload);
        summary.departures.fetched = true;
        summary.departures.bytes = result.bytes;
      }
    } catch (error) {
      summary.departures.error = error instanceof Error ? error.message : String(error);
    }
  }

  if (alertsSource) {
    try {
      const result = await readSource(alertsSource, { timeoutMs, headers });
      if (result) {
        await writeJson(path.join(outRawDir, "alerts.json"), result.payload);
        summary.alerts.fetched = true;
        summary.alerts.bytes = result.bytes;
      }
    } catch (error) {
      summary.alerts.error = error instanceof Error ? error.message : String(error);
    }
  }

  await writeJson(path.join(outRawDir, "summary.json"), summary);

  if ((departuresSource && !summary.departures.fetched) || (alertsSource && !summary.alerts.fetched)) {
    const failures = [summary.departures.error, summary.alerts.error].filter(Boolean);
    throw new Error(`One or more live sources failed. ${failures.join(" | ")}`);
  }

  console.log(
    `Live fetch complete. departures=${summary.departures.fetched ? "ok" : "skip"}, alerts=${
      summary.alerts.fetched ? "ok" : "skip"
    }`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
