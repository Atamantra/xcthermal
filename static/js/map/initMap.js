// initMap.js
import { loadParaglidingSites } from './paraglidingSites.js';
import { debounce } from '../utils/debounce.js';

/**
 * Initializes the Mapbox map with terrain, paraglider icons, controls.
 * Does NOT set up application-specific click handlers.
 * @param {string} mapboxToken - Your Mapbox access token.
 * @returns {Promise<mapboxgl.Map>}
 */
export async function initMap(mapboxToken) {
  if (typeof mapboxgl === 'undefined') {
    console.error("Mapbox GL JS is not loaded. Please ensure the Mapbox GL JS script is included.");
    throw new Error("Mapbox GL JS not found.");
  }

  mapboxgl.accessToken = mapboxToken;

  // Check URL params for initial view
  const urlParams = new URLSearchParams(window.location.search);
  const latParam = parseFloat(urlParams.get('lat'));
  const lonParam = parseFloat(urlParams.get('lon'));
  const zoomParam = parseFloat(urlParams.get('zoom'));
  const pitchParam = parseFloat(urlParams.get('pitch'));
  const bearingParam = parseFloat(urlParams.get('bearing'));

  // Default to Ölüdeniz if params missing
  let center = [29.178, 36.531];
  let initialZoom = 10;
  let initialPitch = 60;
  let initialBearing = -20;

  // Priority: URL Params > User Saved State > Default
  if (!isNaN(latParam) && !isNaN(lonParam)) {
    center = [lonParam, latParam];
    if (!isNaN(zoomParam)) initialZoom = zoomParam;
    if (!isNaN(pitchParam)) initialPitch = pitchParam;
    if (!isNaN(bearingParam)) initialBearing = bearingParam;
  } else if (window.userLastState && window.userLastState.map_type === '2d') {
    // Restore saved state if available and compatible
    if (window.userLastState.lon && window.userLastState.lat) center = [window.userLastState.lon, window.userLastState.lat];
    if (window.userLastState.zoom) initialZoom = window.userLastState.zoom;
    if (window.userLastState.pitch) initialPitch = window.userLastState.pitch;
    if (window.userLastState.bearing) initialBearing = window.userLastState.bearing;
  }

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/satellite-streets-v12",
    center: center,
    zoom: initialZoom,
    pitch: initialPitch,
    bearing: initialBearing,
    antialias: true
  });

  // Save state on moveend
  map.on('moveend', debounce(async () => {
    if (!window.userIsAuthenticated) return;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    try {
      await fetch('/api/user/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: center.lat,
          lon: center.lng,
          zoom: zoom,
          pitch: pitch,
          bearing: bearing,
          map_type: '2d'
        })
      });
    } catch (e) {
      console.error("Failed to save map state:", e);
    }
  }, 2000)); // Debounce 2 seconds to avoid spamming while panning

  return new Promise((resolve, reject) => {
    map.on("load", () => {
      try {
        addControls(map);

        map.on('styledata', () => {
          loadParagliderIconAndSites(map);
          // Re-apply 3D terrain if it was enabled before a style change
          if (window._terrain3DEnabled) {
            const version = window.APP_VERSION_TIMESTAMP || Date.now();
            import(`./terrain3d.js?v=${version}`).then(m => m.enable3DMode(map)).catch(e => {
              console.warn('Failed to re-apply 3D terrain after style change:', e);
            });
          }
        });

        loadParagliderIconAndSites(map);

        window.currentMap = map;
        console.log("Map initialized and loaded successfully.");
        resolve(map);
      } catch (error) {
        console.error("Error during map setup on load:", error);
        reject(error);
      }
    });

    map.on("error", (e) => {
      console.error("Mapbox GL JS map error:", e.error);
      reject(e.error);
    });
  });
}

// 🏔️ 3D terrain is now managed by terrain3d.js (opt-in via the 3D toggle button)
// The old setupTerrain() auto-init has been removed to prevent Safari spikes.

// 🧭 Add zoom + geolocation controls
function addControls(map) {
  let navControlExists = false;
  map._controls.forEach(control => {
    if (control instanceof mapboxgl.NavigationControl) {
      navControlExists = true;
    }
  });

  if (!navControlExists) {
    map.addControl(new mapboxgl.NavigationControl({ showZoom: true }), "top-right");
  }

  let geolocateControlExists = false;
  map._controls.forEach(control => {
    if (control instanceof mapboxgl.GeolocateControl) {
      geolocateControlExists = true;
    }
  });

  if (!geolocateControlExists) {
    const geo = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      showAccuracyCircle: false,
      showUserLocation: true
    });
    map.addControl(geo, "top-right");
  }
}

// 🪂 Load paraglider icon and site data
function loadParagliderIconAndSites(map) {
  if (!map.hasImage("paraglider")) {
    map.loadImage("/static/paraglider.png", (error, image) => {
      if (error) {
        console.error("❌ Failed to load paraglider icon", error);
        return;
      }
      if (!map.hasImage('paraglider')) {
        map.addImage('paraglider', image);
      }
      loadParaglidingSites(map);
    });
  } else {
    loadParaglidingSites(map);
  }

  if (!map._hasMoveendReloadListener) {
    const debouncedReload = debounce(() => {
      loadParaglidingSites(map);
    }, 500);
    map.on("moveend", debouncedReload);
    map._hasMoveendReloadListener = true;
  }
}