import streamlit as st
import requests
from datetime import datetime
from streamlit_folium import st_folium
import folium

# Streamlit UI Config
st.set_page_config(page_title="Thermal Soaring Map App", layout="wide")
st.title("🪂 Thermal Soaring World Map")
st.markdown("Click anywhere on the map to get soaring conditions for that location.")

# Default location (Babadağ Mountain)
def_lat, def_lon = 36.5315, 29.1220

# Create interactive map
m = folium.Map(location=[def_lat, def_lon], zoom_start=5, control_scale=True)
m.add_child(folium.LatLngPopup())

# Show the map and capture click
st_data = st_folium(m, height=500, width=900)

# Get clicked location or default
if st_data and st_data.get("last_clicked"):
    latitude = st_data["last_clicked"]["lat"]
    longitude = st_data["last_clicked"]["lng"]
else:
    latitude = def_lat
    longitude = def_lon

# Altitude input
altitude = st.slider("Set launch altitude (meters)", 0, 4000, 1800)

# Weather API Call
url = (
    f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}"
    f"&hourly=temperature_2m,shortwave_radiation,direct_radiation,cape,cloud_cover,dew_point_2m,"
    f"surface_pressure,wind_speed_10m,wind_direction_10m,precipitation,weathercode"
    f"&current=cloud_cover,wind_speed_10m,weathercode"
    f"&timezone=auto"
)
response = requests.get(url)
data = response.json()

# Extract current conditions
current = data.get("current", {})
cloud_now = current.get("cloud_cover", "N/A")
wind_now = current.get("wind_speed_10m", 0)
weather_code = current.get("weathercode", 0)

# Weather Warnings
warnings = []
if wind_now > 12.5:  # ~45 km/h
    warnings.append("🌪️ **Warning:** Winds exceed safe limits for soaring (over 45 km/h)")
if weather_code >= 61:
    warnings.append("🌧️ **Warning:** Rain or storm expected. Not suitable for soaring.")

# Display Warnings
if warnings:
    st.error("\n".join(warnings))
else:
    st.success("✅ Weather currently appears suitable for soaring.")

# Extract hourly data
try:
    hourly = data["hourly"]
    times = hourly["time"]
    temps = hourly["temperature_2m"]
    radiation = hourly["shortwave_radiation"]
    cape_values = hourly["cape"]
    clouds = hourly["cloud_cover"]
    dewpoints = hourly["dew_point_2m"]
    pressure = hourly["surface_pressure"]
    wind_speed = hourly["wind_speed_10m"]
    wind_direction = hourly["wind_direction_10m"]
    precip = hourly["precipitation"]
except KeyError:
    st.warning("Failed to load complete forecast data. Try again.")
    st.stop()

# Forecast Display
st.subheader("📅 Thermal Forecast Summary")

for i in range(len(times)):
    hour = datetime.fromisoformat(times[i])
    if hour.hour < 7 or hour.hour > 18:
        continue

    temp = temps[i]
    dew = dewpoints[i]
    rad = radiation[i]
    cape = cape_values[i]
    cloud = clouds[i]
    pres = pressure[i]
    wind = wind_speed[i]
    wdir = wind_direction[i]
    rain = precip[i]

    dew_spread = temp - dew
    climb_rate = round((rad / 100.0) * (dew_spread / 2.0) * (cape / 100.0), 1)

    # Thermal Description
    if climb_rate > 4:
        strength = "🔥 Strong thermals (4-6 m/s, possibly >10 m/s)"
    elif climb_rate > 2:
        strength = "🌤️ Moderate thermals (2-4 m/s)"
    elif climb_rate > 1:
        strength = "🌥️ Weak thermals (1-2 m/s)"
    else:
        strength = "❄️ Minimal thermal activity (<1 m/s)"

    st.markdown(f"**{hour.strftime('%Y-%m-%d %H:%M')}**")
    st.markdown(f"- 🌡️ Temp: **{temp:.1f}°C**, Dewpoint: **{dew:.1f}°C**")
    st.markdown(f"- 🌞 Radiation: **{rad:.1f} W/m²**, CAPE: **{cape:.1f} J/kg**")
    st.markdown(f"- 🌬️ Wind: **{wind:.1f} m/s** from {wdir:.0f}°, Clouds: **{cloud:.0f}%**")
    st.markdown(f"- 💧 Precipitation: **{rain:.1f} mm**, Pressure: **{pres:.1f} hPa**")
    st.markdown(f"- ⬆️ Climb Rate Estimate: **{climb_rate} m/s**")
    st.markdown(f"- 📈 {strength}\n")

st.info("Tip: Zoom and click different areas on the map to explore conditions anywhere in the world.")
