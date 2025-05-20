import streamlit as st
import requests
from datetime import datetime

# Streamlit UI
st.set_page_config(page_title="Thermal Soaring Forecast", layout="centered")
st.title("🪂 Thermal Soaring Forecast")
st.markdown("Get real-time thermal soaring conditions based on your location and altitude.")

# Input fields
col1, col2 = st.columns(2)
with col1:
    latitude = st.number_input("Latitude", value=36.5315)
with col2:
    longitude = st.number_input("Longitude", value=29.1220)
altitude = st.number_input("Launch Altitude (m)", value=1800)

# Request weather data
url = (
    f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}"
    f"&hourly=temperature_2m,shortwave_radiation,direct_radiation,cape,cloud_cover,dew_point_2m,surface_pressure,wind_speed_10m,wind_direction_10m"
    f"&current=cloud_cover&timezone=auto"
)

response = requests.get(url)
data = response.json()

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
except KeyError:
    st.error("Failed to retrieve forecast data. Please check the coordinates and try again.")
    st.stop()

# Display current cloud cover
current_cloud = data.get("current", {}).get("cloud_cover", "N/A")
st.markdown(f"### ☁️ Current Cloud Cover: **{current_cloud}%**")

# Forecast Section
st.subheader("📅 Hourly Thermal Forecast")

for i in range(len(times)):
    hour = datetime.fromisoformat(times[i])
    hour_str = hour.strftime("%H:%M")

    if hour.hour < 7 or hour.hour > 18:
        continue  # Skip night hours

    temp = temps[i]
    rad = radiation[i]
    cape = cape_values[i]
    cloud = clouds[i]
    dew = dewpoints[i]
    pres = pressure[i]
    wind_spd = wind_speed[i]
    wind_dir = wind_direction[i]

    dewpoint_spread = temp - dew

    # Estimate climb rate (very rough model)
    climb_estimate = (rad / 100.0) * (dewpoint_spread / 2.0) * (cape / 100.0)
    climb_estimate = round(climb_estimate, 1)

    # Determine category
    if climb_estimate > 4:
        strength = "🔥 Strong thermals (4-6 m/s typical, up to 10+)"
    elif climb_estimate > 2:
        strength = "🌤️ Moderate thermals (2-4 m/s typical)"
    elif climb_estimate > 1:
        strength = "🌥️ Weak thermals (1-2 m/s)"
    else:
        strength = "❄️ Minimal thermal activity (<1 m/s)"

    st.markdown(f"**{hour.strftime('%Y-%m-%d %H:%M')}**")
    st.markdown(f"- Temperature: **{temp:.1f}°C**")
    st.markdown(f"- Dewpoint: **{dew:.1f}°C**")
    st.markdown(f"- Dewpoint Spread: **{dewpoint_spread:.1f}°C**")
    st.markdown(f"- Radiation: **{rad:.1f} W/m²**")
    st.markdown(f"- CAPE: **{cape:.1f} J/kg**")
    st.markdown(f"- Cloud Cover: **{cloud:.1f}%**")
    st.markdown(f"- Surface Pressure: **{pres:.1f} hPa**")
    st.markdown(f"- Wind: **{wind_spd:.1f} m/s** from {wind_dir:.0f}°")
    st.markdown(f"- ⬆️ Estimated Climb Rate: **{climb_estimate} m/s**")
    st.markdown(f"- 📈 {strength}\n")

st.success("Forecast complete. Adjust location/altitude for other areas.")
