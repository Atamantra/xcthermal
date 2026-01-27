/**
 * skywaysLayer3d.js
 * Handles adding/removing the KK7 Thermal Skyways tile layer on the 3D map.
 */

export function enableSkyways3D(view) {
    require(["esri/layers/WebTileLayer"], (WebTileLayer) => {
        if (!view || !view.map) return;

        // Check if layer already exists
        let layer = view.map.findLayerById("skyways-layer");

        if (layer) {
            layer.visible = true;
        } else {
            // Create new layer
            layer = new WebTileLayer({
                id: "skyways-layer",
                urlTemplate: "https://thermal.kk7.ch/tiles/skyways_all_all/{z}/{x}/{y}.png?src=xcthermal.com",
                copyright: "KK7 Thermal Skyways",
                opacity: 0.6, // Adjust transparency so satellite map is visible
                title: "Thermal Skyways"
            });
            view.map.add(layer);  // Enabled with corrected URL
        }
    });
}

export function disableSkyways3D(view) {
    if (!view || !view.map) return;

    const layer = view.map.findLayerById("skyways-layer");
    if (layer) {
        layer.visible = false;
    }
}
