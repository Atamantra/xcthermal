export function loadParaglidingSites(map) {
  const bounds = map.getBounds();
  const url = `/proxy/paragliding-sites?south=${bounds.getSouth()}&north=${bounds.getNorth()}&west=${bounds.getWest()}&east=${bounds.getEast()}`;

  fetch(url)
    .then(r => {
      if (!r.ok) {
        if (r.status === 401) {
          console.warn("User not logged in, skipping paragliding sites.");
          return null;
        }
        throw new Error(`HTTP error! Status: ${r.status}`);
      }
      return r.json();
    })
    .then(data => {
      if (!data) return;
      const sourceId = 'pgSites';
      const layerId = 'pgSitesLayer';

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: 'geojson', data });

        map.addLayer({
          id: layerId,
          type: 'symbol',
          source: sourceId,
          layout: {
            'icon-image': 'paraglider',
            'icon-size': 0.2,
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-offset': [0, 1.2],
            'text-anchor': 'top'
          },
          paint: {
            'text-color': '#FFFFFF',
            'text-halo-color': '#000000',
            'text-halo-width': 1
          }
        });
      } else {
        map.getSource(sourceId).setData(data);
      }
    })
    .catch(console.error);
}
