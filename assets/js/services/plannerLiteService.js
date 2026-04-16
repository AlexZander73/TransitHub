import { addMinutes, formatClockTime } from "../utils/time.js";
import { findDirectionForStops, includesStop, travelMinutesBetweenStops } from "../utils/network.js";

function findEdge(edges, originStopId, destinationStopId, preferredRouteId = null) {
  return (
    edges.find((edge) => {
      if (preferredRouteId && edge.routeId !== preferredRouteId) {
        return false;
      }
      const forward = edge.origin === originStopId && edge.destination === destinationStopId;
      const backward = edge.bidirectional && edge.origin === destinationStopId && edge.destination === originStopId;
      return forward || backward;
    }) || null
  );
}

function findRouteCandidates(routes, originStopId, destinationStopId, preferredRouteId = null) {
  return routes.filter((route) => {
    if (preferredRouteId && route.id !== preferredRouteId) {
      return false;
    }
    return includesStop(route, originStopId) && includesStop(route, destinationStopId);
  });
}

function confidenceLabel(value) {
  const val = String(value || "").toLowerCase();
  if (["high", "medium", "low"].includes(val)) {
    return val;
  }
  return "medium";
}

export class PlannerLiteService {
  constructor(network) {
    this.network = network;
  }

  setNetwork(network) {
    this.network = network;
  }

  isTransferCapablePair(originStopId, destinationStopId) {
    const origin = this.network?.stopById?.[originStopId] || null;
    const destination = this.network?.stopById?.[destinationStopId] || null;

    if (!origin || !destination || !origin.interchangeId || !destination.interchangeId) {
      return false;
    }

    if (origin.interchangeId === destination.interchangeId) {
      return true;
    }

    const originInterchange = this.network?.interchangeById?.[origin.interchangeId];
    return Boolean(originInterchange?.connectedInterchanges?.includes(destination.interchangeId));
  }

  explainEligibility({ originStopId, destinationStopId, preferredRouteId = null }) {
    const { routes = [], directTravelEdges = [] } = this.network || {};

    if (!originStopId || !destinationStopId) {
      return {
        eligible: false,
        code: "MISSING_STOPS",
        message: "Select both origin and destination to estimate travel."
      };
    }

    if (originStopId === destinationStopId) {
      return {
        eligible: false,
        code: "SAME_STOP",
        message: "Origin and destination are the same stop."
      };
    }

    const explicitEdge = findEdge(directTravelEdges, originStopId, destinationStopId, preferredRouteId);
    if (explicitEdge) {
      return {
        eligible: true,
        code: "DIRECT_EDGE",
        message: "Direct journey available via supported direct edge.",
        routeId: explicitEdge.routeId
      };
    }

    const candidates = findRouteCandidates(routes, originStopId, destinationStopId, preferredRouteId)
      .map((route) => ({
        route,
        minutes: travelMinutesBetweenStops(route, originStopId, destinationStopId)
      }))
      .filter((row) => typeof row.minutes === "number" && row.minutes > 0);

    if (candidates.length) {
      return {
        eligible: true,
        code: "SAME_ROUTE",
        message: "Direct journey available on the same route sequence.",
        routeId: candidates[0].route.id
      };
    }

    if (this.isTransferCapablePair(originStopId, destinationStopId)) {
      return {
        eligible: false,
        code: "TRANSFER_CAPABLE",
        message: "These stops are transfer-capable locations. Full transfer journey planning is not supported yet."
      };
    }

    return {
      eligible: false,
      code: "NO_DIRECT_ROUTE",
      message: "Direct travel estimate is not available for this stop pair yet."
    };
  }

