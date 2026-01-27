
import { generateFAIOptimizationLayer } from './faiHelper.js';
import { FaiGeometry } from '../utils/faiGeometry.js';

let isActive = false;
let points = []; // Array of objects: { graphic: Graphic, coords: [lon, lat], name: 'TP 1' }
let viewRef = null;
let GraphicClass, GeometryEngine, PolylineClass, PolygonClass;

// State
let calcMode = 'triangle';
let showFaiSectors = true;

export function isCalculatorActive() {
    return isActive;
}

export function setupCalculator3d(view, Graphic, geomEngine, Polyline, Polygon) {
    viewRef = view;
    GraphicClass = Graphic;
    GeometryEngine = geomEngine;
    PolylineClass = Polyline;
    PolygonClass = Polygon;

    const calcBtn = document.getElementById('calculatorBtn');
    const calcPanel = document.getElementById('calculatorPanel');
    const closeBtn = document.getElementById('closeCalculatorBtn');
    const clearBtn = document.getElementById('clearCalculatorBtn');

    if (!calcBtn || !calcPanel) return;

    // Toggle logic
    calcBtn.addEventListener('click', () => {
        isActive = !isActive;
        if (isActive) {
            calcPanel.style.display = 'block';
            calcBtn.classList.add('active');
            view.container.style.cursor = 'crosshair';
            renderSettingsUI();
            updateLineAndUI();
        } else {
            disableCalculator();
        }
    });

    closeBtn.addEventListener('click', () => disableCalculator());

    clearBtn.addEventListener('click', () => {
        clearPoints();
        updateLineAndUI();
    });
}

function renderSettingsUI() {
    let settingsContainer = document.getElementById('calcSettingsPanel3d');
    if (!settingsContainer) {
        const panel = document.getElementById('calculatorPanel');
        const header = panel.querySelector('div'); // Assuming first div is header/close button container or similar structure? 
        // Actually structure is usually h3 then buttons. Let's find h3.
        const h3 = panel.querySelector('h3');

        // Add Gear Icon to Header if not exists (check logic from 2D)
        // ... (Simplified for 3D: just insert below title)

        // Create the Settings Div
        settingsContainer = document.createElement('div');
        settingsContainer.id = 'calcSettingsPanel3d';
        settingsContainer.style.cssText = "display:block; background:rgba(255,255,255,0.9); padding:10px; border-radius:8px; margin-bottom:10px; font-size:0.9em; backdrop-filter:blur(5px); border: 1px solid #ddd;";
        settingsContainer.innerHTML = `
            <div style="margin-bottom:8px;">
                <label style="cursor:pointer; display:flex; align-items:center;">
                    <input type="radio" name="calcMode3d" value="triangle" checked> 
                    <span style="margin-left:5px;">Triangle (Closed Loop)</span>
                </label>
                <label style="cursor:pointer; display:flex; align-items:center; margin-top:4px;">
                    <input type="radio" name="calcMode3d" value="route"> 
                    <span style="margin-left:5px;">Straight Line (Open)</span>
                </label>
            </div>
            <div style="border-top:1px solid #ccc; padding-top:8px; margin-top:8px;">
                <div style="margin-bottom:4px; font-weight:bold;">Calculation Model</div>
                <label style="cursor:pointer; display:flex; align-items:center;">
                    <input type="radio" name="calcModel3d" value="sphere" checked> 
                    <span style="margin-left:5px;">FAI Sphere (Cat 2)</span>
                </label>
                <label style="cursor:pointer; display:flex; align-items:center; margin-top:4px;">
                    <input type="radio" name="calcModel3d" value="wgs84"> 
                    <span style="margin-left:5px;">WGS84 Ellipsoid (Cat 1)</span>
                </label>
            </div>
            <div style="border-top:1px solid #ccc; padding-top:8px; margin-top:8px;">
                <label style="cursor:pointer; display:flex; align-items:center;">
                    <input type="checkbox" id="faiSectorsToggle3d" checked> 
                    <span style="margin-left:5px;">Show FAI Sectors 🎨</span>
                </label>
            </div>
        `;

        // Insert after H3
        if (h3) {
            h3.parentNode.insertBefore(settingsContainer, h3.nextSibling);
        } else {
            panel.insertBefore(settingsContainer, panel.firstChild);
        }

        // Listeners
        settingsContainer.querySelectorAll('input[name="calcMode3d"]').forEach(r => {
            r.addEventListener('change', (e) => {
                calcMode = e.target.value;
                updateLineAndUI();
            });
        });

        settingsContainer.querySelectorAll('input[name="calcModel3d"]').forEach(r => {
            r.addEventListener('change', (e) => {
                FaiGeometry.setMethod(e.target.value);
                updateLineAndUI();
            });
        });

        settingsContainer.querySelector('#faiSectorsToggle3d').addEventListener('change', (e) => {
            showFaiSectors = e.target.checked;
            updateLineAndUI();
        });
    }
}

