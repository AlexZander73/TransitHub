(function bootstrapShell() {
  const isCapacitor = Boolean(window.Capacitor);

  document.documentElement.classList.toggle("is-capacitor", isCapacitor);

  const applyBodyClass = () => {
    if (!document.body) {
      return;
    }
    document.body.classList.toggle("is-capacitor", isCapacitor);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBodyClass, { once: true });
  } else {
    applyBodyClass();
  }

  const setAppViewportUnit = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--app-vh", `${vh}px`);
  };

  setAppViewportUnit();
  window.addEventListener("resize", setAppViewportUnit, { passive: true });
})();
