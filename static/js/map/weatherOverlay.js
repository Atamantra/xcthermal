/**
 * weatherOverlay.js — Wind Particle Overlay Toggle + Time Slider
 * 
 * Simple on/off toggle for animated wind particles using MapTiler Weather.
 * Overlays a transparent MapTiler map on top of the existing Mapbox map.
 * Button sits underneath the 3D toggle, same styling. No expandables.
 * 
 * When toggled on, a compact time slider appears to scrub through
 * ~5 days of wind forecast data.
 * 
 * Auto-disables in 3D mode (pitch > 0) and when zoomed out beyond MIN_ZOOM.
 * MapTiler SDK + Weather scripts are loaded dynamically on first toggle.
 */

const MAPTILER_KEY = 'knmDUcn7TkywtSuRpScw';
const MIN_ZOOM = 4;
const FORECAST_HOURS = 120; // 5 days
const SDK_URL = 'https://cdn.maptiler.com/maptiler-sdk-js/v2.3.0/maptiler-sdk.umd.min.js';
const SDK_CSS = 'https://cdn.maptiler.com/maptiler-sdk-js/v2.3.0/maptiler-sdk.css';
const WEATHER_URL = 'https://cdn.maptiler.com/maptiler-weather/v2.0.0/maptiler-weather.umd.min.js';

let overlayMap = null;
let overlayDiv = null;
let windLayer = null;
let isActive = false;
let syncHandler = null;
let zoomHandler = null;
let pitchHandler = null;
let scriptsLoaded = false;
let scriptsLoading = false;
let windBtn = null;
let sliderContainer = null;

/** Dynamically load MapTiler SDK + Weather scripts */
function loadMapTilerScripts() {
    return new Promise((resolve, reject) => {
        if (scriptsLoaded) return resolve();
        if (scriptsLoading) {
            const check = setInterval(() => {
                if (scriptsLoaded) { clearInterval(check); resolve(); }
            }, 100);
            return;
        }
        scriptsLoading = true;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = SDK_CSS;
        document.head.appendChild(link);

        const sdkScript = document.createElement('script');
        sdkScript.src = SDK_URL;
        sdkScript.onload = () => {
            const weatherScript = document.createElement('script');
            weatherScript.src = WEATHER_URL;
            weatherScript.onload = () => {
                scriptsLoaded = true;
                scriptsLoading = false;
                resolve();
            };
            weatherScript.onerror = (e) => { scriptsLoading = false; reject(e); };
            document.head.appendChild(weatherScript);
        };
        sdkScript.onerror = (e) => { scriptsLoading = false; reject(e); };
        document.head.appendChild(sdkScript);
    });
}

/** Create the time slider UI */
function createTimeSlider() {
    sliderContainer = document.createElement('div');
    sliderContainer.id = 'wind-time-slider';
    sliderContainer.style.cssText = `
        position: fixed;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        background: rgba(20, 20, 20, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-radius: 14px;
        padding: 10px 18px 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 280px;
        max-width: 90vw;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        border: 1px solid rgba(255,255,255,0.1);
        opacity: 0;
        transition: opacity 0.3s ease;
    `;

    const label = document.createElement('div');
    label.id = 'wind-time-label';
    label.style.cssText = 'color: #fff; font-size: 13px; font-weight: 600; letter-spacing: 0.3px;';
    label.textContent = 'Now';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'wind-time-range';
    slider.min = '0';
    slider.max = String(FORECAST_HOURS);
    slider.value = '0';
    slider.style.cssText = `
        width: 100%;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: linear-gradient(to right, #058ba0, #06b6d4, #67e8f9);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
    `;

    // Style the thumb
    const thumbCSS = document.createElement('style');
    thumbCSS.textContent = `
        #wind-time-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px; height: 16px;
            background: #fff;
            border-radius: 50%;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            cursor: pointer;
        }
        #wind-time-range::-moz-range-thumb {
            width: 16px; height: 16px;
            background: #fff;
            border-radius: 50%;
            border: none;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            cursor: pointer;
        }
    `;
    document.head.appendChild(thumbCSS);

    slider.oninput = () => {
        const hoursOffset = parseInt(slider.value, 10);
        const targetTime = new Date(Date.now() + hoursOffset * 3600 * 1000);

        // Update label
        if (hoursOffset === 0) {
            label.textContent = 'Now';
        } else {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const day = dayNames[targetTime.getDay()];
            const h = targetTime.getHours().toString().padStart(2, '0');
            const m = targetTime.getMinutes().toString().padStart(2, '0');
            label.textContent = `${day} ${h}:${m} (+${hoursOffset}h)`;
        }

        // Update wind layer time
        if (windLayer) {
            try {
                const unixSec = Math.floor(targetTime.getTime() / 1000);
                windLayer.setAnimationTime(unixSec);
            } catch (e) { console.warn('setAnimationTime error:', e); }
        }
    };

    sliderContainer.appendChild(label);
    sliderContainer.appendChild(slider);
    document.body.appendChild(sliderContainer);

    // Fade in
    requestAnimationFrame(() => { sliderContainer.style.opacity = '1'; });
}

function removeTimeSlider() {
    if (sliderContainer) {
        sliderContainer.style.opacity = '0';
        setTimeout(() => {
            if (sliderContainer) { sliderContainer.remove(); sliderContainer = null; }
        }, 300);
    }
}

