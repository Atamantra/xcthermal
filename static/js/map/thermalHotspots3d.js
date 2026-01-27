export async function enableHotspots3D(view, GeoJSONLayer, SimpleRenderer, SimpleMarkerSymbol) {
    // 1. Check if layer already exists
    const existingLayer = view.map.findLayerById("thermalHotspotsLayer");
    if (existingLayer) {
        existingLayer.visible = true;
        return;
    }

    try {
        // 2. Define Renderer (approximating the 2D 'interpolate' style)
        // Mapbox: color interpolates 0->black(.1), 50->red(.4), 100->red(.8)
        // Mapbox: radius interpolates 0->4, 100->10
        // We'll use a visual variable-based renderer for continuous color/size if possible, 
        // or a SimpleRenderer with visual variables.

        const renderer = {
            type: "simple",
            symbol: {
                type: "simple-marker",
                style: "circle",
                color: "rgba(255, 0, 0, 0.5)", // Base color
                outline: {
                    width: 0
                }
            },
            visualVariables: [
                {
                    type: "color",
                    field: "quality",
                    stops: [
                        { value: 0, color: "rgba(0, 0, 0, 0.1)" },
                        { value: 50, color: "rgba(255, 0, 0, 0.4)" },
                        { value: 100, color: "rgba(255, 0, 0, 0.8)" }
                    ]
                },
                {
                    type: "size",
                    field: "quality",
                    minDataValue: 0,
                    maxDataValue: 100,
                    minSize: 4,
                    maxSize: 15 // Slightly larger for 3D visibility
                }
            ]
        };

        // 3. Create GeoJSON Layer
        const geojsonLayer = new GeoJSONLayer({
            url: "/static/hotspots.json",
            id: "thermalHotspotsLayer",
            copyright: "XcThermal",
            renderer: renderer,
            definitionExpression: "quality > 0" // Basic filter
        });

        // 4. Add to map
        view.map.add(geojsonLayer);
        console.log("Hotspots layer added to 3D map.");

    } catch (err) {
        console.error("Failed to add hotspots 3D layer:", err);
    }
}

export function disableHotspots3D(view) {
    const layer = view.map.findLayerById("thermalHotspotsLayer");
    if (layer) {
        layer.visible = false;
    }
}
