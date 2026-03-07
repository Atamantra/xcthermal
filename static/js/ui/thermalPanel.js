export function setupThermalPanel(map) {
  const thermalBox = document.getElementById("thermalBox");
  const thermalHeader = document.getElementById("thermalHeader");
  const thermalImage = document.getElementById("thermalImage");
  const placeholder = document.getElementById("thermalPlaceholder");
  const modal = document.getElementById("imageModal");
  const modalImg = document.getElementById("modalImage");
  const modalClose = document.getElementById("modalClose");
  const statsButton = document.getElementById("statsButton");

  let loadTimeout;

  // Start collapsed
  if (thermalBox) {
    thermalBox.classList.add("collapsed");
    thermalBox.classList.remove("expanded");
  }

  // Toggle panel via header
  if (thermalHeader && thermalBox) {
    thermalHeader.addEventListener("click", () => {
      const isExpanded = thermalBox.classList.toggle("expanded");
      thermalBox.classList.toggle("collapsed", !isExpanded);
      thermalHeader.innerText = isExpanded
        ? "Thermal Forecast ▼"
        : "Thermal Forecast ▲";
    });
  }

  // Toggle panel via stats button
  if (statsButton && thermalBox) {
    statsButton.addEventListener("click", () => {
      const isExpanded = thermalBox.classList.toggle("expanded");
      thermalBox.classList.toggle("collapsed", !isExpanded);

      thermalHeader.innerText = isExpanded
        ? "Thermal Forecast ▼"
        : "Thermal Forecast ▲";

      if (isExpanded) {
        statsButton.classList.remove("glow");

        const imageLoaded = thermalImage?.complete && thermalImage.naturalWidth > 0;
        if (imageLoaded) {
          thermalImage.style.display = "block";
          placeholder.style.display = "none";
        } else {
          placeholder.innerText = "Click on a location to fetch data.";
          placeholder.style.display = "block";
          thermalImage.style.display = "none";
        }
      }
    });
  }

  // Observe changes in image src to show loader
  if (thermalImage) {
    // Initial state
    thermalImage.style.display = "none";
    thermalImage.style.opacity = 0;

    const observer = new MutationObserver(() => {
      if (thermalImage.src && thermalImage.style.display === "none") {
          if (placeholder) {
            placeholder.innerText = "📡 Fetching data, please wait...";
            placeholder.style.display = "block";
          }
          statsButton?.classList.remove("glow");
      }
    });

    observer.observe(thermalImage, {
      attributes: true,
      attributeFilter: ["src"]
    });
    
    // Note: onload and onclick are now handled in thermalService.js to ensure consistency.
  }

  modalClose?.addEventListener("click", () => modal.classList.add("hidden"));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  // Stats glow
  function setStatsButtonActive() {
    statsButton?.classList.add("glow");
  }

  // Expose globally if needed
  window.setStatsButtonActive = setStatsButtonActive;
}

// ✅ Exported separately so `main.js` can use it
export function expandThermalPanel() {
  const thermalBox = document.getElementById("thermalBox");
  const thermalHeader = document.getElementById("thermalHeader");
  const thermalImage = document.getElementById("thermalImage");
  const placeholder = document.getElementById("thermalPlaceholder");
  const statsButton = document.getElementById("statsButton");

  if (thermalBox && thermalHeader) {
    thermalBox.classList.add("expanded");
    thermalBox.classList.remove("collapsed");
    thermalHeader.innerText = "Thermal Forecast ▼";
  }

  const imageLoaded = thermalImage?.complete && thermalImage.naturalWidth > 0;

  if (imageLoaded) {
    thermalImage.style.display = "block";
    placeholder.style.display = "none";
  } else {
    placeholder.innerText = "📡 Fetching data, please wait...";
    placeholder.style.display = "block";
    thermalImage.style.display = "none";
  }

  statsButton?.classList.remove("glow");
}
