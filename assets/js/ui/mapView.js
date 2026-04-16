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

export class MapView {
  constructor({
    svg,
    cameraLayer,
    lineLayer,
    stopLayer,
    labelLayer,
    onStopSelect,
    onRouteSelect,
    onBackgroundSelect,
    mapConfig
  }) {
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

  applyCamera() {
    this.cameraLayer?.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
  }
}
