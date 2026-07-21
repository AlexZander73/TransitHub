(function bootstrapShell() {
  const THEME_STORAGE_KEY = "coastpulse.appearance.theme";
  const ICON_STORAGE_KEY = "coastpulse.appearance.icon";

  const themes = {
    "original-premium": {
      label: "Original Premium",
      description: "Pacific navy, crisp coastal teal, and focused map glass.",
      premium: false
    },
    aurora: {
      label: "Aurora",
      description: "A luminous night map with violet and electric-blue signals.",
      premium: true
    },
    "transit-motion": {
      label: "Transit Motion",
      description: "Bright civic surfaces, strong type, and coral movement cues.",
      premium: true
    },
    "coastline-explorer": {
      label: "Coastline Explorer",
      description: "Sunlit aqua, ocean blue, and confident Gold Coast character.",
      premium: true
    }
  };

  const icons = {
    "original-premium": {
      label: "Coastal Wave",
      asset: "./assets/img/icons/original-premium.png",
      nativeName: null,
      premium: false
    },
    aurora: {
      label: "Aurora Night",
      asset: "./assets/img/icons/aurora.png",
      nativeName: "AppIconAurora",
      premium: true
    },
    "transit-motion": {
      label: "Transit Motion",
      asset: "./assets/img/icons/transit-motion.png",
      nativeName: "AppIconTransitMotion",
      premium: true
    },
    "coastline-explorer": {
      label: "Coastline Explorer",
      asset: "./assets/img/icons/coastline-explorer.png",
      nativeName: "AppIconCoastlineExplorer",
      premium: true
    }
  };

  const storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Appearance still applies for this page when storage is unavailable.
      }
    }
  };

  const validChoice = (choices, value, fallback) => (choices[value] ? value : fallback);
  let activeTheme = validChoice(themes, storage.get(THEME_STORAGE_KEY), "original-premium");
  let activeIcon = validChoice(icons, storage.get(ICON_STORAGE_KEY), "original-premium");

  const updateIconLinks = () => {
    const icon = icons[activeIcon];
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
      link.href = icon.asset;
    });
  };

  const applyTheme = (themeId, { persist = true } = {}) => {
    activeTheme = validChoice(themes, themeId, "original-premium");
    document.documentElement.dataset.theme = activeTheme;
    document.documentElement.style.colorScheme = activeTheme === "aurora" ? "dark" : "light";
    if (persist) {
      storage.set(THEME_STORAGE_KEY, activeTheme);
    }
    window.dispatchEvent(new CustomEvent("coastpulse:appearance-change", { detail: { theme: activeTheme, icon: activeIcon } }));
    return activeTheme;
  };

  const applyIcon = (iconId, { persist = true } = {}) => {
    activeIcon = validChoice(icons, iconId, "original-premium");
    const resolvedAsset = new URL(icons[activeIcon].asset, document.baseURI).href;
    document.documentElement.dataset.appIcon = activeIcon;
    document.documentElement.style.setProperty("--app-icon-url", `url("${resolvedAsset}")`);
    updateIconLinks();
    if (persist) {
      storage.set(ICON_STORAGE_KEY, activeIcon);
    }
    window.dispatchEvent(new CustomEvent("coastpulse:appearance-change", { detail: { theme: activeTheme, icon: activeIcon } }));
    return activeIcon;
  };

  const applyNativeIcon = async (iconId) => {
    const selected = validChoice(icons, iconId, "original-premium");
    const plugin = window.Capacitor?.Plugins?.CoastPulseAppearanceNative;
    if (!plugin?.setAlternateIcon) {
      return { native: false, icon: selected };
    }

    await plugin.setAlternateIcon({ name: icons[selected].nativeName });
    return { native: true, icon: selected };
  };

  window.CoastPulseAppearance = {
    themes,
    icons,
    getTheme: () => activeTheme,
    getIcon: () => activeIcon,
    setTheme: applyTheme,
    setIcon: applyIcon,
    setNativeIcon: applyNativeIcon
  };

  applyTheme(activeTheme, { persist: false });
  applyIcon(activeIcon, { persist: false });
  document.documentElement.classList.add("appearance-ready");

  const isCapacitor = Boolean(window.Capacitor);
  const navItems = [
    {
      href: "./index.html",
      page: "index.html",
      label: "Map",
      icon: '<path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"></path><path d="M9 3v15"></path><path d="M15 6v15"></path>'
    },
    {
      href: "./stops.html",
      page: "stops.html",
      label: "Stops",
      icon: '<path d="M12 21s6-5.2 6-11a6 6 0 0 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2"></circle>'
    },
    {
      href: "./routes.html",
      page: "routes.html",
      label: "Routes",
      icon: '<path d="M4 17c4-8 12 0 16-8"></path><path d="M4 7c4 8 12 0 16 8"></path>'
    },
    {
      href: "./alerts.html",
      page: "alerts.html",
      label: "Alerts",
      icon: '<path d="M12 3 2 20h20L12 3Z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>'
    },
    {
      href: "./about.html",
      pages: ["about.html", "data.html", "how-it-works.html"],
      label: "More",
      icon: '<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>'
    }
  ];

  document.documentElement.classList.toggle("is-capacitor", isCapacitor);

  const getCurrentPage = () => {
    const page = window.location.pathname.split("/").pop();
    return page || "index.html";
  };

  const navLink = (item, currentPage) => {
    const active = item.page === currentPage || item.pages?.includes(currentPage);
    return `<a href="${item.href}"${active ? ' class="active" aria-current="page"' : ""}>
      <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg>
      <span>${item.label}</span>
    </a>`;
  };

  const ensureBottomNav = () => {
    if (!document.body) {
      return;
    }

    document.body.classList.toggle("is-capacitor", isCapacitor);
    document.body.dataset.page = getCurrentPage().replace(/\.html$/, "");
    updateIconLinks();

    if (document.querySelector(".bottom-app-nav")) {
      return;
    }

    const shell = document.querySelector(".app-shell") || document.body;
    const nav = document.createElement("nav");
    nav.className = "bottom-app-nav";
    nav.setAttribute("aria-label", "Primary");
    nav.innerHTML = navItems.map((item) => navLink(item, getCurrentPage())).join("");
    shell.append(nav);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureBottomNav, { once: true });
  } else {
    ensureBottomNav();
  }

  const setAppViewportUnit = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--app-vh", `${vh}px`);
  };

  setAppViewportUnit();
  window.addEventListener("resize", setAppViewportUnit, { passive: true });
})();
