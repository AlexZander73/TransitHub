export function indexById(collection) {
  return Object.fromEntries((collection || []).map((item) => [item.id, item]));
}

export function includesStop(route, stopId) {
  return Array.isArray(route?.stopSequence) && route.stopSequence.includes(stopId);
}

export function travelMinutesBetweenStops(route, originStopId, destinationStopId) {
  if (!route || !Array.isArray(route.stopSequence) || !Array.isArray(route.segmentMinutes)) {
    return null;
  }

  const from = route.stopSequence.indexOf(originStopId);
  const to = route.stopSequence.indexOf(destinationStopId);

  if (from === -1 || to === -1 || from === to) {
    return from === to && from !== -1 ? 0 : null;
  }

  const start = Math.min(from, to);
  const end = Math.max(from, to);
  let total = 0;

  for (let i = start; i < end; i += 1) {
    total += Number(route.segmentMinutes[i] || 0);
  }

  return total;
}

export function directionSignForStops(route, originStopId, destinationStopId) {
  const from = route.stopSequence.indexOf(originStopId);
  const to = route.stopSequence.indexOf(destinationStopId);
  if (from === -1 || to === -1 || from === to) {
    return null;
  }
  return to > from ? 1 : -1;
}

export function findDirectionForStops(route, originStopId, destinationStopId) {
  if (!route || !Array.isArray(route.directions)) {
    return null;
  }

  const wantedSign = directionSignForStops(route, originStopId, destinationStopId);
  if (!wantedSign) {
    return null;
  }

  return (
    route.directions.find((direction) => {
      const dirSign = directionSignForStops(route, direction.originStopId, direction.destinationStopId);
      return dirSign === wantedSign;
    }) || null
  );
}

export function normalizeMode(mode) {
  return (mode || "").toLowerCase();
}