function createOverlay(baseMap) {
    overlayDiv = document.createElement('div');
    overlayDiv.id = 'weather-overlay-map';
    overlayDiv.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:0;pointer-events:none;opacity:0;transition:opacity 0.5s ease;';

    const container = document.getElementById('map');
    container.style.position = 'relative';
    container.appendChild(overlayDiv);

    maptilersdk.config.apiKey = MAPTILER_KEY;
    const c = baseMap.getCenter();

    overlayMap = new maptilersdk.Map({
        container: overlayDiv,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': 'rgba(0,0,0,0)' } }] },
        center: [c.lng, c.lat],
        zoom: baseMap.getZoom(),
        pitch: 0,
        bearing: baseMap.getBearing(),
        interactive: false,
        attributionControl: false,
        navigationControl: false,
        geolocateControl: false,
        terrainControl: false,
        maptilerLogo: false
    });

    // Hide any controls MapTiler adds by default
    overlayMap.on('load', () => {
        const ctrlContainer = overlayDiv.querySelector('.maplibregl-control-container');
        if (ctrlContainer) ctrlContainer.style.display = 'none';
    });

    overlayMap.on('load', () => {
        try {
            windLayer = new maptilerweather.WindLayer({ id: 'wind', opacity: 0.5 });
            overlayMap.addLayer(windLayer);
        } catch (e) { console.error('WindLayer error:', e); }
    });

    syncHandler = () => {
        if (!overlayMap) return;
        const cc = baseMap.getCenter();
        overlayMap.jumpTo({ center: [cc.lng, cc.lat], zoom: baseMap.getZoom(), pitch: 0, bearing: baseMap.getBearing() });
    };
    baseMap.on('move', syncHandler);

    // Hide when zoomed out too far
    zoomHandler = () => {
        if (!overlayDiv) return;
        overlayDiv.style.opacity = baseMap.getZoom() < MIN_ZOOM ? '0' : '1';
    };
    baseMap.on('zoom', zoomHandler);

    // Auto-close when entering 3D mode (pitch > 0)
    pitchHandler = () => {
        if (baseMap.getPitch() > 0 && isActive) {
            deactivateWind(baseMap);
        }
    };
    baseMap.on('pitch', pitchHandler);

    // Show the time slider
    createTimeSlider();
}

function destroyOverlay(baseMap) {
    if (baseMap) {
        if (syncHandler) baseMap.off('move', syncHandler);
        if (zoomHandler) baseMap.off('zoom', zoomHandler);
        if (pitchHandler) baseMap.off('pitch', pitchHandler);
    }
    syncHandler = null;
    zoomHandler = null;
    pitchHandler = null;
    windLayer = null;
    if (overlayMap) { overlayMap.remove(); overlayMap = null; }
    if (overlayDiv) { overlayDiv.remove(); overlayDiv = null; }
    removeTimeSlider();
}

/** Deactivate wind overlay and reset button */
function deactivateWind(baseMap) {
    if (!isActive) return;
    if (overlayDiv) overlayDiv.style.opacity = '0';
    setTimeout(() => destroyOverlay(baseMap), 500);
    isActive = false;
    if (windBtn) {
        windBtn.style.background = '';
        windBtn.style.color = '#333';
    }
}

export function setupWeatherOverlay(baseMap) {
    class WindCtrl {
        onAdd() {
            this.div = document.createElement('div');
            this.div.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
            this.div.style.cssText = 'margin-top: 60px !important;';
            this.btn = document.createElement('button');
            this.btn.type = 'button';
            this.btn.className = 'map-style-toggle';
            this.btn.title = 'Toggle Wind';
            this.btn.id = 'weatherToggleBtn';
            this.btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2"/><path d="M12.59 19.41A2 2 0 1 0 14 16H2"/><path d="M17.74 7.34A2.99 2.99 0 1 1 20 12H2"/></svg>';
            this.btn.style.color = '#333';
            windBtn = this.btn;

            this.btn.onclick = async () => {
                if (isActive) {
                    deactivateWind(baseMap);
                } else {
                    // Flatten map to 2D for wind overlay
                    if (baseMap.getPitch() > 0) {
                        baseMap.easeTo({ pitch: 0, duration: 500 });
                        await new Promise(r => setTimeout(r, 600));
                    }
                    // Zoom in if too far out
                    if (baseMap.getZoom() < MIN_ZOOM) {
                        baseMap.easeTo({ zoom: MIN_ZOOM, duration: 500 });
                        await new Promise(r => setTimeout(r, 600));
                    }

                    // Load scripts on first use
                    try {
                        this.btn.style.opacity = '0.5';
                        await loadMapTilerScripts();
                        this.btn.style.opacity = '1';
                    } catch (e) {
                        console.error('Failed to load MapTiler scripts:', e);
                        this.btn.style.opacity = '1';
                        return;
                    }

                    createOverlay(baseMap);
                    requestAnimationFrame(() => {
                        if (overlayDiv && baseMap.getZoom() >= MIN_ZOOM) overlayDiv.style.opacity = '1';
                    });
                    isActive = true;
                    this.btn.style.background = 'rgba(5,139,160,0.8)';
                    this.btn.style.color = '#fff';
                }
            };

            this.div.appendChild(this.btn);
            return this.div;
        }
        onRemove() { this.div.remove(); }
    }

    baseMap.addControl(new WindCtrl(), 'top-right');
}