function disableCalculator() {
    isActive = false;
    document.getElementById('calculatorPanel').style.display = 'none';
    document.getElementById('calculatorBtn').classList.remove('active');
    if (viewRef) viewRef.container.style.cursor = 'default';
    clearPoints();
}

function clearPoints() {
    // Remove all calculator graphics
    points.forEach(p => viewRef.graphics.remove(p.graphic));
    points = [];

    // Remove line/polygon graphic if exists
    const oldLine = viewRef.graphics.items.find(g => g.getAttribute('id') === 'calc-line');
    if (oldLine) viewRef.graphics.remove(oldLine);

    // Remove FAI sectors
    const oldFAI = viewRef.graphics.items.filter(g => g.getAttribute('id') === 'fai-sector');
    oldFAI.forEach(g => viewRef.graphics.remove(g));
}

export function addPoint3d(mapPoint) {
    if (points.length >= 10) {
        alert("Max 10 points.");
        return;
    }

    const index = points.length;
    let name = `TP ${index}`;
    if (index === 0) name = "Start";

    // Create Point Graphic
    const markerSymbol = {
        type: "simple-marker",
        style: "circle",
        color: [255, 165, 0], // Orange
        size: "12px",
        outline: {
            color: [255, 255, 255],
            width: 2
        }
    };

    const pointGraphic = new GraphicClass({
        geometry: mapPoint,
        symbol: markerSymbol,
        attributes: { id: `calc-pt-${index}` }
    });

    viewRef.graphics.add(pointGraphic);

    points.push({
        graphic: pointGraphic,
        coords: [mapPoint.longitude, mapPoint.latitude], // Keep for reference [lon, lat]
        geometry: mapPoint,
        name: name
    });

    updateLineAndUI();
}

function updateLineAndUI() {
    drawRoute();
    drawFAI();
    updateUI();
}

function drawRoute() {
    // Remove old line
    const oldLine = viewRef.graphics.find(g => g.getAttribute && g.getAttribute('id') === 'calc-line');
    if (oldLine) viewRef.graphics.remove(oldLine);

    if (points.length < 2) return;

    const paths = points.map(p => [p.geometry.longitude, p.geometry.latitude, p.geometry.z || 0]);

    // Close loop if triangle mode
    if (calcMode === 'triangle' && points.length >= 3) {
        paths.push(paths[0]); // Close the loop
    }

    const polyline = new PolylineClass({
        paths: [paths],
        spatialReference: { wkid: 4326 } // Lat/Lon
    });

    const lineSymbol = {
        type: "simple-line",
        color: [255, 165, 0], // Orange
        width: 3,
        style: "short-dot"
    };

    const lineGraphic = new GraphicClass({
        geometry: polyline,
        symbol: lineSymbol,
        attributes: { id: 'calc-line' }
    });

    viewRef.graphics.add(lineGraphic);
}

