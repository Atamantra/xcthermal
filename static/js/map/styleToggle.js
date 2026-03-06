import { toggle3DMode, is3DSupported } from './terrain3d.js';

/**
 * Sets up the 2D/3D style toggle button on the map.
 * Instead of navigating to a separate ArcGIS page, this 
 * toggles Mapbox GL JS terrain in-place.
 */
export function setupStyleToggle(map, onToggleCallback) {

  class MapStyleToggle {
    onAdd(map) {
      this.map = map;
      const container = document.createElement('div');
      container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
      // Tighten stack spacing to match "first model" right image
      container.style.marginTop = '5px';

      this.button = document.createElement('button');
      this.button.className = 'map-style-toggle';
      this.button.type = 'button';
      this.button.title = 'Toggle 3D Terrain';

      // Keep structural styles that might not be in CSS, but rely mostly on class
      // The CSS provided handles width/height/flex. 
      // We just need the ID for functionality.
      this.button.id = 'view3dBtn';

      // Inner span is not strictly needed if we just set innerText on button, 
      // but keeping it for consistency if we swap text. 
      // However, the CSS user provided uses flex on the button itself to center content.
      // So I will simplify back to just text or a simple span without inline styles.
      this.button.innerText = '3D';

      this.button.onclick = () => {
        const now3D = toggle3DMode(map);

        // Update button text to show current mode
        this.button.innerText = now3D ? '2D' : '3D';
        this.button.title = now3D ? 'Switch to 2D' : 'Toggle 3D Terrain';

        // Visual feedback
        if (now3D) {
          this.button.style.background = 'rgba(5, 139, 160, 0.8)';
          this.button.style.color = '#fff';
        } else {
          this.button.style.background = '';
          this.button.style.color = '';
        }

        // Execute callback if provided
        if (typeof onToggleCallback === 'function') {
          onToggleCallback(now3D);
        }

        // Notify user if 3D not supported
        if (!now3D && !is3DSupported()) {
          console.warn('3D terrain is not supported on this browser.');
        }
      };

      container.appendChild(this.button);
      return container;
    }

    onRemove() {
      this.button.remove();
      this.map = undefined;
    }
  }

  map.addControl(new MapStyleToggle(), 'top-right');
}