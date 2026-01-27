export function setupGeocoder(map, onResult) {
  const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl,
    marker: false,
    placeholder: "Search location..."
  });

  const container = document.getElementById("geocoder-container");
  container.innerHTML = ""; // Ensure clean
  container.appendChild(geocoder.onAdd(map));

  const geocoderEl = container.querySelector(".mapboxgl-ctrl-geocoder");
  const inputEl = geocoderEl.querySelector('input[type="text"]');

  // Expand UI
  inputEl.addEventListener("focus", () => {
    geocoderEl.classList.add("expanded");
  });
  inputEl.addEventListener("blur", () => {
    if (!inputEl.value) geocoderEl.classList.remove("expanded");
  });

  geocoderEl.addEventListener("click", () => inputEl.focus());

  // Handle result
  geocoder.on("result", ({ result }) => {
    const [lon, lat] = result.geometry.coordinates;
    onResult(lat, lon);
  });
}
