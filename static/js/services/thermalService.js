import { saveToHistory } from '../ui/history.js';

let lastFetch = 0;
const FETCH_INTERVAL_MS = 10000;
let marker;

/**
 * Called when the user clicks the map or uses geocoder.
 */
export async function placeMarkerAndFetch(map, lat, lon, asl) {
  if (Date.now() - lastFetch < FETCH_INTERVAL_MS) return;
  lastFetch = Date.now();

  console.log(`🗻 Altitude: ${asl}m`);

  // 📍 Drop or move marker
  if (!marker) {
    marker = new mapboxgl.Marker().setLngLat([lon, lat]).addTo(map);
  } else {
    marker.setLngLat([lon, lat]);
  }

  // 🖼️ Get thermal meteogram image
  const imageUrl = await updateThermalDiagram(lat, lon, asl);

  // ☀️ Get sun data
  const sun = await fetchSunData(lat, lon);

  // 🤖 Get current AI interpretation (if visible)
  const aiOutput = document.getElementById("aiOutput")?.innerHTML || "";

  // 📝 Save to history
  saveToHistory({
    lat,
    lon,
    asl,
    sun,
    label: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    aiOutput
  }, imageUrl);

  // 🤖 Show AI button
  const aiBtn = document.getElementById("aiToggleBtn");
  if (aiBtn) aiBtn.style.display = "block";
}

/**
 * Fetches and displays the thermal meteogram image from Flask API.
 */
export async function updateThermalDiagram(lat, lon, asl) {
  const thermalImage = document.getElementById("thermalImage");
  const thermalBox = document.getElementById("thermalBox");
  const thermalHeader = document.getElementById("thermalHeader");
  const placeholder = document.getElementById("thermalPlaceholder");
  const loader = document.getElementById("thermalLoader");
  const modal = document.getElementById("imageModal");
  const modalImg = document.getElementById("modalImage");
  const modalClose = document.getElementById("modalClose");

  try {
    if (loader) loader.classList.remove("hidden");
    if (thermalImage) thermalImage.style.display = "none";
    if (placeholder) placeholder.style.display = "none";

    // Use the proxy directly (app.py now streams the image)
    const imageUrl = `/api/thermal-image?lat=${lat}&lon=${lon}&asl=${asl}&t=${Date.now()}`; // Added timestamp to prevent caching issues

    if (thermalImage) {
      thermalImage.src = imageUrl;
      thermalImage.alt = "Thermal Forecast Meteogram";
      thermalImage.style.opacity = 0;
      thermalImage.style.transform = "scale(0.98)";

      thermalImage.onload = () => {
        if (thermalImage.naturalHeight > 0) {
          thermalImage.style.display = "block";
          thermalImage.style.opacity = 1;
          thermalImage.style.transform = "scale(1)";
          if (loader) loader.classList.add("hidden");
          if (placeholder) placeholder.style.display = "none";

          // 📸 Click to expand modal
          thermalImage.onclick = () => {
            console.log("Thermal image clicked - opening modal");
            const modal = document.getElementById("imageModal");
            const modalImg = document.getElementById("modalImage");
            if (modal && modalImg) {
              modal.classList.remove("hidden");
              // Explicitly force display and opacity for redundancy
              modal.style.display = 'flex';
              modal.style.opacity = '1';
              modalImg.src = thermalImage.src;
              console.log("Modal opened. Z-Index should be MAX.");
            } else {
              console.error("Modal elements not found!");
            }
          };

          // ❌ Close modal
          if (modal && !modal.dataset.closeAttached) {
            modalClose.addEventListener("click", () => modal.classList.add("hidden"));
            modal.addEventListener("click", (e) => {
              if (e.target === modal) modal.classList.add("hidden");
            });
            modal.dataset.closeAttached = "true";
          }
        } else {
          fallbackToPlaceholder();
        }
      };

      thermalImage.onerror = fallbackToPlaceholder;
    }

    thermalBox.classList.add("expanded");
    thermalHeader.innerText = "Thermal Forecast ▼";

    return imageUrl;
  } catch (err) {
    console.error("Error fetching thermal meteogram:", err);
    fallbackToPlaceholder();
    return null;
  }

  function fallbackToPlaceholder() {
    if (thermalImage) thermalImage.style.display = "none";
    if (loader) loader.classList.add("hidden");
    if (placeholder) placeholder.style.display = "block";
  }
}

/**
 * POSTs to backend to get sun azimuth, altitude, etc.
 */
async function fetchSunData(lat, lon) {
  try {
    const res = await fetch("/api/sun-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon })
    });

    const json = await res.json();
    return json.received || {};
  } catch (err) {
    console.warn("Failed to fetch sun data. Using fallback.");
    return {
      azimuth: 135,
      altitude: 45,
      sunrise: "05:30",
      sunset: "20:15"
    };
  }
}
