import { clamp } from "../utils/time.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tag, attributes = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      el.setAttribute(key, value);
    }
  });
  return el;
}

function activeModes(filters = {}) {
  return Object.entries(filters)
    .filter(([, enabled]) => enabled)
    .map(([mode]) => mode);
}

function stopPassesFilter(stop, filters) {
  if (!filters) {
    return true;
  }

  const modes = activeModes(filters);
  if (!modes.length) {
    return true;
  }

  return modes.some((mode) => stop.modes?.includes(mode));
}

function modePassesFilter(mode, filters) {
  if (!filters) {
    return true;
  }

  const modes = activeModes(filters);
  if (!modes.length) {
    return true;
  }

  return modes.includes(mode);
}

function isInteractiveMapTarget(target) {
  return Boolean(target?.closest?.(".map-stop, .map-line"));
}

function isMajorStop(stop) {
  return stop.importance === "major" || stop.type === "interchange" || stop.type === "station";
}

function currentTheme() {
  return document.documentElement.dataset.theme || "original-premium";
}

function themedRouteColor(route) {
  const theme = currentTheme();
  const routeId = String(route.id || "");

  if (theme === "aurora") {
    return {
      GL: "#20e0d2",
      700: "#ff5f83",
      777: "#ffb13b",
      760: "#9f6bff",
      750: "#24cfff"
    }[routeId] || "#8b5cff";
  }

  if (theme === "transit-motion") {
    return {
      GL: "#12a99d",
      700: "#ef4b45",
      777: "#176fd0",
      760: "#6a52d8",
      750: "#24a363"
    }[routeId] || route.color || "#23344b";
  }

  return route.color || "#19639a";
}

class LeafletMapRuntime {
  constructor({ mapElement, svg, onStopSelect, onRouteSelect, onBackgroundSelect, mapConfig }) {
    this.mapElement = mapElement;
    this.svg = svg;
    this.onStopSelect = onStopSelect;
    this.onRouteSelect = onRouteSelect;
    this.onBackgroundSelect = onBackgroundSelect;
    this.mapConfig = mapConfig || {};

    this.lines = [];
    this.routes = [];
    this.stops = [];
    this.routeShapes = {};
    this.vehicles = [];
    this.userLocation = null;
    this.stopById = {};
    this.lineByRouteId = {};

    this.selectedRegionId = null;
    this.selectedStopId = null;
    this.compareStopId = null;
    this.selectedRouteId = null;
    this.filters = null;
    this.mapMode = "stylized";
    this.favoriteStopIds = new Set();

    this.lastFittedRegionId = null;
    this.lastSelectedStopId = null;

    this.initializeMap();
  }

  initializeMap() {
    const L = window.L;
    if (!L || !this.mapElement) {
      throw new Error("Leaflet was not loaded. Unable to initialize real map view.");
    }

    if (this.svg?.parentElement) {
      this.svg.parentElement.classList.add("leaflet-active");
    }

    this.map = L.map(this.mapElement, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      zoomSnap: 0.25,
      minZoom: Number(this.mapConfig.leafletMinZoom || 8),
      maxZoom: Number(this.mapConfig.leafletMaxZoom || 18)
    });

    this.map.createPane("connections");
    this.map.createPane("routes");
    this.map.createPane("stops");
    this.map.createPane("vehicles");
    this.map.createPane("user-location");

    this.map.getPane("connections").style.zIndex = "420";
    this.map.getPane("routes").style.zIndex = "430";
    this.map.getPane("stops").style.zIndex = "440";
    this.map.getPane("vehicles").style.zIndex = "450";
    this.map.getPane("user-location").style.zIndex = "460";

    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

