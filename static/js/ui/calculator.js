// Assumes turf is loaded globally via script tag in index.html
const turf = window.turf;
import { generateFAIOptimizationLayer } from './faiHelper.js';
import { FaiGeometry } from '../utils/faiGeometry.js';

let isActive = false;
let points = []; // Array of objects: { coords: [lng, lat], name: 'Start', type: 'cylinder', radius: 0.4 }
let markers = [];
const lineLayerId = 'calc-line-layer';
const lineSourceId = 'calc-line-source';
// Re-using common IDs for FAI sectors

// --- SETTINGS UI ---
let calcMode = 'triangle';
let showFaiSectors = true;

export function isCalculatorActive() {
    return isActive;
}

export function setupCalculator(map) {
    const calcBtn = document.getElementById('calculatorBtn');
    const calcPanel = document.getElementById('calculatorPanel');
    const closeBtn = document.getElementById('closeCalculatorBtn');
    const clearBtn = document.getElementById('clearCalculatorBtn');
    const uploadBtn = document.getElementById('uploadTrackBtn');
    const uploadInput = document.getElementById('trackUploadInput');
    const resultDiv = document.getElementById('calculatorResult');

    if (!calcBtn || !calcPanel) return;

    // Toggle Calculator Mode
    calcBtn.addEventListener('click', () => {
        isActive = !isActive;
        if (isActive) {
            calcPanel.style.display = 'block';
            calcBtn.classList.add('active');
            map.getCanvas().style.cursor = 'crosshair';
            renderSettingsUI(map);
            updateLine(map);
            updateUI(resultDiv, map);
        } else {
            disableCalculator(map);
        }
    });

    closeBtn.addEventListener('click', () => {
        disableCalculator(map);
    });

    clearBtn.addEventListener('click', () => {
        clearPoints(map);
        // Also clear uploaded track
        if (map.getLayer('uploaded-track-layer')) map.removeLayer('uploaded-track-layer');
        if (map.getSource('uploaded-track-source')) map.removeSource('uploaded-track-source');
        updateUI(resultDiv, map);
    });

    // Upload Handlers
    if (uploadBtn && uploadInput) {
        uploadBtn.addEventListener('click', () => uploadInput.click());
        uploadInput.addEventListener('change', (e) => handleFileUpload(e, map, resultDiv));
    }

    // Map Click Handler for Calculator
    map.on('click', (e) => {
        if (!isActive) return;
        addPoint(map, e.lngLat, resultDiv);
    });
}

