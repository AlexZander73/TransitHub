import { escapeHtml } from "./templates.js";

function rankByPrefix(a, query, text) {
  return text.startsWith(query) ? a - 1 : a;
}

export class SearchController {
  constructor({ input, resultList, clearButton, onSelectStop, onSelectRoute }) {
    this.input = input;
    this.resultList = resultList;
    this.clearButton = clearButton;
    this.onSelectStop = onSelectStop;
    this.onSelectRoute = onSelectRoute;

    this.stops = [];
    this.routes = [];

    this.attachEvents();
  }

  setData({ stops, routes }) {
    this.stops = stops || [];
    this.routes = routes || [];
    this.renderResults("");
  }

  attachEvents() {
    this.input.addEventListener("input", () => {
      this.renderResults(this.input.value.trim().toLowerCase());
    });

    this.input.addEventListener("focus", () => {
      this.resultList.hidden = false;
      this.renderResults(this.input.value.trim().toLowerCase());
    });

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.resultList.hidden = true;
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

    this.resultList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-result-type]");
      if (!button) {
        return;
      }
      const type = button.dataset.resultType;
      const id = button.dataset.id;
      if (type === "stop") {
        this.onSelectStop?.(id);
      } else if (type === "route") {
        this.onSelectRoute?.(id);
      }
      this.resultList.hidden = true;
    });
  }

  renderResults(query) {
    if (!query) {
      this.resultList.innerHTML = `<div class="search-hint">Search stop name, stop code, or route.</div>`;
      this.resultList.hidden = false;
      return;
    }

    const stopResults = this.stops
      .map((stop) => {
        const text = `${stop.name} ${stop.code || ""}`.toLowerCase();
        if (!text.includes(query)) {
          return null;
        }
        let score = text.indexOf(query);
        score = rankByPrefix(score, query, stop.name.toLowerCase());
        return { type: "stop", id: stop.id, label: stop.name, hint: stop.code || stop.id, score };
      })
      .filter(Boolean);

    const routeResults = this.routes
      .map((route) => {
        const text = `${route.shortName} ${route.longName}`.toLowerCase();
        if (!text.includes(query)) {
          return null;
        }
        let score = text.indexOf(query);
        score = rankByPrefix(score, query, String(route.shortName).toLowerCase());
        return {
          type: "route",
          id: route.id,
          label: `Route ${route.shortName}`,
          hint: route.longName,
          score
        };
      })
      .filter(Boolean);

    const merged = [...stopResults, ...routeResults].sort((a, b) => a.score - b.score).slice(0, 10);

    if (!merged.length) {
      this.resultList.innerHTML = `<div class="search-hint">No matching stops or routes.</div>`;
      this.resultList.hidden = false;
      return;
    }

    this.resultList.innerHTML = `<ul class="search-results">${merged
      .map(
        (item) => `<li>
          <button type="button" data-result-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">
            <span>${escapeHtml(item.label)}</span>
            <small>${escapeHtml(item.hint)}</small>
          </button>
        </li>`
      )
      .join("")}</ul>`;

    this.resultList.hidden = false;
  }
}