    this.baseLayers = {
      stylized: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: `${attribution} &copy; CARTO`
      }),
      corridor: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution
      }),
      connections: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: `${attribution} &copy; CARTO`
      })
    };

    this.activeBaseKey = null;
    this.activeBaseLayer = null;
    this.setBaseLayer("stylized");

    this.routeLayer = L.layerGroup().addTo(this.map);
    this.connectionLayer = L.layerGroup().addTo(this.map);
    this.stopLayer = L.layerGroup().addTo(this.map);
    this.vehicleLayer = L.layerGroup().addTo(this.map);
    this.userLocationLayer = L.layerGroup().addTo(this.map);

    this.map.setView([-27.95, 153.4], 10);
    window.requestAnimationFrame(() => this.map.invalidateSize());

    this.map.on("click", () => {
      this.onBackgroundSelect?.();
    });

    this.map.on("zoomend", () => {
      this.render();
    });
  }

  setBaseLayer(mode) {
    const key = this.baseLayers[mode] ? mode : "stylized";
    if (this.activeBaseKey === key) {
      return;
    }

    if (this.activeBaseLayer) {
      this.map.removeLayer(this.activeBaseLayer);
    }

    this.activeBaseLayer = this.baseLayers[key];
    this.activeBaseLayer.addTo(this.map);
    this.activeBaseKey = key;
  }

  setControls({ zoomInButton, zoomOutButton, resetButton }) {
    zoomInButton?.addEventListener("click", () => {
      this.map.zoomIn();
    });

    zoomOutButton?.addEventListener("click", () => {
      this.map.zoomOut();
    });

    resetButton?.addEventListener("click", () => {
      this.fitToRegion(true);
    });
  }

  setData({ lines, stops, routes, routeShapes }) {
    this.lines = lines || [];
    this.stops = stops || [];
    this.routes = routes || [];
    this.routeShapes = routeShapes || {};
    this.stopById = Object.fromEntries(this.stops.map((stop) => [stop.id, stop]));

    this.lineByRouteId = {};
    this.lines.forEach((line) => {
      (line.routeIds || []).forEach((routeId) => {
        this.lineByRouteId[routeId] = line;
      });
    });

    this.render();
  }

  setVehicles(vehicles = []) {
    this.vehicles = vehicles;
    this.render();
  }

  setUserLocation(location) {
    this.userLocation = location || null;
    this.render();
  }

  getCameraState() {
    if (!this.map) {
      return null;
    }
    const center = this.map.getCenter();
    return { center: [center.lat, center.lng], zoom: this.map.getZoom() };
  }

  restoreCameraState(camera) {
    if (!camera?.center || !Number.isFinite(camera.zoom)) {
      return;
    }
    this.lastFittedRegionId = this.selectedRegionId;
    this.lastSelectedStopId = null;
    this.map.setView(camera.center, camera.zoom, { animate: false });
  }

  focusLocation(location, nearestStop) {
    if (!location || !this.map) {
      return;
    }
    this.lastFittedRegionId = this.selectedRegionId;
    if (nearestStop) {
      this.map.fitBounds(
        window.L.latLngBounds([
          [location.lat, location.lon],
          [nearestStop.lat, nearestStop.lon]
        ]).pad(0.5),
        { animate: true, maxZoom: 15, padding: [72, 72] }
      );
      return;
    }
    this.map.setView([location.lat, location.lon], Math.max(this.map.getZoom(), 14), { animate: true });
  }

  updateState({ selectedRegionId, selectedStopId, compareStopId, selectedRouteId, filters, mapMode, favoriteStopIds }) {
    const previousRegion = this.selectedRegionId;

    this.selectedRegionId = selectedRegionId || null;
    this.selectedStopId = selectedStopId || null;
    this.compareStopId = compareStopId || null;
    this.selectedRouteId = selectedRouteId || null;
    this.filters = filters || null;
    this.mapMode = mapMode || "stylized";
    this.favoriteStopIds = new Set(favoriteStopIds || []);

    if (previousRegion !== this.selectedRegionId) {
      this.lastFittedRegionId = null;
    }

    this.render();
  }

  getRegionStops() {
    return this.selectedRegionId ? this.stops.filter((stop) => stop.region === this.selectedRegionId) : this.stops;
  }

  getRegionRoutes() {
    return this.selectedRegionId ? this.routes.filter((route) => route.region === this.selectedRegionId) : this.routes;
  }

  shouldShowLabel(stop) {
    if (stop.id === this.selectedStopId || stop.id === this.compareStopId) {
      return true;
    }

    if (this.favoriteStopIds.has(stop.id)) {
      return true;
    }

    if (this.map && this.map.getZoom() < 12.15) {
      return false;
    }

    if (this.mapMode === "connections") {
      return isMajorStop(stop);
    }

    if (this.mapMode === "corridor") {
      return isMajorStop(stop);
    }

    return isMajorStop(stop);
  }

  fitToRegion(force = false) {
    const regionId = this.selectedRegionId;
    if (!regionId) {
      return;
    }

    if (!force && this.lastFittedRegionId === regionId) {
      return;
    }

    const points = this.getRegionStops()
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
      .map((stop) => [stop.lat, stop.lon]);

    if (!points.length) {
      return;
    }

    const bounds = window.L.latLngBounds(points);
    const smallViewport = window.innerWidth < 860;
    this.lastFittedRegionId = regionId;
    this.map.fitBounds(bounds.pad(0.12), {
      animate: false,
      maxZoom: smallViewport ? 12.5 : 13.5,
      paddingTopLeft: smallViewport ? [16, 66] : [96, 92],
      paddingBottomRight: smallViewport ? [16, 78] : [430, 92]
    });
  }

  panToSelectedStopIfNeeded() {
    if (!this.selectedStopId || this.selectedStopId === this.lastSelectedStopId) {
      return;
    }

    const stop = this.stopById[this.selectedStopId];
    if (!stop) {
      return;
    }

    const smallViewport = window.innerWidth < 860;
    const target = window.L.latLng(stop.lat, stop.lon);
    this.map.panInside(target, {
      animate: true,
      duration: 0.45,
      paddingTopLeft: smallViewport ? [16, 66] : [96, 92],
      paddingBottomRight: smallViewport ? [16, 96] : [430, 130]
    });

    this.lastSelectedStopId = this.selectedStopId;
  }

  renderRoutes() {
    const routes = this.getRegionRoutes();

    routes.forEach((route) => {
      const line = this.lineByRouteId[route.id] || null;

      if (this.mapMode === "corridor" && line?.layer === "secondary" && !this.selectedRouteId) {
        return;
      }

      const officialShapes = (this.routeShapes?.[route.id]?.shapes || [])
        .map((shape) => shape.points || [])
        .filter((points) => points.length > 1);
      const fallbackShape = (route.stopSequence || [])
        .map((stopId) => this.stopById[stopId])
        .filter(Boolean)
        .map((stop) => [stop.lat, stop.lon]);
      const routeSegments = officialShapes.length ? officialShapes : fallbackShape.length > 1 ? [fallbackShape] : [];

      if (!routeSegments.length) {
        return;
      }

      const selected = this.selectedRouteId === route.id;
      const modeVisible = modePassesFilter(route.mode, this.filters);
      const mutedByRoute = this.selectedRouteId ? !selected : false;
      const muted = mutedByRoute || !modeVisible;

      const weight = selected ? 5.2 : line?.layer === "secondary" ? 1.8 : 2.8;
      const opacity = muted ? 0.1 : selected ? 0.98 : line?.layer === "secondary" ? 0.5 : 0.72;
      const routeClass = String(route.id || "route").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

      routeSegments.forEach((latLngs) => {
        const polyline = window.L.polyline(latLngs, {
          pane: "routes",
          className: `transit-route route-${routeClass} mode-${route.mode || "unknown"}${selected ? " selected" : ""}`,
          color: themedRouteColor(route),
          weight,
          opacity,
          lineJoin: "round",
          lineCap: "round",
          dashArray: line?.layer === "secondary" ? "7 8" : null,
          smoothFactor: 1
        });

        polyline.on("click", (event) => {
          window.L.DomEvent.stopPropagation(event);
          this.onRouteSelect?.(route.id);
        });

        this.routeLayer.addLayer(polyline);
      });
    });
  }

  renderVehicles() {
    this.vehicles.forEach((vehicle) => {
      const route = this.routes.find((item) => item.id === vehicle.routeId);
      if (!route || route.region !== this.selectedRegionId || !modePassesFilter(route.mode, this.filters)) {
        return;
      }
      const label = String(route.shortName || vehicle.label || route.id).replace(/[^a-z0-9]/gi, "").slice(0, 4);
      const marker = window.L.marker([vehicle.lat, vehicle.lon], {
        pane: "vehicles",
        icon: window.L.divIcon({
          className: "live-vehicle-icon-shell",
          html: `<span class="live-vehicle-icon mode-${route.mode}" style="--vehicle-color:${themedRouteColor(route)}">${label}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        }),
        keyboard: true,
        title: `Live ${route.mode} ${label}`
      });
      const updated = vehicle.updatedAt ? new Date(vehicle.updatedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : "recently";
      marker.bindTooltip(`${label} ${vehicle.headsign ? `to ${vehicle.headsign}` : ""} · updated ${updated}`, {
        direction: "top",
        offset: [0, -14],
        className: "map-stop-tooltip vehicle-tooltip"
      });
      marker.on("click", (event) => {
        window.L.DomEvent.stopPropagation(event);
        this.onRouteSelect?.(route.id);
      });
      this.vehicleLayer.addLayer(marker);
    });
  }

  renderUserLocation() {
    if (!this.userLocation) {
      return;
    }
    const { lat, lon, accuracy } = this.userLocation;
    if (Number.isFinite(accuracy) && accuracy > 0) {
      this.userLocationLayer.addLayer(
        window.L.circle([lat, lon], {
          pane: "user-location",
          radius: accuracy,
          color: "#0878d1",
          weight: 1,
          opacity: 0.5,
          fillColor: "#61b7f4",
          fillOpacity: 0.12,
          interactive: false
        })
      );
    }
    const marker = window.L.circleMarker([lat, lon], {
      pane: "user-location",
      radius: 7,
      color: "#ffffff",
      weight: 3,
      fillColor: "#0878d1",
      fillOpacity: 1
    });
    marker.bindTooltip("Your location", { direction: "top", offset: [0, -10], className: "map-stop-tooltip" });
    this.userLocationLayer.addLayer(marker);
  }

  renderConnectionLinks() {
    if (this.mapMode !== "connections" || !this.selectedStopId) {
      return;
    }

    const selected = this.stopById[this.selectedStopId];
    if (!selected) {
      return;
    }

    (selected.nearbyStopIds || [])
      .map((id) => this.stopById[id])
      .filter(Boolean)
      .forEach((stop) => {
        const line = window.L.polyline(
          [
            [selected.lat, selected.lon],
            [stop.lat, stop.lon]
          ],
          {
            pane: "connections",
            color: "#2c6fa0",
            weight: 2,
            opacity: 0.56,
            dashArray: "5 8",
            interactive: false
          }
        );

        this.connectionLayer.addLayer(line);
      });
  }

  renderStops() {
    const stops = this.getRegionStops();

    stops.forEach((stop) => {
      if (!stopPassesFilter(stop, this.filters)) {
        return;
      }

      const selected = this.selectedStopId === stop.id;
      const compare = this.compareStopId === stop.id;
      const favorite = this.favoriteStopIds.has(stop.id);
      const relatedToRoute = this.selectedRouteId ? stop.routes?.includes(this.selectedRouteId) : true;

      const muted = !relatedToRoute;
      const baseRadius = isMajorStop(stop) ? 5.4 : 4.1;
      const radius = selected ? baseRadius + 3 : compare ? baseRadius + 2 : baseRadius;

      let fillColor = "#184663";
      if (stop.modes?.includes("tram")) {
        fillColor = "#02a895";
      } else if (stop.modes?.includes("bus")) {
        fillColor = "#f0782d";
      }

      if (selected) {
        fillColor = "#137fda";
      }

      if (compare) {
        fillColor = "#7f5bf5";
      }

      if (currentTheme() === "aurora" && !selected && !compare) {
        const primaryRoute = (stop.routes || []).map((routeId) => this.routes.find((route) => route.id === routeId)).find(Boolean);
        fillColor = primaryRoute ? themedRouteColor(primaryRoute) : "#24cfff";
      }

      const marker = window.L.circleMarker([stop.lat, stop.lon], {
        pane: "stops",
        className: `transit-stop mode-${stop.modes?.[0] || "unknown"}${selected ? " selected" : ""}`,
        radius,
        color: favorite ? "#f2b31a" : "#ffffff",
        weight: favorite ? 2.8 : 2.2,
        fillColor,
        fillOpacity: muted ? 0.32 : 0.92,
        opacity: muted ? 0.4 : 1,
        keyboard: true
      });

      marker.on("click", (event) => {
        window.L.DomEvent.stopPropagation(event);
        this.onStopSelect?.(stop.id);
      });

      const permanent = this.shouldShowLabel(stop);
      marker.bindTooltip(stop.name, {
        permanent,
        direction: "top",
        offset: [0, -10],
        className: `map-stop-tooltip${selected ? " selected" : ""}${compare ? " compare" : ""}`
      });

      if (selected) {
        marker.openTooltip();
      }

      this.stopLayer.addLayer(marker);
    });
  }

  render() {
    if (!this.map) {
      return;
    }

    this.setBaseLayer(this.mapMode);

    this.routeLayer.clearLayers();
    this.connectionLayer.clearLayers();
    this.stopLayer.clearLayers();
    this.vehicleLayer.clearLayers();
    this.userLocationLayer.clearLayers();

    this.renderRoutes();
    this.renderConnectionLinks();
    this.renderStops();
    this.renderVehicles();
    this.renderUserLocation();

    this.fitToRegion();
    this.panToSelectedStopIfNeeded();
  }
}

class SvgMapRuntime {
  constructor({ svg, cameraLayer, lineLayer, stopLayer, labelLayer, onStopSelect, onRouteSelect, onBackgroundSelect, mapConfig }) {
    this.svg = svg;
    this.cameraLayer = cameraLayer;
    this.lineLayer = lineLayer;
    this.stopLayer = stopLayer;
    this.labelLayer = labelLayer;
    this.onStopSelect = onStopSelect;
    this.onRouteSelect = onRouteSelect;
    this.onBackgroundSelect = onBackgroundSelect;

    this.mapConfig = mapConfig || {};
    this.zoom = Number(this.mapConfig.defaultZoom || 1);
    this.minZoom = Number(this.mapConfig.minZoom || 0.8);
    this.maxZoom = Number(this.mapConfig.maxZoom || 2.4);
    this.panX = Number(this.mapConfig.defaultPanX || 0);
    this.panY = Number(this.mapConfig.defaultPanY || 0);

    this.lines = [];
    this.stops = [];
    this.stopById = {};
    this.selectedRegionId = null;
    this.selectedStopId = null;
    this.compareStopId = null;
    this.selectedRouteId = null;
    this.filters = null;
    this.mapMode = "stylized";
    this.favoriteStopIds = new Set();

    this.dragState = {
      active: false,
      pointerId: null,
      x: 0,
      y: 0
    };

    this.attachPanAndZoom();
  }

  setControls({ zoomInButton, zoomOutButton, resetButton }) {
    zoomInButton?.addEventListener("click", () => this.updateZoom(this.zoom * 1.12));
    zoomOutButton?.addEventListener("click", () => this.updateZoom(this.zoom * 0.9));
    resetButton?.addEventListener("click", () => this.resetCamera());
  }

  setData({ lines, stops }) {
    this.lines = lines || [];
    this.stops = stops || [];
    this.stopById = Object.fromEntries(this.stops.map((stop) => [stop.id, stop]));
    this.render();
  }

  updateState({ selectedRegionId, selectedStopId, compareStopId, selectedRouteId, filters, mapMode, favoriteStopIds }) {
    this.selectedRegionId = selectedRegionId || null;
    this.selectedStopId = selectedStopId || null;
    this.compareStopId = compareStopId || null;
    this.selectedRouteId = selectedRouteId || null;
    this.filters = filters || null;
    this.mapMode = mapMode || "stylized";
    this.favoriteStopIds = new Set(favoriteStopIds || []);
    this.render();
  }

  getRegionLines() {
    return this.selectedRegionId ? this.lines.filter((line) => line.region === this.selectedRegionId) : this.lines;
  }

  getRegionStops() {
    return this.selectedRegionId ? this.stops.filter((stop) => stop.region === this.selectedRegionId) : this.stops;
  }

  shouldShowLabel(stop) {
    if (stop.id === this.selectedStopId || stop.id === this.compareStopId) {
      return true;
    }

    if (this.mapMode === "connections") {
      return isMajorStop(stop) || this.favoriteStopIds.has(stop.id);
    }

    if (this.mapMode === "corridor") {
      return isMajorStop(stop);
    }

    return isMajorStop(stop);
  }

  renderConnectionLinks() {
    if (!this.selectedStopId || this.mapMode !== "connections") {
      return;
    }

    const selected = this.stopById[this.selectedStopId];
    if (!selected) {
      return;
    }

    const nearby = (selected.nearbyStopIds || []).map((id) => this.stopById[id]).filter(Boolean);
    nearby.forEach((stop) => {
      const link = createSvgElement("line", {
        x1: String(selected.map.x),
        y1: String(selected.map.y),
        x2: String(stop.map.x),
        y2: String(stop.map.y)
      });
      link.classList.add("map-link-line");
      this.labelLayer.append(link);
    });
  }

  render() {
    if (!this.lineLayer || !this.stopLayer || !this.labelLayer) {
      return;
    }

    this.svg?.setAttribute("data-map-mode", this.mapMode);

    this.lineLayer.innerHTML = "";
    this.stopLayer.innerHTML = "";
    this.labelLayer.innerHTML = "";

    const visibleLines = this.getRegionLines();
    const visibleStops = this.getRegionStops();

    visibleLines.forEach((line) => {
      if (this.mapMode === "corridor" && line.layer === "secondary" && !this.selectedRouteId) {
        return;
      }

      const points = (line.path || []).map((point) => `${point.x},${point.y}`).join(" ");
      const isSelected = this.selectedRouteId ? line.routeIds?.includes(this.selectedRouteId) : false;
      const modeVisible = modePassesFilter(line.mode, this.filters);
      const mutedByRoute = this.selectedRouteId ? !isSelected : false;
      const muted = mutedByRoute || !modeVisible;

      const polyline = createSvgElement("polyline", {
        points,
        tabindex: "0",
        role: "button",
        "aria-label": `${line.name} line`
      });

      polyline.classList.add("map-line", `line-${line.id}`, `mode-${line.mode}`);
      polyline.style.stroke = line.color;

      if (line.layer) {
        polyline.dataset.layer = line.layer;
      }

      if (isSelected) {
        polyline.classList.add("selected");
      }
      if (muted) {
        polyline.classList.add("muted");
      }

      polyline.addEventListener("click", () => this.onRouteSelect?.(line.routeIds?.[0] || null));
      polyline.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.onRouteSelect?.(line.routeIds?.[0] || null);
        }
      });

      this.lineLayer.append(polyline);
    });

    this.renderConnectionLinks();

    visibleStops.forEach((stop) => {
      if (!stopPassesFilter(stop, this.filters)) {
        return;
      }

      const group = createSvgElement("g", {
        transform: `translate(${stop.map.x}, ${stop.map.y})`,
        tabindex: "0",
        role: "button",
        "aria-label": `${stop.name} stop`
      });
      group.classList.add("map-stop", `importance-${stop.importance || "local"}`);

      const selected = this.selectedStopId === stop.id;
      const compare = this.compareStopId === stop.id;
      const favorite = this.favoriteStopIds.has(stop.id);
      const relatedToRoute = this.selectedRouteId ? stop.routes?.includes(this.selectedRouteId) : true;

      if (selected) {
        group.classList.add("selected");
      }
      if (compare) {
        group.classList.add("compare");
      }
      if (favorite) {
        group.classList.add("favorite");
      }
      if (!relatedToRoute) {
        group.classList.add("muted");
      }

      const radius = stop.importance === "major" ? 8 : 6;
      const hitTarget = createSvgElement("circle", {
        cx: "0",
        cy: "0",
        r: `${Math.max(14, radius + 8)}`
      });
      hitTarget.classList.add("stop-hit");
      group.append(hitTarget);

      const core = createSvgElement("circle", {
        cx: "0",
        cy: "0",
        r: `${radius}`
      });
      core.classList.add("stop-core");

      if (stop.modes?.includes("tram")) {
        core.classList.add("has-tram");
      }
      if (stop.type === "interchange" || stop.modes?.includes("interchange")) {
        core.classList.add("is-interchange");
      }

      group.append(core);

      if (isMajorStop(stop)) {
        const ring = createSvgElement("circle", {
          cx: "0",
          cy: "0",
          r: `${radius + 5}`
        });
        ring.classList.add("stop-ring");
        group.append(ring);
      }

      if (favorite) {
        const fav = createSvgElement("circle", {
          cx: "0",
          cy: "0",
          r: `${radius + 10}`
        });
        fav.classList.add("stop-favorite-ring");
        group.append(fav);
      }

      const title = createSvgElement("title");
      title.textContent = stop.name;
      group.append(title);

      const selectStop = () => this.onStopSelect?.(stop.id);
      group.addEventListener("click", selectStop);
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectStop();
        }
      });

      this.stopLayer.append(group);

      if (this.shouldShowLabel(stop)) {
        const label = createSvgElement("text", {
          x: `${stop.map.x + 14}`,
          y: `${stop.map.y - 10}`
        });
        label.classList.add("map-label");
        if (selected) {
          label.classList.add("selected");
        }
        if (compare) {
          label.classList.add("compare");
        }
        label.textContent = stop.name;
        this.labelLayer.append(label);
      }
    });

    this.applyCamera();
  }

  attachPanAndZoom() {
    this.svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      this.updateZoom(this.zoom * factor);
    });

    this.svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      if (isInteractiveMapTarget(event.target)) {
        return;
      }
      this.dragState = {
        active: true,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
      this.svg.setPointerCapture(event.pointerId);
    });

    this.svg.addEventListener("pointermove", (event) => {
      if (!this.dragState.active || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      const viewBox = this.svg.viewBox.baseVal;
      const scaleX = viewBox.width / this.svg.clientWidth;
      const scaleY = viewBox.height / this.svg.clientHeight;

      const dx = event.clientX - this.dragState.x;
      const dy = event.clientY - this.dragState.y;

      this.panX += (dx * scaleX) / this.zoom;
      this.panY += (dy * scaleY) / this.zoom;

      this.dragState.x = event.clientX;
      this.dragState.y = event.clientY;

      this.applyCamera();
    });

    const endDrag = (event) => {
      if (event.pointerId !== this.dragState.pointerId) {
        return;
      }
      if (this.svg.hasPointerCapture(event.pointerId)) {
        this.svg.releasePointerCapture(event.pointerId);
      }
      this.dragState.active = false;
      this.dragState.pointerId = null;
    };

    this.svg.addEventListener("click", (event) => {
      if (!event.target.closest(".map-stop, .map-line")) {
        this.onBackgroundSelect?.();
      }
    });

    this.svg.addEventListener("pointerup", endDrag);
    this.svg.addEventListener("pointercancel", endDrag);
  }

  updateZoom(nextZoom) {
    this.zoom = clamp(nextZoom, this.minZoom, this.maxZoom);
    this.applyCamera();
  }

  resetCamera() {
    this.zoom = Number(this.mapConfig.defaultZoom || 1);
    this.panX = Number(this.mapConfig.defaultPanX || 0);
    this.panY = Number(this.mapConfig.defaultPanY || 0);
    this.applyCamera();
  }

  getCameraState() {
    return { zoom: this.zoom, panX: this.panX, panY: this.panY };
  }

  restoreCameraState(camera) {
    if (!camera) {
      return;
    }
    this.zoom = Number(camera.zoom || this.zoom);
    this.panX = Number(camera.panX || 0);
    this.panY = Number(camera.panY || 0);
    this.applyCamera();
  }

  applyCamera() {
    this.cameraLayer?.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
  }
}

export class MapView {
  constructor(options) {
    this.runtime = window.L && options?.mapElement ? new LeafletMapRuntime(options) : new SvgMapRuntime(options);
  }

  setControls(controls) {
    this.runtime.setControls(controls);
  }

  setData(data) {
    this.runtime.setData(data);
  }

  updateState(state) {
    this.runtime.updateState(state);
  }

  setVehicles(vehicles) {
    this.runtime.setVehicles?.(vehicles);
  }

  setUserLocation(location) {
    this.runtime.setUserLocation?.(location);
  }

  focusLocation(location, nearestStop) {
    this.runtime.focusLocation?.(location, nearestStop);
  }

  getCameraState() {
    return this.runtime.getCameraState?.() || null;
  }

  restoreCameraState(camera) {
    this.runtime.restoreCameraState?.(camera);
  }
}
