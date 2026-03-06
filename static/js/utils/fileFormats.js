
// Helper to format Lat/Lon for different standards
function toDegMin(val, isLat) {
    const absVal = Math.abs(val);
    const deg = Math.floor(absVal);
    const min = (absVal - deg) * 60;
    const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
    // Format: DD MM.MMM
    // Fixed width often required by old formats
    return { deg, min, dir, absVal };
}

// 1. GPX Waypoints (Individual <wpt>)
export function generateGPXWaypoints(points) {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="XCThermal-Calculator" xmlns="http://www.topografix.com/GPX/1/1">
`;
    points.forEach((p, i) => {
        const name = `XCT${(i + 1).toString().padStart(2, '0')}`;
        // p is [lon, lat]
        xml += `  <wpt lat="${p[1]}" lon="${p[0]}">
    <name>${name}</name>
    <sym>Waypoint</sym>
  </wpt>
`;
    });
    xml += `</gpx>`;
    return { content: xml, ext: 'gpx', mime: 'application/gpx+xml' };
}

// 2. GPX Route (<rte> sequence)
export function generateGPXRoute(points) {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="XCThermal-Calculator" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>XCT-Route</name>
`;
    points.forEach((p, i) => {
        const name = `XCT${(i + 1).toString().padStart(2, '0')}`;
        xml += `    <rtept lat="${p[1]}" lon="${p[0]}">
      <name>${name}</name>
    </rtept>
`;
    });
    xml += `  </rte>
</gpx>`;
    return { content: xml, ext: 'gpx', mime: 'application/gpx+xml' };
}

// 3. KML (Google Earth)
export function generateKML(points) {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>XCT-Route-Plan</name>
    <Style id="lineStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Flight Path</name>
      <styleUrl>#lineStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
`;
    // LineString coordinates: lon,lat,alt
    points.forEach(p => {
        kml += `          ${p[0]},${p[1]},0\n`;
    });

    kml += `        </coordinates>
      </LineString>
    </Placemark>
`;

    // Add Waypoints
    points.forEach((p, i) => {
        const name = `XCT${(i + 1).toString().padStart(2, '0')}`;
        kml += `    <Placemark>
      <name>${name}</name>
      <Point>
        <coordinates>${p[0]},${p[1]},0</coordinates>
      </Point>
    </Placemark>
`;
    });

    kml += `  </Document>
</kml>`;
    return { content: kml, ext: 'kml', mime: 'application/vnd.google-earth.kml+xml' };
}

// 4. XCSoar / SeeYou CUP format
// "name",code,country,lat,lon,elev,style,rwdir,rwlen,freq,desc
export function generateCUP(points) {
    let cup = `name,code,country,lat,lon,elev,style,rwdir,rwlen,freq,desc\n`;

    points.forEach((p, i) => {
        const name = `XCT${(i + 1).toString().padStart(2, '0')}`;
        // Lat/Lon in CUP: DDMM.MMMN/S
        const latObj = toDegMin(p[1], true);
        const lonObj = toDegMin(p[0], false);

        const latStr = `${latObj.deg.toString().padStart(2, '0')}${latObj.min.toFixed(3)}${latObj.dir}`;
        const lonStr = `${lonObj.deg.toString().padStart(3, '0')}${lonObj.min.toFixed(3)}${lonObj.dir}`;

        // Elev hardcoded to 0 or we need to look it up? We only have lat/lon usually. using 0m.
        // Style 1 = Normal waypoint
        cup += `"${name}","${name}",,${latStr},${lonStr},0m,1,,,,\n`;
    });

    return { content: cup, ext: 'cup', mime: 'text/plain' };
}

// 5. FormatGEO (GPSDump)
// $FormatGEO
// XCT01   N 45 12.345   E 006 12.345   0
export function generateGeoWPT(points) {
    let txt = `$FormatGEO\n`;

    points.forEach((p, i) => {
        const name = `XCT${(i + 1).toString().padStart(2, '0')}`;
        const latObj = toDegMin(p[1], true);
        const lonObj = toDegMin(p[0], false);

        // Format: N DD MM.MMM
        // Ensure padding
        const latStr = `${latObj.dir} ${latObj.deg.toString().padStart(2, '0')} ${latObj.min.toFixed(3)}`;
        const lonStr = `${lonObj.dir} ${lonObj.deg.toString().padStart(3, '0')} ${lonObj.min.toFixed(3)}`;

        txt += `${name.padEnd(8)} ${latStr}   ${lonStr}   0\n`;
    });

    return { content: txt, ext: 'wpt', mime: 'text/plain' };
}
