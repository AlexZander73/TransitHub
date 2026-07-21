const tipButtons = [...document.querySelectorAll("[data-tip-amount]")];
const tipCheckout = document.querySelector("#tip-checkout");
const shareButton = document.querySelector("#share-coastpulse");
const supportStatus = document.querySelector("#support-status");
const appearanceStatus = document.querySelector("#appearance-status");
const themeButtons = [...document.querySelectorAll("[data-theme-option]")];
const iconButtons = [...document.querySelectorAll("[data-icon-option]")];
const appearance = window.CoastPulseAppearance;

let selectedAmount = "7";
let tipJarUrl = "";
let premiumAppearanceEnabled = true;

function setStatus(message) {
  if (supportStatus) {
    supportStatus.textContent = message;
  }
}

function setAppearanceStatus(message) {
  if (appearanceStatus) {
    appearanceStatus.textContent = message;
  }
}

function renderAppearanceChoices() {
  if (!appearance) {
    return;
  }

  const selectedTheme = appearance.getTheme();
  const selectedIcon = appearance.getIcon();

  themeButtons.forEach((button) => {
    const theme = appearance.themes[button.dataset.themeOption];
    const selected = button.dataset.themeOption === selectedTheme;
    const locked = Boolean(theme?.premium && !premiumAppearanceEnabled);
    button.classList.toggle("selected", selected);
    button.classList.toggle("is-locked", locked);
    button.setAttribute("aria-checked", String(selected));
    button.setAttribute("aria-disabled", String(locked));
  });

  iconButtons.forEach((button) => {
    const icon = appearance.icons[button.dataset.iconOption];
    const selected = button.dataset.iconOption === selectedIcon;
    const locked = Boolean(icon?.premium && !premiumAppearanceEnabled);
    button.classList.toggle("selected", selected);
    button.classList.toggle("is-locked", locked);
    button.setAttribute("aria-checked", String(selected));
    button.setAttribute("aria-disabled", String(locked));
  });
}

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!appearance) {
      return;
    }

    const themeId = button.dataset.themeOption;
    const theme = appearance.themes[themeId];
    if (theme?.premium && !premiumAppearanceEnabled) {
      setAppearanceStatus(`${theme.label} is part of CoastPulse Premium.`);
      return;
    }

    appearance.setTheme(themeId);
    renderAppearanceChoices();
    setAppearanceStatus(`${theme.label} theme applied.`);
  });
});

iconButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!appearance) {
      return;
    }

    const iconId = button.dataset.iconOption;
    const icon = appearance.icons[iconId];
    if (icon?.premium && !premiumAppearanceEnabled) {
      setAppearanceStatus(`${icon.label} is part of CoastPulse Premium.`);
      return;
    }

    appearance.setIcon(iconId);
    renderAppearanceChoices();
    setAppearanceStatus(`${icon.label} applied inside CoastPulse.`);

    try {
      const result = await appearance.setNativeIcon(iconId);
      if (result.native) {
        setAppearanceStatus(`${icon.label} is now your CoastPulse app icon.`);
      }
    } catch {
      setAppearanceStatus(`${icon.label} is selected here, but the Home Screen icon could not be changed.`);
    }
  });
});

function checkoutUrl() {
  return tipJarUrl ? tipJarUrl.replace("{amount}", selectedAmount) : "#";
}

function updateTipCheckout() {
  if (!tipCheckout) {
    return;
  }

  if (!tipJarUrl) {
    tipCheckout.href = "#";
    tipCheckout.textContent = "Tip link coming soon";
    tipCheckout.classList.add("is-unavailable");
    tipCheckout.setAttribute("aria-disabled", "true");
    return;
  }

  tipCheckout.href = checkoutUrl();
  tipCheckout.textContent = `Leave a $${selectedAmount} tip`;
  tipCheckout.classList.remove("is-unavailable");
  tipCheckout.removeAttribute("aria-disabled");
  tipCheckout.target = "_blank";
  tipCheckout.rel = "noreferrer";
}

tipButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedAmount = button.dataset.tipAmount || "7";
    tipButtons.forEach((option) => {
      const selected = option === button;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    updateTipCheckout();
  });
});

tipCheckout?.addEventListener("click", (event) => {
  if (tipJarUrl) {
    return;
  }
  event.preventDefault();
  setStatus("The payment destination has not been connected yet.");
});

shareButton?.addEventListener("click", async () => {
  const shareData = {
    title: "CoastPulse Transit Atlas",
    text: "Explore Gold Coast and SEQ transit on CoastPulse.",
    url: new URL("./index.html", window.location.href).href
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      setStatus("Thanks for sharing CoastPulse.");
      return;
    }

    await navigator.clipboard.writeText(shareData.url);
    setStatus("Map link copied.");
  } catch (error) {
    if (error?.name !== "AbortError") {
      setStatus("Sharing is not available on this device.");
    }
  }
});

fetch("./data/config.json")
  .then((response) => (response.ok ? response.json() : null))
  .then((config) => {
    tipJarUrl = config?.support?.tipJarUrl?.trim() || "";
    premiumAppearanceEnabled = config?.premium?.appearancePreviewEnabled !== false;
    renderAppearanceChoices();
    updateTipCheckout();
  })
  .catch(() => {
    renderAppearanceChoices();
    updateTipCheckout();
  });

renderAppearanceChoices();