function drawFAI() {
    // Remove old FAI sectors
    const oldFAI = viewRef.graphics.items.filter(g => g.getAttribute('id') === 'fai-sector');
    oldFAI.forEach(g => viewRef.graphics.remove(g));

    if (!showFaiSectors) return;
    if (calcMode !== 'triangle') return;
    if (points.length !== 3) return; // Only for triangles

    // Extract coords [lon, lat]
    const coords = points.map(p => [p.geometry.longitude, p.geometry.latitude]);

    // Generate GeoJSON using the helper
    const geojson = generateFAIOptimizationLayer(coords);
    if (!geojson || !geojson.features) return;

    geojson.features.forEach(feature => {
        let rings = [];

        // Handle Polygon and MultiPolygon from Turf
        if (feature.geometry.type === 'Polygon') {
            rings = feature.geometry.coordinates;
        } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach(polyRings => {
                rings.push(polyRings[0]); // Pushing outer ring
            });
        }

        if (rings.length === 0) return;

        // Convert styling
        const hexColor = feature.properties.fill || '#00ff00';
        const opacity = feature.properties["fill-opacity"] || 0.3;
        const color = hexToRgba(hexColor, opacity);

        const symbol = {
            type: "simple-fill",
            color: color,
            outline: {
                color: feature.properties.stroke || [0, 0, 0, 0],
                width: feature.properties["stroke-width"] || 0
            }
        };

        const polygon = new PolygonClass({
            rings: rings,
            spatialReference: { wkid: 4326 }
        });

        const graphic = new GraphicClass({
            geometry: polygon,
            symbol: symbol,
            attributes: { id: 'fai-sector' }
        });

        viewRef.graphics.add(graphic);
    });
}

function hexToRgba(hex, alpha) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length == 3) {
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = '0x' + c.join('');
        return [(c >> 16) & 255, (c >> 8) & 255, c & 255, alpha];
    }
    return [0, 255, 0, alpha];
}

function updateUI() {
    const resultDiv = document.getElementById('calculatorResult');
    if (!resultDiv) return;

    if (points.length < 1) {
        resultDiv.innerHTML = '<p style="text-align:center; color:#777;">Click map to add Start/Turnpoints</p>';
        return;
    }

    // List Points
    let html = `<div style="max-height:150px; overflow-y:auto; margin-bottom:10px; border-bottom:1px solid #eee;">`;
    points.forEach((p, i) => {
        html += `
            <div style="background:white; padding:6px; margin-bottom:4px; border-radius:4px; border:1px solid #eee; display:flex; align-items:center; font-size:0.9em;">
                <div style="font-weight:bold; color:#444; width:20px;">${i + 1}</div>
                <div style="flex:1;">
                    <div style="font-weight:bold;">${p.name}</div>
                    <div style="font-size:10px; color:#666;">${p.coords[1].toFixed(4)}, ${p.coords[0].toFixed(4)}</div>
                </div>
            </div>`;
    });
    html += `</div>`;

    // 1. Calculate Total Distance based on Calculation Model
    let lengthKm = 0;
    
    // Construct route path for calculation
    let calcPoints = points.map(p => p.coords); // [lon, lat]
    if (calcMode === 'triangle' && points.length >= 3) {
        calcPoints.push(calcPoints[0]); // Close loop
    }

    if (calcPoints.length > 1) {
        for (let i = 0; i < calcPoints.length - 1; i++) {
            lengthKm += FaiGeometry.distance(calcPoints[i], calcPoints[i + 1]);
        }
    }

    html += `<div style="margin-bottom:10px;">
    <div style="font-size:1.1em; font-weight:bold; color:#333;">${calcMode === 'triangle' ? 'Triangle' : 'Route'} Distance: ${lengthKm.toFixed(2)} km</div>`;

    // 2. FAI Triangle & OLC Score Logic
    if (points.length === 3 && calcMode === 'triangle') {
        const d1 = FaiGeometry.distance(points[0].coords, points[1].coords);
        const d2 = FaiGeometry.distance(points[1].coords, points[2].coords);
        const d3 = FaiGeometry.distance(points[2].coords, points[0].coords);
        const totalDist = d1 + d2 + d3;
        const minLeg = Math.min(d1, d2, d3);
        const percentage = (minLeg / totalDist) * 100;
        const isFAI = percentage >= 28;

        // OLC Multipliers
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
                Shortest Leg: ${percentage.toFixed(1)}% (Min 28%)
            </div>
        </div>`;
    } else if (calcMode === 'route') {
        // Free Flight: 1.0x
        const olcScore = lengthKm * 1.0;
        html += `<div style="margin-top:5px; padding:5px; background:#f3f4f6; border-radius:4px; border:1px solid #e5e7eb;">
            <div style="display:flex; justify-content:space-between;">
                <span style="color:#4b5563;">Free Flight (1.0x)</span>
                <span style="font-weight:bold; color:#1e3a8a;">${olcScore.toFixed(1)} pts</span>
            </div>
        </div>`;
    }

    html += `</div>`;
    resultDiv.innerHTML = html;
}
