(function bootstrapShell() {
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
      href: "./data.html",
      page: "data.html",
      label: "Data",
      icon: '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z"></path><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"></path><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>'
    }
  ];

  document.documentElement.classList.toggle("is-capacitor", isCapacitor);

  const getCurrentPage = () => {
    const page = window.location.pathname.split("/").pop();
    return page || "index.html";
  };

  const navLink = (item, currentPage) => {
    const active = item.page === currentPage;
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
