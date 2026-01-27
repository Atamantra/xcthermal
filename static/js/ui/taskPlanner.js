
import { FaiGeometry } from '../utils/faiGeometry.js';
// We will import the map layer controller later
// import { TaskLayer3d } from '../map/taskLayer3d.js'; 

export class TaskPlanner {
    constructor(map) {
        this.map = map;
        this.taskPoints = []; // Array of { center, type, radius, ... }
        this.taskType = 'race'; // 'race', 'elapsed', 'open'
        this.isActive = false;

        // Default Turnpoint Config
        this.defaultRadius = 0.4; // 400m
        this.defaultLineLength = 2.0; // 2km (radius 1km)

        this.initUI();

        // Listen for map clicks to add points
        this.map.on('click', (e) => {
            if (this.isActive) {
                this.addPoint(e.lngLat);
            }
        });
    }

    initUI() {
        // Create the Race Task Panel
        const container = document.createElement('div');
        container.id = 'raceTaskPanel';
        container.style.cssText = `
            display: none;
            position: absolute;
            top: 100px;
            right: 20px;
            width: 320px;
            background: rgba(255, 255, 255, 0.95);
            padding: 15px;
            border-radius: 12px;
            z-index: 2005;
            box-shadow: 0 4px 20px rgba(0,0,0,0.25);
            backdrop-filter: blur(10px);
            font-family: Arial, sans-serif;
        `;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #ddd; padding-bottom:10px;">
                <h3 style="margin:0; font-size:16px;">🏁 Competition Task</h3>
                <button id="closeRaceBtn" style="border:none; background:none; font-size:20px; cursor:pointer;">&times;</button>
            </div>
            
            <div id="taskStats" style="margin-bottom:15px; padding:10px; background:#f0f9ff; border-radius:8px; border:1px solid #bae6fd;">
                <div style="font-size:1.1em; font-weight:bold; color:#0369a1;">Task Distance: <span id="optDistance">0.00</span> km</div>
                <div style="font-size:0.9em; color:#555; margin-top:5px;">
                    Optimized via FAI Rules (WGS84)
                </div>
            </div>

            <div id="pointsList" style="max-height:250px; overflow-y:auto; margin-bottom:15px;">
                <div style="text-align:center; color:#888; padding:20px;">
                    Click map to add Start/Turnpoints
                </div>
            </div>
            
            <div style="display:flex; gap:10px;">
                <button id="calcTaskBtn" style="flex:1; padding:8px; background:#4f46e5; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Detailed Plan</button>
                <button id="clearTaskBtn" style="flex:1; padding:8px; background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer;">Clear</button>
            </div>
        `;

        document.body.appendChild(container);

        document.getElementById('closeRaceBtn').onclick = () => this.toggle(false);
        document.getElementById('clearTaskBtn').onclick = () => this.clearTask();
        // Calc button logic later

        // Add Button to Main Interface (replacing or next to calculator?)
        // For now, let's create a dedicated "Race" button or hook into the existing calculator?
        // User asked for "Best App", let's give it a dedicated "Flag" button.

        const btn = document.createElement('button');
        btn.id = 'raceBtn';
        btn.title = 'Competition Task Planner';
        btn.innerHTML = '🏁'; // Racing flag
        btn.style.cssText = `
            position: absolute;
            top: 375px; 
            left: 21px;
            width: 36px;
            height: 36px;
            border: none;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 6;
            font-size: 18px;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
            cursor: pointer;
        `;
        btn.onmouseover = () => {
            btn.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.3) 100%)';
            btn.style.transform = 'translateY(-1px)';
        };
        btn.onmouseout = () => {
            btn.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)';
            btn.style.transform = 'translateY(0)';
        };

        btn.onclick = () => this.toggle();
        document.body.appendChild(btn);
    }

    toggle(force) {
        const panel = document.getElementById('raceTaskPanel');
        this.isActive = force !== undefined ? force : !this.isActive;
        panel.style.display = this.isActive ? 'block' : 'none';

        // Update Cursor
        if (this.map && this.map.getCanvas) {
            this.map.getCanvas().style.cursor = this.isActive ? 'crosshair' : '';
        }

        // Deactivate standard calculator if active
        // (Accessing global or checking DOM)
        if (this.isActive) {
            const calcBtn = document.getElementById('calculatorBtn');
            if (calcBtn && calcBtn.classList.contains('active')) calcBtn.click();
        }
    }

    clearTask() {
        this.taskPoints = [];
        this.renderPoints();
        // Clear Map Layers (To be implemented)
        this.updateStats(0);
    }

    addPoint(lngLat) {
        if (!this.isActive) return;

        // Determine type based on order
        // 1st point = "Launch" (simple point) or "Start" (Cylinder)
        // Let's assume standard sequence: Launch -> Start -> TP1 -> ... -> Goal

        const index = this.taskPoints.length;
        let type = 'cylinder';
        let name = `TP ${index}`;
        let radius = this.defaultRadius;

        if (index === 0) {
            name = "Launch / Start"; // Simplified
        } else {
            // Check if previous was Goal? No, append.
        }

        const point = {
            id: Date.now(),
            center: [lngLat.lng, lngLat.lat],
            type: type, // 'cylinder' | 'line' | 'goal_line'
            radius: radius,
            lineLength: this.defaultLineLength,
            orientation: 0, // 0 = North
            name: name
        };

        this.taskPoints.push(point);
        this.renderPoints();
        this.recalculateTask();
    }

    renderPoints() {
        const list = document.getElementById('pointsList');
        if (this.taskPoints.length === 0) {
            list.innerHTML = `<div style="text-align:center; color:#888; padding:20px;">Click map to add Start/Turnpoints</div>`;
            return;
        }

        let html = '';
        this.taskPoints.forEach((p, i) => {
            let typeLabel = p.type === 'cylinder' ? `Cyl ${p.radius}km` : `Line ${p.lineLength}km`;
            if (i === this.taskPoints.length - 1 && i > 0) typeLabel += " (Goal?)"; // Hint

            html += `
                <div style="background:white; padding:8px; margin-bottom:5px; border-radius:6px; border:1px solid #eee; display:flex; align-items:center;">
                    <div style="font-weight:bold; color:#444; width:20px;">${i + 1}</div>
                    <div style="flex:1;">
                        <div style="font-weight:bold; font-size:14px;">${p.name}</div>
                        <div style="font-size:11px; color:#666; cursor:pointer; text-decoration:underline;" onclick="window.editTaskPoint(${i})">${typeLabel} ⚙️</div>
                    </div>
                     <button onclick="window.removeTaskPoint(${i})" style="border:none; background:none; color:#ef4444; cursor:pointer;">🗑️</button>
                </div>
            `;
        });
        list.innerHTML = html;

        // Expose global helpers for inline onclicks (quick hack)
        window.removeTaskPoint = (idx) => {
            this.taskPoints.splice(idx, 1);
            this.renderPoints();
            this.recalculateTask();
        };

        window.editTaskPoint = (idx) => {
            // In a real app we'd open a modal. For now, let's toggle Cylinder <-> Line
            const p = this.taskPoints[idx];
            if (p.type === 'cylinder') {
                p.type = 'line';
                // Try to auto-calc orientation from previous
            } else if (p.type === 'line') {
                p.type = 'cylinder';
            }
            this.renderPoints();
            this.recalculateTask();
        };
    }

    recalculateTask() {
        if (this.taskPoints.length < 2) {
            this.updateStats(0);
            return;
        }

        // Prepare Geometries
        // Phase 1: Just optimize cylinders
        // TODO: Handle Line Geometries in Optimizer

        // Run Optimizer
        const optimizedPath = FaiGeometry.optimizeRoute(this.taskPoints);

        // Calculate Distance
        let totalDist = 0;
        for (let i = 0; i < optimizedPath.length - 1; i++) {
            totalDist += FaiGeometry.distance(optimizedPath[i], optimizedPath[i + 1]);
        }

        this.updateStats(totalDist);

        // Emit event or call map layer to draw
        if (window.updateTaskLayer) {
            window.updateTaskLayer(this.taskPoints, optimizedPath);
        }
    }

    updateStats(distKm) {
        document.getElementById('optDistance').innerText = distKm.toFixed(2);
    }
}
