const sourceId = "thermalHotspots";
const layerId = "thermalHotspotLayer";

export async function addThermalHotspots(map) {
  try {
    const response = await fetch("/static/hotspots.json");
    const data = await response.json();

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data

      });
    } else {
      map.getSource(sourceId).setData(data);
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "quality"],
            0, 4,
            100, 10
          ],
          "circle-color": [
            "interpolate", ["linear"], ["get", "quality"],
            0, "rgba(0,0,0,0.1)",
            50, "rgba(255,0,0,0.4)",
            100, "rgba(255,0,0,0.8)"
          ],
          "circle-blur": 0.6,
          "circle-opacity": 0.8
        }
      });

      // Optional: move above other layers
      if (map.moveLayer) {
        map.moveLayer(layerId);
      }
    }

    // Ensure visibility is on
    map.setLayoutProperty(layerId, 'visibility', 'visible');

  } catch (error) {
    console.error("Error loading thermal hotspots:", error);
  }
}

export function hideThermalHotspots(map) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', 'none');
  }
}

export function showThermalHotspots(map) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', 'visible');
  }
}
