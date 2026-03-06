import { addThermalHotspots, hideThermalHotspots, showThermalHotspots } from '../map/thermalHotspots.js';

let hotspotsLoaded = false;

export function setupHotspotToggle(map) {
  const toggleContainer = document.getElementById('hotspotToggleContainer');
  
  // We rely on the input's "change" event bubbling up or captured directly.
  // However, the previous implementation targeted the input.
  // Let's find the input again.
  
  const checkbox = document.getElementById('hotspotCheckbox');
  
  if (!checkbox) {
    console.warn("Hotspot checkbox not found!");
    return;
  }

  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      if (!hotspotsLoaded) {
        addThermalHotspots(map);
        hotspotsLoaded = true;
      } else {
        showThermalHotspots(map);
      }
    } else {
      hideThermalHotspots(map);
    }
  });
}
