#!/usr/bin/env node

import { promises as fs } from "node:fs";

const maxAgeMinutes = Number(process.argv[2] || 20);
const required = [
  "data/departures.live.json",
  "data/vehicles.live.json",
  "data/alerts.live.json",
  "data/live-status.json"
];

for (const file of required) {
  const payload = JSON.parse(await fs.readFile(file, "utf8"));
  const generatedAt = payload.meta?.generatedAt || payload.generatedAt;
  const generated = Date.parse(generatedAt || "");
  if (!Number.isFinite(generated)) {
    throw new Error(`${file} has no valid generatedAt timestamp`);
  }
  const ageMinutes = (Date.now() - generated) / 60_000;
  if (ageMinutes < -2 || ageMinutes > maxAgeMinutes) {
    throw new Error(`${file} is ${ageMinutes.toFixed(1)} minutes old (maximum ${maxAgeMinutes})`);
  }
}

console.log(`Live payload freshness passed (maximum ${maxAgeMinutes} minutes).`);
