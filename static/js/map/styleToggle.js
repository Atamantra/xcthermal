export function setupStyleToggle(map) {
  let is3DStyle = false;

  class MapStyleToggle {
    onAdd(map) {
      this.map = map;
      const container = document.createElement('div');
      container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

      this.button = document.createElement('button');
      this.button.className = 'mapboxgl-ctrl-icon map-style-toggle';
      this.button.type = 'button';
      this.button.title = 'Toggle 3D';
      this.button.innerText = '3D';

      this.button.onclick = () => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const pitch = map.getPitch();
        const bearing = map.getBearing();
        window.location.href = `/map3d?lat=${center.lat}&lon=${center.lng}&zoom=${zoom}&tilt=${pitch}&heading=${bearing}`;
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