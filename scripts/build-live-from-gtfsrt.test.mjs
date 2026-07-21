import assert from "node:assert/strict";
import test from "node:test";
import { parseTripUpdates, statusFromTripUpdate } from "./build-live-from-gtfsrt.mjs";

const context = {
  mapping: {
    routes: { "GCL3-4800": "GL" },
    stops: { "600800": "BBS" },
    tripHeadsigns: {}
  },
  local: {
    stopsById: { BBS: { id: "BBS" } },
    stopsByCode: {},
    stopsByName: {},
    routesById: { GL: { id: "GL", stopSequence: ["BBS", "CAVILL"] } },
    routesByShort: {},
    routesByLong: {}
  },
  staticLookups: {
    gtfsStopsById: {},
    gtfsRoutesById: {},
    gtfsTripsById: {}
  }
};

test("classifies early, delayed, and severe services", () => {
  assert.equal(statusFromTripUpdate("SCHEDULED", -180), "early");
  assert.equal(statusFromTripUpdate("SCHEDULED", 300), "minor_delay");
  assert.equal(statusFromTripUpdate("SCHEDULED", 900), "severe_delay");
});

test("preserves scheduled time and trip-level cancellation", () => {
  const now = new Date("2026-07-21T08:00:00Z");
  const expectedEpoch = Math.floor(now.getTime() / 1000) + 20 * 60;
  const feed = {
    entity: [
      {
        id: "delayed",
        tripUpdate: {
          trip: { tripId: "trip-delay", routeId: "GCL3-4800" },
          stopTimeUpdate: [{
            stopId: "600800",
            departure: { time: expectedEpoch, delay: 11 * 60 }
          }]
        }
      },
      {
        id: "cancelled",
        tripUpdate: {
          trip: { tripId: "trip-cancel", routeId: "GCL3-4800", scheduleRelationship: "CANCELED" }
        }
      }
    ]
  };

  const result = parseTripUpdates(feed, context, { now, maxLookAheadMinutes: 60 });
  assert.equal(result.stops.BBS[0].status, "severe_delay");
  assert.equal(result.stops.BBS[0].scheduledTime, "2026-07-21T08:09:00.000Z");
  assert.deepEqual(result.incidents[0].stopIds, ["BBS", "CAVILL"]);
  assert.equal(result.incidents[0].status, "cancelled");
});

test("keeps skipped stops even when the feed omits a timestamp", () => {
  const now = new Date("2026-07-21T08:00:00Z");
  const feed = {
    entity: [{
      id: "skipped",
      tripUpdate: {
        trip: { tripId: "trip-skip", routeId: "GCL3-4800" },
        stopTimeUpdate: [{ stopId: "600800", scheduleRelationship: "SKIPPED" }]
      }
    }]
  };
  const result = parseTripUpdates(feed, context, { now });
  assert.equal(result.incidents[0].status, "skipped");
  assert.deepEqual(result.incidents[0].stopIds, ["BBS"]);
});
