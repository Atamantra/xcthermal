if (window.currentMap) {
    console.log("Simulating map click for thermal data...");
    window.currentMap.fire('click', {
        lngLat: {
            lng: 29.178,
            lat: 36.531,
            toArray: function() { return [this.lng, this.lat]; }
        },
        point: {x: 100, y: 100}
    });
} else {
    console.error("currentMap not found");
}
