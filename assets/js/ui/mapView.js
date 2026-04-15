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

function stopPassesFilter(stop, filters) {
  if (!filters) {
    return true;
  }

  const active = Object.entries(filters)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  if (!active.length) {
    return true;
  }

  return active.some((mode) => stop.modes.includes(mode));
}

function modePassesFilter(mode, filters) {
  if (!filters) {
    return true;
  }

  const active = Object.entries(filters)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  if (!active.length) {
    return true;
  }

  return active.includes(mode);
}

export class MapView {
  constructor({ svg, cameraLayer, lineLayer, stopLayer, labelLayer, onStopSelect, onRouteSelect, mapConfig }) {
    this.svg = svg;
    this.cameraLayer = cameraLayer;
    this.lineLayer = lineLayer;
    this.stopLayer = stopLayer;
    this.labelLayer = labelLayer;
    this.onStopSelect = onStopSelect;
    this.onRouteSelect = onRouteSelect;

    this.mapConfig = mapConfig || {};
    this.zoom = Number(this.mapConfig.defaultZoom || 1);
    this.minZoom = Number(this.mapConfig.minZoom || 0.8);
    this.maxZoom = Number(this.mapConfig.maxZoom || 2.4);
    this.panX = 0;
    this.panY = 0;

    this.lines = [];
    this.stops = [];
    this.selectedStopId = null;
    this.selectedRouteId = null;
    this.filters = null;

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
    this.render();
  }

  updateState({ selectedStopId, selectedRouteId, filters }) {
    this.selectedStopId = selectedStopId || null;
    this.selectedRouteId = selectedRouteId || null;
    this.filters = filters || null;
    this.render();
  }

  render() {
    this.lineLayer.innerHTML = "";
    this.stopLayer.innerHTML = "";
    this.labelLayer.innerHTML = "";

    this.lines.forEach((line) => {
      const points = (line.path || []).map((point) => `${point.x},${point.y}`).join(" ");
      const isSelected = this.selectedRouteId ? line.routeIds?.includes(this.selectedRouteId) : false;
      const modeVisible = modePassesFilter(line.mode, this.filters);
      const muted = this.selectedRouteId ? !isSelected : !modeVisible;

      const polyline = createSvgElement("polyline", {
        points,
        tabindex: "0",
        role: "button",
        "aria-label": `${line.name} line`
      });

      polyline.classList.add("map-line", `line-${line.id}`, `mode-${line.mode}`);
      polyline.style.stroke = line.color;
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

    this.stops.forEach((stop) => {
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

      if (this.selectedStopId === stop.id) {
        group.classList.add("selected");
      }

      if (this.selectedRouteId && !stop.routes.includes(this.selectedRouteId)) {
        group.classList.add("muted");
      }

      const radius = stop.importance === "major" ? 8 : 6;
      const core = createSvgElement("circle", {
        cx: "0",
        cy: "0",
        r: `${radius}`
      });
      core.classList.add("stop-core");

      if (stop.modes.includes("tram")) {
        core.classList.add("has-tram");
      }
      if (stop.modes.includes("interchange")) {
        core.classList.add("is-interchange");
      }

      group.append(core);

      if (stop.importance === "major") {
        const ring = createSvgElement("circle", {
          cx: "0",
          cy: "0",
          r: `${radius + 5}`
        });
        ring.classList.add("stop-ring");
        group.append(ring);
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

      if (stop.importance === "major" || stop.id === this.selectedStopId) {
        const label = createSvgElement("text", {
          x: `${stop.map.x + 14}`,
          y: `${stop.map.y - 10}`
        });
        label.classList.add("map-label");
        if (stop.id === this.selectedStopId) {
          label.classList.add("selected");
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
      this.dragState.active = false;
      this.dragState.pointerId = null;
    };

    this.svg.addEventListener("pointerup", endDrag);
    this.svg.addEventListener("pointercancel", endDrag);
  }

  updateZoom(nextZoom) {
    this.zoom = clamp(nextZoom, this.minZoom, this.maxZoom);
    this.applyCamera();
  }

  resetCamera() {
    this.zoom = Number(this.mapConfig.defaultZoom || 1);
    this.panX = 0;
    this.panY = 0;
    this.applyCamera();
  }

  applyCamera() {
    this.cameraLayer.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
  }
}
