export function getSunPosition(lat, lon, date = new Date()) {
  const sunPos = SunCalc.getPosition(date, lat, lon);
  const times = SunCalc.getTimes(date, lat, lon);

  return {
    azimuth: +(sunPos.azimuth * (180 / Math.PI)).toFixed(2),  // degrees
    altitude: +(sunPos.altitude * (180 / Math.PI)).toFixed(2), // degrees
    sunrise: times.sunrise.toLocaleTimeString(),
    solarNoon: times.solarNoon.toLocaleTimeString(),
    sunset: times.sunset.toLocaleTimeString()
  };
}
