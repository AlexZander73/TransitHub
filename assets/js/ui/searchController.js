import { escapeHtml } from "./templates.js";

function normalizeText(value = "") {
  return String(value).toLowerCase().trim();
}

function scoreMatch(text, query, startsBoostText = "") {
  if (!query) {
    return Number.POSITIVE_INFINITY;
  }

  const normalizedText = normalizeText(text);
  const normalizedBoost = normalizeText(startsBoostText || text);

  if (normalizedBoost.startsWith(query)) {
    return 0;
  }

  const index = normalizedText.indexOf(query);
  if (index >= 0) {
    return index + 1;
  }

  const tokens = query.split(/\s+/).filter(Boolean);
  const matched = tokens.filter((token) => normalizedText.includes(token)).length;
  if (!matched) {
    return Number.POSITIVE_INFINITY;
  }

  return 100 - matched;
}

function renderHint(text) {
  return `<div class="search-hint">${escapeHtml(text)}</div>`;
}

export class SearchController {
  constructor({ input, resultList, clearButton, onSelectStop, onSelectRoute, onSearchCommit, getRecentSearches }) {
    this.input = input;
    this.resultList = resultList;
    this.clearButton = clearButton;
    this.onSelectStop = onSelectStop;
    this.onSelectRoute = onSelectRoute;
    this.onSearchCommit = onSearchCommit;
    this.getRecentSearches = getRecentSearches || (() => []);

    this.stops = [];
    this.routes = [];
    this.context = {
      regionId: null,
      filters: null
    };
    this.results = [];
    this.activeIndex = -1;

    this.attachEvents();
  }

  setData({ stops, routes }) {
    this.stops = stops || [];
    this.routes = routes || [];
    this.renderResults(this.input?.value?.trim()?.toLowerCase() || "");
  }

  setContext(context = {}) {
    this.context = {
      ...this.context,
      ...context
    };
    this.renderResults(this.input?.value?.trim()?.toLowerCase() || "");
  }

  attachEvents() {
    this.input?.addEventListener("input", () => {
      this.renderResults(this.input.value.trim().toLowerCase());
    });

    this.input?.addEventListener("focus", () => {
      this.resultList.hidden = false;
      this.renderResults(this.input.value.trim().toLowerCase());
    });

    this.input?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.resultList.hidden = true;
        this.activeIndex = -1;
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveActive(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveActive(-1);
        return;
      }

      if (event.key === "Enter") {
        if (this.activeIndex >= 0 && this.results[this.activeIndex]) {
          event.preventDefault();
          this.selectResult(this.results[this.activeIndex]);
          return;
        }
        if (this.input.value.trim()) {
          this.onSearchCommit?.(this.input.value.trim());
        }
      }
    });

    this.clearButton?.addEventListener("click", () => {
      this.input.value = "";
      this.renderResults("");
      this.input.focus();
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search-shell")) {
        this.resultList.hidden = true;
      }
    });

    this.resultList?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-result-type]");
      if (!button) {
        return;
      }

      const type = button.dataset.resultType;
      if (type === "history") {
        const value = button.dataset.query || "";
        this.input.value = value;
        this.renderResults(value.toLowerCase());
        this.input.focus();
        return;
      }

      const result = {
        type,
        id: button.dataset.id,
        label: button.dataset.label
      };
      this.selectResult(result);
    });
  }

  moveActive(direction) {
    if (!this.results.length) {
      this.activeIndex = -1;
      return;
    }

    const max = this.results.length - 1;
    if (this.activeIndex < 0 && direction > 0) {
      this.activeIndex = 0;
    } else {
      this.activeIndex = Math.min(max, Math.max(0, this.activeIndex + direction));
    }

    this.resultList.querySelectorAll("button[data-result-type]").forEach((button, index) => {
      button.classList.toggle("active-result", index === this.activeIndex);
      if (index === this.activeIndex) {
        button.scrollIntoView({ block: "nearest" });
      }
    });
  }

  selectResult(result) {
    if (!result) {
      return;
    }

    if (result.type === "stop") {
      this.onSelectStop?.(result.id);
      this.onSearchCommit?.(result.label || result.id || "");
    }

    if (result.type === "route") {
      this.onSelectRoute?.(result.id);
      this.onSearchCommit?.(result.label || result.id || "");
    }

    this.resultList.hidden = true;
    this.activeIndex = -1;
  }

  renderResults(query) {
    if (!this.resultList) {
      return;
    }

    const regionId = this.context.regionId || null;
    const filters = this.context.filters || null;

    const filteredStops = this.stops.filter((stop) => {
      if (regionId && stop.region !== regionId) {
        return false;
      }
      if (!filters) {
        return true;
      }
      const activeModes = Object.entries(filters)
        .filter(([, enabled]) => enabled)
        .map(([mode]) => mode);
      if (!activeModes.length) {
        return true;
      }
      return activeModes.some((mode) => stop.modes?.includes(mode));
    });

    const filteredRoutes = this.routes.filter((route) => (regionId ? route.region === regionId : true));

    if (!query) {
      const history = this.getRecentSearches().slice(0, 6);
      if (!history.length) {
        this.resultList.innerHTML = renderHint("Search stop name, stop code, route number, or interchange.");
      } else {
        this.results = history.map((entry) => ({ type: "history", query: entry }));
        this.resultList.innerHTML = `<ul class="search-results">${history
          .map(
            (entry) => `<li>
              <button type="button" data-result-type="history" data-query="${escapeHtml(entry)}">
                <span>${escapeHtml(entry)}</span>
                <small>Recent search</small>
              </button>
            </li>`
          )
          .join("")}</ul>`;
      }
      this.resultList.hidden = false;
      return;
    }

    const stopResults = filteredStops
      .map((stop) => {
        const score = scoreMatch(`${stop.name} ${stop.code || ""} ${stop.suburb || ""}`, query, stop.name);
        if (!Number.isFinite(score)) {
          return null;
        }
        return {
          type: "stop",
          id: stop.id,
          label: stop.name,
          hint: `${stop.code || stop.id} · ${stop.suburb || stop.region}`,
          score
        };
      })
      .filter(Boolean);

    const routeResults = filteredRoutes
      .map((route) => {
        const score = scoreMatch(`${route.shortName} ${route.longName} ${route.mode}`, query, String(route.shortName));
        if (!Number.isFinite(score)) {
          return null;
        }
        return {
          type: "route",
          id: route.id,
          label: `Route ${route.shortName}`,
          hint: route.longName,
          score
        };
      })
      .filter(Boolean);

    const merged = [...stopResults, ...routeResults]
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((item) => ({ ...item }));

    this.results = merged;
    this.activeIndex = -1;

    if (!merged.length) {
      this.resultList.innerHTML = renderHint("No matching stops or routes.");
      this.resultList.hidden = false;
      return;
    }

    this.resultList.innerHTML = `<ul class="search-results">${merged
      .map(
        (item) => `<li>
          <button type="button" data-result-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}" data-label="${escapeHtml(
            item.label
          )}">
            <span>${escapeHtml(item.label)}</span>
            <small>${escapeHtml(item.hint)}</small>
          </button>
        </li>`
      )
      .join("")}</ul>`;

    this.resultList.hidden = false;
  }
}