// --- FILE PARSING & DISPLAY ---
function handleFileUpload(event, map, resultDiv) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const ext = file.name.split('.').pop().toLowerCase();
        let trackData = { coords: [], records: [] };

        try {
            if (ext === 'igc') trackData = parseIGC(content);
            else if (ext === 'gpx') trackData = parseGPX(content);
            else if (ext === 'kml') trackData = parseKML(content);
            else throw new Error("Unsupported format");

            if (trackData.coords.length < 2) throw new Error("No valid track points found.");

            displayUploadedTrack(map, trackData); // Pass full trackData object

            // Calculate stats
            const stats = calculateTrackStats(trackData);

            // Append stats to UI
            const statsHtml = renderTrackStatsHTML(file.name, stats);
            resultDiv.insertAdjacentHTML('beforeend', statsHtml);

            // Render Chart
            renderAltitudeChart(map, trackData.records);

        } catch (err) {
            alert("Error parsing file: " + err.message);
            console.error(err);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// --- ALTITUDE CHART ---
let altChartInstance = null;
let highlightPopup = null;
let highlightLabel = null;
let updateLabelFunc = null;

function renderAltitudeChart(map, records) {
    const container = document.getElementById('chartContainer');
    const canvas = document.getElementById('altitudeChart');
    const closeBtn = document.getElementById('closeChartBtn');

    if (!container || !canvas || records.length === 0) return;

    container.style.display = 'block';

    // Cleanup Helper
    const cleanupHighlight = () => {
        if (map.getLayer('chart-highlight-dot-layer')) map.removeLayer('chart-highlight-dot-layer');
        if (map.getLayer('chart-highlight-stem-layer')) map.removeLayer('chart-highlight-stem-layer');
        // Legacy layer cleanup
        if (map.getLayer('chart-highlight-layer')) map.removeLayer('chart-highlight-layer');

        if (map.getSource('chart-highlight-source')) map.removeSource('chart-highlight-source');
        if (highlightLabel) highlightLabel.remove();
        if (updateLabelFunc) map.off('render', updateLabelFunc);
    };

    // Close Handler
    closeBtn.onclick = () => {
        container.style.display = 'none';
        if (altChartInstance) altChartInstance.destroy();
        cleanupHighlight();
    };

    // Prepare Data
    const validRecords = records.filter(r => r.time && !isNaN(r.alt));
    const step = Math.ceil(validRecords.length / 500);
    const chartData = validRecords.filter((_, i) => i % step === 0).map(r => ({
        x: r.time,
        y: r.alt,
        lat: r.lat,
        lon: r.lon
    }));

    const labels = chartData.map(d => {
        const date = new Date(d.x);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const dataPoints = chartData.map(d => d.y);

    if (altChartInstance) altChartInstance.destroy();

    altChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Altitude (m)',
                data: dataPoints,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const point = chartData[idx];

                    if (point && point.lat && point.lon) {
                        const lngLat = { lng: point.lon, lat: point.lat };
                        const groundAlt = map.queryTerrainElevation(lngLat) || 0;

                        // Calculate Relative Height for Extrusion (Visual Height above ground)
                        // point.y is ASL. Extrusion adds to Ground.
                        // So Extrusion Height should be (ASL - Ground).
                        const relativeAlt = Math.max(0, point.y - groundAlt);

                        console.log(`Chart Click: ASL=${point.y}m, Ground=${groundAlt.toFixed(1)}m, Rel=${relativeAlt.toFixed(1)}m`);

                        // Fly to location
                        map.flyTo({
                            center: lngLat,
                            zoom: 14,
                            speed: 1.5,
                            pitch: 60
                        });

                        // 3D Floating Dot (Extrusion) + Stem
                        const radiusKm = 0.05; // 50m
                        const circlePoly = turf.circle([point.lon, point.lat], radiusKm, { steps: 16, units: 'kilometers' });

                        // Dot is +/- 20m around the target altitude
                        const dotTop = relativeAlt + 20;
                        const dotBase = Math.max(0, relativeAlt - 20);

                        const dotFeature = {
                            type: 'Feature',
                            properties: { h: dotTop, b: dotBase, subtype: 'dot' },
                            geometry: circlePoly.geometry
                        };

                        const stemFeature = {
                            type: 'Feature',
                            properties: { h: dotBase, b: 0, subtype: 'stem' },
                            geometry: circlePoly.geometry
                        };

                        const fc = {
                            type: 'FeatureCollection',
                            features: [dotFeature, stemFeature]
                        };

                        const sourceId = 'chart-highlight-source';
                        const dotLayerId = 'chart-highlight-dot-layer';
                        const stemLayerId = 'chart-highlight-stem-layer';

                        // Cleanup old layers
                        if (map.getLayer(dotLayerId)) map.removeLayer(dotLayerId);
                        if (map.getLayer(stemLayerId)) map.removeLayer(stemLayerId);
                        if (map.getSource(sourceId)) map.removeSource(sourceId);

                        map.addSource(sourceId, { type: 'geojson', data: fc });

                        // Safe layer ordering
                        let beforeId = null;
                        if (map.getLayer('calc-line-layer')) beforeId = 'calc-line-layer';
                        else if (map.getLayer('uploaded-track-line')) beforeId = 'uploaded-track-line';

                        map.addLayer({
                            id: stemLayerId,
                            type: 'fill-extrusion',
                            source: sourceId,
                            filter: ['==', 'subtype', 'stem'],
                            paint: {
                                'fill-extrusion-color': '#ffffff',
                                'fill-extrusion-height': ['get', 'h'],
                                'fill-extrusion-base': ['get', 'b'],
                                'fill-extrusion-opacity': 0.3
                            }
                        }, beforeId);

                        map.addLayer({
                            id: dotLayerId,
                            type: 'fill-extrusion',
                            source: sourceId,
                            filter: ['==', 'subtype', 'dot'],
                            paint: {
                                'fill-extrusion-color': '#ff0000',
                                'fill-extrusion-height': ['get', 'h'],
                                'fill-extrusion-base': ['get', 'b'],
                                'fill-extrusion-opacity': 0.9
                            }
                        }, beforeId);

                        // --- 3D LABEL IMPLEMENTATION ---
                        if (highlightLabel) highlightLabel.remove();
                        if (updateLabelFunc) map.off('render', updateLabelFunc);

                        highlightLabel = document.createElement('div');
                        highlightLabel.className = 'floating-label';
                        highlightLabel.style.cssText = `
                            position: absolute;
                            background: rgba(255, 255, 255, 0.9);
                            padding: 4px 8px;
                            border-radius: 4px;
                            border: 1px solid #3b82f6;
                            pointer-events: none;
                            transform: translate(-50%, -100%);
                            margin-top: -10px; 
                            font-family: sans-serif;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                            z-index: 10;
                            display: none; /* Hidden until positioned */
                        `;
                        highlightLabel.innerHTML = `
                            <div style="font-size:1.2em; font-weight:bold; color:#3b82f6;">${point.y}m</div>
                            <div style="color:#666; font-size:0.9em;">${new Date(point.x).toLocaleTimeString()}</div>
                        `;
                        map.getCanvasContainer().appendChild(highlightLabel);

                        // Use True Altitude (ASL) for projection + offset
                        const labelAltitude = point.y + 30;

                        updateLabelFunc = () => {
                            // Ensure map transform matrix is available
                            const t = map.transform;
                            // Use map.project for a safer 2D/3D fallback if manual matrix math fails or is unavailable
                            try {
                                const pos = map.project([lngLat.lng, lngLat.lat]); // Project ground position first
                                // Simple vertical offset for label
                                highlightLabel.style.transform = `translate(-50%, -100%) translate(${pos.x}px, ${pos.y - 15}px)`;
                                highlightLabel.style.display = 'block';
                            } catch (e) {
                                // Fallback or hide
                                highlightLabel.style.display = 'none';
                            }
                        };

                        map.on('render', updateLabelFunc);
                        // Trigger once
                        updateLabelFunc();
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Alt: ${ctx.raw}m`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 10 }
                },
                y: {
                    title: { display: true, text: 'Altitude (m)' }
                }
            }
        }
    });
}

function calculateTrackStats(data) {
    const { coords, records } = data;
    const line = turf.lineString(coords);
    const totalDistKm = turf.length(line, { units: 'kilometers' });

    let stats = {
        distance: totalDistKm,
        duration: 0,
        maxAlt: 0,
        minAlt: 9000,
        takeoffAlt: 0,
        maxClimb: 0,
        maxSink: 0,
        maxSpeed: 0,
        avgSpeed: 0,
        olcScore: totalDistKm * 1.0 // Default Open Distance
    };

    if (records.length > 0) {
        const start = records[0];
        const end = records[records.length - 1];

        // Time
        if (start.time && end.time) {
            stats.duration = (end.time - start.time) / 1000; // seconds
        }

        // Altitude
        const alts = records.map(r => r.alt).filter(a => !isNaN(a));
        if (alts.length > 0) {
            stats.maxAlt = Math.max(...alts);
            stats.minAlt = Math.min(...alts);
            stats.takeoffAlt = alts[0];
        }

        // Speed & Vario (Smoothing required)
        let maxSpeed = 0;
        let maxClimb = 0;
        let maxSink = 0;

        for (let i = 1; i < records.length; i++) {
            const p1 = records[i - 1];
            const p2 = records[i];
            const dt = (p2.time - p1.time) / 1000; // seconds
            if (dt > 0) {
                const distM = turf.distance(
                    [p1.lon, p1.lat],
                    [p2.lon, p2.lat],
                    { units: 'kilometers' }
                ) * 1000;

                const dAlt = p2.alt - p1.alt;

                const speedKmh = (distM / dt) * 3.6;
                const vario = dAlt / dt;

                if (speedKmh < 300) maxSpeed = Math.max(maxSpeed, speedKmh); // Filter spikes
                if (Math.abs(vario) < 20) { // Filter spikes
                    maxClimb = Math.max(maxClimb, vario);
                    maxSink = Math.min(maxSink, vario);
                }
            }
        }
        stats.maxSpeed = maxSpeed;
        stats.maxClimb = maxClimb;
        stats.maxSink = maxSink;
        stats.avgSpeed = (stats.distance / (stats.duration / 3600));

        // Simple OLC Check (Closing Loop)
        const distStartEnd = turf.distance(coords[0], coords[coords.length - 1], { units: 'kilometers' });
        if (distStartEnd < (stats.distance * 0.2)) {
            // It's a closed loop (roughly)
            // Check FAI 28% rule? (Hard on full track without simplification)
            // Assume Flat Triangle for now if closed
            stats.olcScore = stats.distance * 1.2;
        }
    }

    return stats;
}

function renderTrackStatsHTML(filename, stats) {
    const formatTime = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return `${h}h ${m}m`;
    };

    return `
        <div style="margin-top:10px; padding:10px; background:#f0f9ff; border-radius:6px; border:1px solid #bae6fd; font-size:0.9em;">
            <div style="font-weight:bold; color:#0369a1; margin-bottom:5px; border-bottom:1px solid #bae6fd; padding-bottom:3px;">
                ✈️ ${filename}
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <div><strong>Dist:</strong> ${stats.distance.toFixed(1)} km</div>
                <div><strong>OLC:</strong> ${stats.olcScore.toFixed(1)} pts</div>
                
                <div><strong>Time:</strong> ${formatTime(stats.duration)}</div>
                <div><strong>Avg Spd:</strong> ${stats.avgSpeed.toFixed(1)} km/h</div>
                
                <div><strong>Max Alt:</strong> ${stats.maxAlt}m</div>
                <div><strong>Gain:</strong> ${(stats.maxAlt - stats.minAlt).toFixed(0)}m</div>
                
                <div><strong>Max Climb:</strong> +${stats.maxClimb.toFixed(1)} m/s</div>
                <div><strong>Max Sink:</strong> ${stats.maxSink.toFixed(1)} m/s</div>
            </div>
        </div>`;
}

export function parseIGC(content) {
    const lines = content.split('\n');
    const coords = [];
    const records = [];
    const dateRecord = lines.find(l => l.startsWith('HFDTE')) || "";
    // HFDTEDDMMYY (e.g., HFDTE160623)
    let dateStr = "";
    if (dateRecord.length >= 11) dateStr = dateRecord.substring(5, 11);

    lines.forEach(line => {
        if (line.startsWith('B') && line.length >= 24) {
            try {
                // B HHMMSS DDMMmmmN DDDMMmmmE A PPPGG ...
                const timeStr = line.substring(1, 7);
                const latStr = line.substring(7, 15);
                const lonStr = line.substring(15, 24);
                const pressAltStr = line.substring(25, 30); // Pressure Alt
                const gpsAltStr = line.substring(30, 35);   // GPS Alt

                const latDeg = parseInt(latStr.substring(0, 2));
                const latMin = parseInt(latStr.substring(2, 7)) / 1000;
                let lat = latDeg + latMin / 60;
                if (latStr[7] === 'S') lat = -lat;

                const lonDeg = parseInt(lonStr.substring(0, 3));
                const lonMin = parseInt(lonStr.substring(3, 8)) / 1000;
                let lon = lonDeg + lonMin / 60;
                if (lonStr[8] === 'W') lon = -lon;

                const alt = parseInt(gpsAltStr, 10) || 0;
                const pAlt = parseInt(pressAltStr, 10) || 0;
                
                // Use GPS altitude if available, otherwise Pressure Altitude
                // Some loggers only record Pressure Altitude
                let finalAlt = alt;
                if (finalAlt === 0 && pAlt !== 0) finalAlt = pAlt;

                // Time parsing (UTC)
                // Needs date from header to be accurate, but relative time is fine for duration
                const h = parseInt(timeStr.substring(0, 2), 10);
                const m = parseInt(timeStr.substring(2, 4), 10);
                const s = parseInt(timeStr.substring(4, 6), 10);
                // Simple timestamp in seconds from midnight
                const timestamp = h * 3600 + m * 60 + s;
                // For real Date obj we need the date header, but this suffices for duration/speed calc within one day

                if (!isNaN(lat) && !isNaN(lon)) {
                    const coord = [lon, lat];
                    coords.push(coord);
                    records.push({
                        time: timestamp * 1000, // ms for compatibility
                        lat: lat,
                        lon: lon,
                        alt: finalAlt,
                        pressAlt: pAlt
                    });
                }
            } catch (e) { /* skip */ }
        }
    });
    console.log(`Parsed IGC: ${coords.length} points.`);
    return { coords, records };
}

export function parseGPX(content) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(content, "text/xml");
    const trkpts = xml.getElementsByTagName('trkpt');
    const coords = [];
    const records = [];

    for (let i = 0; i < trkpts.length; i++) {
        const lat = parseFloat(trkpts[i].getAttribute('lat'));
        const lon = parseFloat(trkpts[i].getAttribute('lon'));
        const ele = parseFloat(trkpts[i].getElementsByTagName('ele')[0]?.textContent) || 0;
        const timeStr = trkpts[i].getElementsByTagName('time')[0]?.textContent;
        const time = timeStr ? new Date(timeStr).getTime() : 0;

        if (!isNaN(lat) && !isNaN(lon)) {
            coords.push([lon, lat]);
            records.push({ time, lat, lon, alt: ele });
        }
    }
    return { coords, records };
}

export function parseKML(content) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(content, "text/xml");
    const coords = [];
    // Basic KML often lacks time/alt in a structured way for calc, returns coords only
    const coordinatesTags = xml.getElementsByTagName('coordinates');
    for (let i = 0; i < coordinatesTags.length; i++) {
        const txt = coordinatesTags[i].textContent.trim();
        const pairs = txt.split(/\s+/);
        pairs.forEach(pair => {
            const parts = pair.split(',');
            if (parts.length >= 2) {
                const lon = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);
                const alt = parseFloat(parts[2]) || 0;
                if (!isNaN(lat) && !isNaN(lon)) {
                    coords.push([lon, lat]);
                }
            }
        });
    }
    return { coords, records: [] }; // No time/alt records for KML simple parse
}

export function displayUploadedTrack(map, trackData) {
    const sourceId = 'uploaded-track-source';
    const layerIdLine = 'uploaded-track-line';
    const layerIdWall = 'uploaded-track-wall';

    // Clear old layers
    if (map.getLayer(layerIdLine)) map.removeLayer(layerIdLine);
    if (map.getLayer(layerIdWall)) map.removeLayer(layerIdWall);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    // If trackData is empty or coords missing, abort
    if (!trackData || !trackData.coords || trackData.coords.length === 0) {
        console.warn("displayUploadedTrack: No valid coordinates to display.");
        return;
    }

    // Safe access to coords
    // trackData.coords is array of [lon, lat, alt]
    // LineString expects [lon, lat] (or [lon, lat, alt] is fine for geojson but mapbox line is 2d)
    const coords2D = trackData.coords.map(c => [c[0], c[1]]);

    // 1. Prepare Line Data (2D Trace)
    const lineFeature = {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: coords2D
        }
    };

    // 2. Prepare Wall Data (3D Extrusion - Ribbon)
    const wallFeatures = [];
    const records = trackData.records;
    const ribbonWidthKm = 0.02; // ~20 meters total width (10m each side)

    if (records && records.length > 1) {
        console.log("Reshaping track with Turf ribbon (v2)...");
        // Pre-calculate Left/Right offsets for every point
        const leftPoints = [];
        const rightPoints = [];

        // Filter and sanitize records
        const validRecords = [];
        let lastValidParams = null; // {lat, lon}

        for (const r of records) {
            // Basic validity
            if (r.lat === undefined || r.lon === undefined || isNaN(r.lat) || isNaN(r.lon) ||
                r.alt === undefined || isNaN(r.alt) || r.alt < -500 || r.alt > 9000) {
                continue;
            }

            // Distance filter (remove points closer than 5m to previous)
            // This prevents erratic bearing calculations on hovering/slow movement
            if (lastValidParams) {
                const d = turf.distance(
                    [lastValidParams.lon, lastValidParams.lat],
                    [r.lon, r.lat],
                    { units: 'kilometers' }
                );
                if (d < 0.005) continue; // < 5 meters
            }

            validRecords.push(r);
            lastValidParams = r;
        }

        if (validRecords.length >= 2) {
            for (let i = 0; i < validRecords.length; i++) {
                const curr = validRecords[i];
                const currPt = [curr.lon, curr.lat];

                // Calculate bearing.
                let bearing = 0;

                // Safety for identical points
                const getSafeBearing = (p1, p2) => {
                    try {
                        return turf.bearing([p1.lon, p1.lat], [p2.lon, p2.lat]);
                    } catch (e) { return 0; }
                };

                if (i === 0) {
                    bearing = getSafeBearing(validRecords[i], validRecords[i + 1]);
                } else if (i === validRecords.length - 1) {
                    bearing = getSafeBearing(validRecords[i - 1], validRecords[i]);
                } else {
                    const prev = validRecords[i - 1];
                    const next = validRecords[i + 1];
                    const b1 = getSafeBearing(prev, curr);
                    const b2 = getSafeBearing(curr, next);

                    // Vector averaging for smooth transition
                    let sumX = Math.cos(b1 * Math.PI / 180) + Math.cos(b2 * Math.PI / 180);
                    let sumY = Math.sin(b1 * Math.PI / 180) + Math.sin(b2 * Math.PI / 180);

                    if (Math.abs(sumX) < 1e-6 && Math.abs(sumY) < 1e-6) {
                        bearing = b1; // Fallback to incoming
                    } else {
                        bearing = Math.atan2(sumY, sumX) * 180 / Math.PI;
                    }
                }

                // Offset -90 and +90 degrees relative to bearing
                const left = turf.destination(currPt, ribbonWidthKm / 2, bearing - 90);
                const right = turf.destination(currPt, ribbonWidthKm / 2, bearing + 90);

                leftPoints.push(left.geometry.coordinates);
                rightPoints.push(right.geometry.coordinates);
            }

            // Generate Polygons connecting i and i+1
            for (let i = 0; i < validRecords.length - 1; i++) {
                const nextIdx = i + 1;

                const p1 = validRecords[i];
                const p2 = validRecords[nextIdx];

                // Get terrain elevation for base (curtain effect)
                let t1 = 0;
                let t2 = 0;
                if (map.queryTerrainElevation) {
                    t1 = map.queryTerrainElevation([p1.lon, p1.lat]) || 0;
                    t2 = map.queryTerrainElevation([p2.lon, p2.lat]) || 0;
                }

                // Calculate RELATIVE height above ground (AGL) for Mapbox fill-extrusion
                // Mapbox adds the terrain height to these values automatically when terrain is enabled.
                
                const avgTerrain = (t1 + t2) / 2;
                const maxAlt = Math.max(p1.alt, p2.alt);
                
                // Height of the top of the curtain (AGL)
                let h_agl = maxAlt - avgTerrain;
                if (h_agl < 0) h_agl = 0; // Prevent negative height if track is underground

                // Base of the curtain (AGL) -> 0 means touching the ground
                const b_agl = 0; 

                // Simple generic color based on climb rate (vario)
                // We can calculate vario from p1 to p2
                const dt = (p2.time - p1.time) / 1000; // seconds
                const dAlt = p2.alt - p1.alt;
                let vario = 0;
                if (dt > 0) vario = dAlt / dt;
                
                // Color ramp: Blue (sink) -> Green (level) -> Red (climb)
                // New Requirement: Red (Gain) vs Green (Loss/Glide) only
                let color = '#22c55e'; // Green for sink/glide
                
                // If climbing (vario > 0.5 m/s threshold to ignore noise)
                if (vario > 0.5) {
                    color = '#ef4444'; // Red for climb
                }

                const poly = {
                    type: 'Feature',
                    properties: {
                        h: h_agl,
                        b: b_agl,
                        color: color,
                        type: 'wall'
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[
                            leftPoints[i],
                            rightPoints[i],
                            rightPoints[nextIdx],
                            leftPoints[nextIdx],
                            leftPoints[i]
                        ]]
                    }
                };
                wallFeatures.push(poly);
            }
        }
    }

    // 4. Add Source & Layers
    
    // Combine into FeatureCollection
    lineFeature.properties = { type: 'line' };
    
    // Add type property to walls
    wallFeatures.forEach(w => w.properties.type = 'wall');
    
    const allFeatures = [lineFeature, ...wallFeatures];

    const sourceData = {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: allFeatures
        }
    };

    if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(sourceData.data);
    } else {
        map.addSource(sourceId, sourceData);
    }

    // Add Layers if not exist
    if (!map.getLayer(layerIdLine)) {
        map.addLayer({
            id: layerIdLine,
            type: 'line',
            source: sourceId,
            filter: ['==', 'type', 'line'],
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#ff0077',
                'line-width': 4,
                'line-opacity': 0.8
            }
        });
    }

    if (!map.getLayer(layerIdWall)) {
        map.addLayer({
            id: layerIdWall,
            type: 'fill-extrusion',
            source: sourceId,
            filter: ['==', 'type', 'wall'],
            paint: {
                'fill-extrusion-color': ['get', 'color'],
                'fill-extrusion-height': ['get', 'h'],
                'fill-extrusion-base': ['get', 'b'],
                'fill-extrusion-opacity': 0.6
            }
        });
    }
}

function renderSettingsUI(map) {
    let settingsContainer = document.getElementById('calcSettingsPanel');
    if (!settingsContainer) {
        const panel = document.getElementById('calculatorPanel');
        const header = panel.querySelector('div');

        // Add Gear Icon to Header
        const gearBtn = document.createElement('button');
        gearBtn.innerHTML = '⚙️';
        gearBtn.title = "Settings";
        gearBtn.style.cssText = "background:none; border:none; cursor:pointer; font-size:16px; margin-right:5px;";
        gearBtn.onclick = () => {
            const sPanel = document.getElementById('calcSettingsPanel');
            sPanel.style.display = sPanel.style.display === 'none' ? 'block' : 'none';
        };
        header.insertBefore(gearBtn, header.childNodes[1]);

        // Create the Settings Div
        settingsContainer = document.createElement('div');
        settingsContainer.id = 'calcSettingsPanel';
        settingsContainer.style.cssText = "display:none; background:rgba(255,255,255,0.9); padding:10px; border-radius:8px; margin-bottom:10px; font-size:0.9em; backdrop-filter:blur(5px);";
        settingsContainer.innerHTML = `
            <div style="margin-bottom:8px;">
                <label style="cursor:pointer; display:flex; align-items:center;">
                    <input type="radio" name="calcMode" value="triangle" checked> 
                    <span style="margin-left:5px;">Triangle (Closed Loop)</span>
                </label>
                <label style="cursor:pointer; display:flex; align-items:center; margin-top:4px;">
                    <input type="radio" name="calcMode" value="route"> 
                    <span style="margin-left:5px;">Straight Line (Open)</span>
                </label>
            </div>
            <div style="border-top:1px solid #ccc; padding-top:8px; margin-top:8px;">
                <div style="margin-bottom:4px; font-weight:bold;">Calculation Model</div>
                <label style="cursor:pointer; display:flex; align-items:center;">
                    <input type="radio" name="calcModel" value="sphere" checked> 
                    <span style="margin-left:5px;">FAI Sphere (Cat 2)</span>
                </label>
                <label style="cursor:pointer; display:flex; align-items:center; margin-top:4px;">
                    <input type="radio" name="calcModel" value="wgs84"> 
                    <span style="margin-left:5px;">WGS84 Ellipsoid (Cat 1)</span>
                </label>
            </div>
            <div style="border-top:1px solid #ccc; padding-top:8px; margin-top:8px;">
                <label style="cursor:pointer; display:flex; align-items:center;">
                    <input type="checkbox" id="faiSectorsToggle" checked> 
                    <span style="margin-left:5px;">Show FAI Sectors 🎨</span>
                </label>
            </div>
        `;

        panel.insertBefore(settingsContainer, header.nextSibling);

        // Listeners
        settingsContainer.querySelectorAll('input[name="calcMode"]').forEach(r => {
            r.addEventListener('change', (e) => {
                calcMode = e.target.value;
                updateLine(map);
                updateUI(document.getElementById('calculatorResult'), map);
            });
        });

        settingsContainer.querySelectorAll('input[name="calcModel"]').forEach(r => {
            r.addEventListener('change', (e) => {
                // Use static import
                FaiGeometry.setMethod(e.target.value);
                updateLine(map);
                updateUI(document.getElementById('calculatorResult'), map);
            });
        });

        settingsContainer.querySelector('#faiSectorsToggle').addEventListener('change', (e) => {
            showFaiSectors = e.target.checked;
            updateLine(map);
        });
    }
}

function disableCalculator(map) {
    isActive = false;
    document.getElementById('calculatorPanel').style.display = 'none';
    document.getElementById('calculatorBtn').classList.remove('active');
    map.getCanvas().style.cursor = '';
    clearPoints(map);
}

function addPoint(map, lngLat, resultDiv) {
    if (points.length >= 10) {
        alert("Max 10 points for calculator.");
        return;
    }

    const index = points.length;
    let name = `TP ${index}`;
    if (index === 0) name = "Start / Launch";
    if (index > 0 && index === 9) name = "Goal"; // Heuristic

    const pointData = {
        coords: [lngLat.lng, lngLat.lat],
        name: name,
        type: 'cylinder',
        radius: 0.4
    };

    const markerEl = document.createElement('div');
    markerEl.className = 'custom-marker';
    markerEl.style.cssText = `
        width: 12px;
        height: 12px;
        background-color: #FFA500;
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.2);
    `;

    const marker = new mapboxgl.Marker({
        element: markerEl,
        draggable: true,
        anchor: 'center' // Centered exactly on the click
    })
        .setLngLat(lngLat)
        .addTo(map);

    // Add Label Popup or Element? 
    // Creating a custom HTML marker for label is better
    const el = document.createElement('div');
    el.className = 'point-label';
    el.innerText = name;
    el.style.cssText = `
        background: white; 
        padding: 2px 5px; 
        border-radius: 4px; 
        font-size: 10px; 
        font-weight: bold; 
        border: 1px solid #ccc;
        position: absolute;
        top: -25px;
        left: 50%;
        transform: translateX(-50%);
        pointer-events: none;
        white-space: nowrap;
        z-index: 10;
    `;
    marker.getElement().appendChild(el);

    marker.on('dragend', () => {
        const newPos = marker.getLngLat();
        const idx = markers.indexOf(marker);
        if (idx > -1) {
            points[idx].coords = [newPos.lng, newPos.lat];
            updateLine(map);
            updateUI(resultDiv, map);
        }
    });

    markers.push(marker);
    points.push(pointData);

    updateLine(map);
    updateUI(resultDiv, map);
}

function clearPoints(map) {
    markers.forEach(m => m.remove());
    markers = [];
    points = [];

    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getSource(lineSourceId)) map.removeSource(lineSourceId);

    if (map.getLayer('fai-sectors-fill')) map.removeLayer('fai-sectors-fill');

    if (map.getSource('fai-sectors-source')) map.removeSource('fai-sectors-source');
}

function updateLine(map) {
    if (points.length < 2) {
        // Clear if not enough points
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getSource(lineSourceId)) map.removeSource(lineSourceId);
        if (map.getLayer('fai-sectors-fill')) map.removeLayer('fai-sectors-fill');

        if (map.getSource('fai-sectors-source')) map.removeSource('fai-sectors-source');
        return;
    }

    // 1. Line Rendering
    const coordsList = points.map(p => p.coords);
    let renderPoints = coordsList;
    if (calcMode === 'triangle' && points.length >= 3) {
        renderPoints = [...coordsList, coordsList[0]]; // Close loop
    }

    const data = {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: renderPoints
        }
    };

    if (!map.getSource(lineSourceId)) {
        map.addSource(lineSourceId, { type: 'geojson', data: data });
        map.addLayer({
            id: lineLayerId,
            type: 'line',
            source: lineSourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#FFA500', 'line-width': 4, 'line-dasharray': [0, 2] }
        });
    } else {
        map.getSource(lineSourceId).setData(data);
    }

    // 2. FAI Sectors Rendering
    let faiFeatures = [];

    if (showFaiSectors && points.length >= 2 && calcMode === 'triangle') {
        const coords = points.map(p => p.coords);
        const result = generateFAIOptimizationLayer(coords);
        if (result && result.features) {
            faiFeatures = result.features;
        }
    }

    const fc = { type: 'FeatureCollection', features: faiFeatures };

    if (!map.getSource('fai-sectors-source')) {
        map.addSource('fai-sectors-source', { type: 'geojson', data: fc });

        map.addLayer({
            id: 'fai-sectors-fill',
            type: 'fill',
            source: 'fai-sectors-source',
            paint: {
                'fill-color': ['get', 'fill'],
                'fill-opacity': ['get', 'fill-opacity']
            }
        }, lineLayerId);


    } else {
        map.getSource('fai-sectors-source').setData(fc);
    }
}

function updateUI(resultDiv, map) {
    if (points.length === 0) {
        resultDiv.innerHTML = '<p style="text-align:center; color:#777;">Click map to add Start/Turnpoints</p>';
        return;
    }

    // Styles from Task Planner
    let html = `<div style="max-height:150px; overflow-y:auto; margin-bottom:10px; border-bottom:1px solid #eee;">`;

    points.forEach((p, i) => {
        html += `
            <div style="background:white; padding:6px; margin-bottom:4px; border-radius:4px; border:1px solid #eee; display:flex; align-items:center; font-size:0.9em;">
                <div style="font-weight:bold; color:#444; width:20px;">${i + 1}</div>
                <div style="flex:1;">
                    <div style="font-weight:bold;">${p.name}</div>
                    <div style="font-size:10px; color:#666;">${p.coords[1].toFixed(4)}, ${p.coords[0].toFixed(4)}</div>
                </div>
                 <button onclick="window.removeCalcPoint(${i})" style="border:none; background:none; color:#ef4444; cursor:pointer;">✕</button>
            </div>
        `;
    });
    html += `</div>`;

    // Global helper for delete (hacky but effective for vanilla JS)
    window.removeCalcPoint = (idx) => {
        markers[idx].remove();
        markers.splice(idx, 1);
        points.splice(idx, 1);
        updateLine(map);
        updateUI(resultDiv, map);
    };


    const coordsList = points.map(p => p.coords);
    let renderPoints = coordsList;
    if (calcMode === 'triangle' && points.length >= 3) {
        renderPoints = [...coordsList, coordsList[0]];
    }

    // Stats
    let lengthKm = 0;
    if (points.length > 1) {
        for (let i = 0; i < renderPoints.length - 1; i++) {
            lengthKm += FaiGeometry.distance(renderPoints[i], renderPoints[i + 1]);
        }
    }

    html += `<div style="margin-bottom:10px;">
    <div style="font-size:1.1em; font-weight:bold; color:#333;">${calcMode === 'triangle' ? 'Triangle' : 'Route'} Distance: ${lengthKm.toFixed(2)} km</div>`;

    if (points.length === 3 && calcMode === 'triangle') {
        const d1 = FaiGeometry.distance(points[0].coords, points[1].coords);
        const d2 = FaiGeometry.distance(points[1].coords, points[2].coords);
        const d3 = FaiGeometry.distance(points[2].coords, points[0].coords);
        const totalDist = d1 + d2 + d3;
        const minLeg = Math.min(d1, d2, d3);
        const percentage = (minLeg / totalDist) * 100;
        const isFAI = percentage >= 28;

        // OLC Logic
        const multiplier = isFAI ? 1.4 : 1.2;
        const olcScore = totalDist * multiplier;

        html += `<div style="margin-top:5px; padding:5px; background:${isFAI ? '#ecfdf5' : '#fff7ed'}; border-radius:4px; border:1px solid ${isFAI ? '#bbf7d0' : '#ffedd5'};">
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
                <span style="font-weight:bold; color:${isFAI ? 'green' : '#ea580c'};">
                    ${isFAI ? 'FAI Triangle (1.4x)' : 'Flat Triangle (1.2x)'}
                </span>
                <span style="font-size:1.2em; font-weight:bold; color:#1e3a8a;">
                    ${olcScore.toFixed(1)} pts
                </span>
            </div>
            <div style="font-size:0.9em; color:#555; margin-top:4px;">
                Perimeter: ${totalDist.toFixed(2)} km<br>
                Shortest Leg: ${percentage.toFixed(1)}%
            </div>
        </div>`;
    } else if (calcMode === 'route') {
        const olcScore = lengthKm * 1.0;
        html += `<div style="margin-top:5px; padding:5px; background:#f3f4f6; border-radius:4px; border:1px solid #e5e7eb;">
            <div style="display:flex; justify-content:space-between;">
                <span style="color:#4b5563;">Free Flight (1.0x)</span>
                <span style="font-weight:bold; color:#1e3a8a;">${olcScore.toFixed(1)} pts</span>
            </div>
        </div>`;
    }

    html += `</div>`;

    html += `<div style="display:flex; gap:10px; margin-top:10px;">
        <button id="interpretRouteBtn" style="flex:1; padding:8px; background:linear-gradient(135deg, #4f46e5, #3b82f6); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">Interpret</button>
        <button id="downloadRouteBtn" style="flex:1; padding:8px; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">Download</button>
    </div>`;

    resultDiv.innerHTML = html;

    const interpretBtn = document.getElementById('interpretRouteBtn');
    if (interpretBtn) {
        interpretBtn.addEventListener('click', () => {
            import('../services/aiService.js').then(module => {
                module.interpretRoute(points.map(p => p.coords));
            }).catch(err => console.error("Failed to load AI service", err));
        });
    }

    const downloadBtn = document.getElementById('downloadRouteBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            import('../utils/fileFormats.js').then(fmt => {
                showDownloadMenu(fmt, points.map(p => p.coords));
            });
        });
    }
}

function showDownloadMenu(fmt, simplePoints) {
    let menu = document.getElementById('dlMenu');
    if (menu) menu.remove();

    menu = document.createElement('div');
    menu.id = 'dlMenu';
    menu.style.cssText = "position:absolute; bottom:50px; right:10px; background:white; border:1px solid #ccc; padding:10px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.2); z-index:1000; min-width:180px;";

    const header = document.createElement('div');
    header.style.cssText = "display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;";
    header.innerHTML = `<strong>Export Format</strong><span style="cursor:pointer;" onclick="this.parentElement.parentElement.remove()">❌</span>`;
    menu.appendChild(header);

    const formats = [
        { label: 'GPX Waypoints (.gpx)', fn: fmt.generateGPXWaypoints },
        { label: 'GPX Route (.gpx)', fn: fmt.generateGPXRoute },
        { label: 'Google Earth (.kml)', fn: fmt.generateKML },
        { label: 'XCSoar / SeeYou (.cup)', fn: fmt.generateCUP },
        { label: 'GPSDump / Geo (.wpt)', fn: fmt.generateGeoWPT },
        { label: 'XCTrack (.cup)', fn: fmt.generateCUP },
    ];

    formats.forEach(f => {
        const btn = document.createElement('button');
        btn.innerText = f.label;
        btn.style.cssText = "display:block; width:100%; text-align:left; padding:6px; margin-bottom:4px; background:#f9f9f9; border:1px solid #eee; cursor:pointer; border-radius:4px;";
        btn.onmouseover = () => btn.style.background = '#eef';
        btn.onmouseout = () => btn.style.background = '#f9f9f9';

        btn.onclick = () => {
            try {
                const data = f.fn(simplePoints);
                if (data) {
                    downloadFile(data.content, `route.${data.ext}`, data.mime);
                } else {
                    alert("Error generating file. Do you have enough points?");
                }
            } catch (err) {
                console.error(err);
                alert("Generation failed");
            }
            menu.remove();
        };
        menu.appendChild(btn);
    });

    document.getElementById('calculatorPanel').appendChild(menu);
}

function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