  estimateDirectJourney({
    originStopId,
    destinationStopId,
    preferredRouteId = null,
    departuresAtOrigin = []
  }) {
    const { routes = [], routeById = {}, stopById = {}, directTravelEdges = [] } = this.network || {};

    const eligibility = this.explainEligibility({ originStopId, destinationStopId, preferredRouteId });
    if (!eligibility.eligible) {
      return {
        valid: false,
        ...eligibility
      };
    }

    const edge = findEdge(directTravelEdges, originStopId, destinationStopId, preferredRouteId);

    let route = edge ? routeById[edge.routeId] : null;
    let minutes = typeof edge?.minutes === "number" ? edge.minutes : null;
    let distanceKm = typeof edge?.distanceKm === "number" ? edge.distanceKm : null;
    let estimateSource = edge?.estimateSource || (edge ? "edge" : "derived");
    let confidence = confidenceLabel(edge?.confidence || "medium");

    if (!route || !minutes) {
      const candidates = findRouteCandidates(routes, originStopId, destinationStopId, preferredRouteId)
        .map((candidateRoute) => ({
          route: candidateRoute,
          minutes: travelMinutesBetweenStops(candidateRoute, originStopId, destinationStopId)
        }))
        .filter((item) => typeof item.minutes === "number" && item.minutes > 0)
        .sort((a, b) => a.minutes - b.minutes);

      if (!candidates.length) {
        return {
          valid: false,
          code: "NO_DIRECT_ROUTE",
          message: "Direct travel estimate is not available for this stop pair yet."
        };
      }

      route = candidates[0].route;
      minutes = candidates[0].minutes;
      estimateSource = "derived";
      confidence = "medium";
    }

    const direction = findDirectionForStops(route, originStopId, destinationStopId);
    const nextDeparture = this.pickSuitableDeparture(route, direction, departuresAtOrigin);
    const departureTime = nextDeparture?.departureTime || null;
    const arrivalTime = departureTime ? addMinutes(departureTime, minutes) : null;

    const originStop = stopById[originStopId];
    const destinationStop = stopById[destinationStopId];

    return {
      valid: true,
      code: "DIRECT_AVAILABLE",
      routeId: route.id,
      routeShortName: route.shortName,
      routeLongName: route.longName,
      minutes,
      distanceKm,
      confidence,
      estimateSource,
      directionId: direction?.id || null,
      headsign: direction?.headsign || nextDeparture?.headsign || null,
      departureTime,
      departureLabel: departureTime ? formatClockTime(departureTime) : null,
      arrivalTime,
      arrivalLabel: arrivalTime ? formatClockTime(arrivalTime) : null,
      originStop,
      destinationStop,
      eligibilityNote: eligibility.message,
      message: departureTime
        ? `Estimated ${minutes} min on route ${route.shortName}.`
        : `Estimated ${minutes} min on route ${route.shortName}. No upcoming departure in range.`
    };
  }

  getDirectDestinationIds(originStopId, preferredRouteId = null) {
    const { routes = [], directTravelEdges = [] } = this.network || {};

    const fromEdges = directTravelEdges
      .flatMap((edge) => {
        if (preferredRouteId && edge.routeId !== preferredRouteId) {
          return [];
        }
        if (edge.origin === originStopId) {
          return [edge.destination];
        }
        if (edge.bidirectional && edge.destination === originStopId) {
          return [edge.origin];
        }
        return [];
      })
      .filter(Boolean);

    const fromSharedRoutes = routes.flatMap((route) => {
      if (preferredRouteId && route.id !== preferredRouteId) {
        return [];
      }
      if (!includesStop(route, originStopId)) {
        return [];
      }
      return route.stopSequence.filter((stopId) => stopId !== originStopId);
    });

    return [...new Set([...fromEdges, ...fromSharedRoutes])];
  }

  pickSuitableDeparture(route, direction, departuresAtOrigin) {
    if (!route || !departuresAtOrigin?.length) {
      return null;
    }

    const routeDepartures = departuresAtOrigin.filter((item) => item.routeId === route.id);
    if (!routeDepartures.length) {
      return null;
    }

    if (!direction) {
      return routeDepartures[0];
    }

    const desiredHeadsign = direction.headsign.toLowerCase();
    return routeDepartures.find((item) => item.headsign.toLowerCase().includes(desiredHeadsign)) || routeDepartures[0];
  }
}
