import { storageService } from "../services/storageService.js";

export function addRecentStop(stopId) {
  storageService.addRecentStop(stopId);
}

export function getRecentStops() {
  return storageService.getRecentStops();
}

export function addRecentRoute(routeId) {
  storageService.addRecentRoute(routeId);
}

export function getRecentRoutes() {
  return storageService.getRecentRoutes();
}

export function addRecentSearch(query) {
  storageService.addRecentSearch(query);
}

export function getRecentSearches() {
  return storageService.getRecentSearches();
}

export function toggleFavoriteStop(stopId) {
  return storageService.toggleFavoriteStop(stopId);
}

export function toggleFavoriteRoute(routeId) {
  return storageService.toggleFavoriteRoute(routeId);
}

export function getFavoriteStops() {
  return storageService.getFavoriteStops();
}

export function getFavoriteRoutes() {
  return storageService.getFavoriteRoutes();
}
