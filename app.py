import os
import sys
import logging
import json
import requests
import threading
import glob
import time
import io
import base64 # <--- ADDED: Required for image attachment
from PIL import Image
import google.generativeai as genai
from geopy.distance import geodesic
from datetime import datetime, timezone, timedelta
from astral import LocationInfo
from astral.sun import sun, elevation, azimuth
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session, make_response
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask_migrate import Migrate
from authlib.integrations.flask_client import OAuth
import openmeteo_requests
import pandas as pd
import requests_cache
from retry_requests import retry
import numpy as np
from dotenv import load_dotenv
import markdown # <--- ADDED: Markdown Support

# --- BREVO IMPORTS (ADDED) ---
import brevo_python
from brevo_python.rest import ApiException

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, 'xcthermal.env'))

# --- Flask Application Initialization ---
# --- Flask Application Initialization ---
template_dir = os.path.join(basedir, 'templates')
static_dir = os.path.join(basedir, 'static')
app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)

@app.template_filter('markdown')
def render_markdown(text):
    return markdown.markdown(text)

# --- Configuration ---
# --- Security & Session Configuration ---
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY')
if not app.config['SECRET_KEY']:
     logging.warning("CRITICAL: FLASK_SECRET_KEY is missing from xcthermal.env!")

app.config['SESSION_COOKIE_SECURE'] = True
app.config['REMEMBER_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# --- Database URI Configuration ---
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'instance', 'site.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Ensure 'instance' directory exists ---
instance_path = os.path.join(basedir, 'instance')
os.makedirs(instance_path, exist_ok=True)
logging.info(f"Ensured instance directory exists: {instance_path}")
logging.info(f"Database URI set to: {app.config['SQLALCHEMY_DATABASE_URI']}")

# --- Database Initialization ---
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# --- Flask-Login Manager Setup ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message_category = 'info'

# --- OAuth Setup ---
oauth = OAuth(app)
oauth.register(
    name='google',
    client_id=os.environ.get('GOOGLE_CLIENT_ID'),
    client_secret=os.environ.get('GOOGLE_CLIENT_SECRET'),
    access_token_url='https://oauth2.googleapis.com/token',
    access_token_params=None,
    authorize_url='https://accounts.google.com/o/oauth2/auth',
    authorize_params=None,
    api_base_url='https://www.googleapis.com/oauth2/v1/',
    client_kwargs={'scope': 'openid email profile'},
    jwks_uri='https://www.googleapis.com/oauth2/v3/certs'
)

# Apple Login Setup
# Note: Apple requires HTTPS and specific configuration.
oauth.register(
    name='apple',
    client_id=os.environ.get('APPLE_CLIENT_ID'),
    client_secret=os.environ.get('APPLE_CLIENT_SECRET'),
    authorize_url='https://appleid.apple.com/auth/authorize',
    access_token_url='https://appleid.apple.com/auth/token',
    client_kwargs={'scope': 'name email', 'response_mode': 'form_post'},
)

# --- API Keys & Constants ---
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
else:
    logging.error("GOOGLE_API_KEY is missing. AI features will fail.")

METEOBLUE_API_KEY = os.environ.get("METEOBLUE_API_KEY")
if not METEOBLUE_API_KEY:
    logging.error("METEOBLUE_API_KEY is missing. Weather charts will fail.")

MAPBOX_ACCESS_TOKEN = os.environ.get("MAPBOX_ACCESS_TOKEN")
ESRI_API_KEY = os.environ.get("ESRI_API_KEY")

CACHE = {}
CACHE_LOCK = threading.Lock()
CACHE_TTL = 300

INTERPRETATION_COST = 1
SOUNDING_COST = 1

# --- LANGUAGE MAPPING ---
LANGUAGE_MAP = {
    'en': 'English',
    'tr': 'Turkish',
    'de': 'German',
    'fr': 'French',
    'es': 'Spanish',
    'it': 'Italian',
    'ru': 'Russian',
    'pt': 'Portuguese'
}

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


# --- Database Models ---
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    # Social Login IDs
    google_id = db.Column(db.String(100), unique=True, nullable=True)
    apple_id = db.Column(db.String(100), unique=True, nullable=True)
    password_hash = db.Column(db.String(128), nullable=True) # Allow null for social users
    credits = db.Column(db.Integer, default=3, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    # --- Settings Columns ---
    ai_language = db.Column(db.String(10), default='en')
    unit_system = db.Column(db.String(20), default='metric')
    ai_prompt_style = db.Column(db.String(20), default='basic')
    flight_usage = db.Column(db.String(50), default='paragliding')
    map_style = db.Column(db.String(255), default='mapbox://styles/mapbox/satellite-streets-v12')
    tutorial_completed = db.Column(db.Boolean, default=False, nullable=True)
    
    # --- Daily Interpreter Settings ---
    daily_email_enabled = db.Column(db.Boolean, default=False)
    daily_takeoff_directions = db.Column(db.String(50), default='')
    daily_min_xc_km = db.Column(db.Integer, nullable=True)
    daily_ai_style = db.Column(db.String(20), default='xcperfect')
    daily_auto_route = db.Column(db.Boolean, default=False)
    
    # --- Map Persistence ---
    last_lat = db.Column(db.Float, nullable=True)
    last_lon = db.Column(db.Float, nullable=True)
    last_zoom = db.Column(db.Float, nullable=True)
    last_pitch = db.Column(db.Float, nullable=True)
    last_bearing = db.Column(db.Float, nullable=True)
    last_map_type = db.Column(db.String(10), default='2d') # '2d' or '3d'

    # --- XcPerfect Saved Location ---
    xc_perfect_lat = db.Column(db.Float, nullable=True)
    xc_perfect_lon = db.Column(db.Float, nullable=True)
    xc_perfect_asl = db.Column(db.Float, nullable=True)

    # --- Safety Waiver ---
    waiver_accepted = db.Column(db.Boolean, default=False)
    waiver_accepted_at = db.Column(db.DateTime, nullable=True)

    transactions = db.relationship('Transaction', backref='user', lazy=True)
    reports = db.relationship('AIReport', backref='user', lazy=True, order_by='AIReport.timestamp.desc()')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def get_id(self):
        return str(self.id)

    def __repr__(self):
        return f'<User {self.username}>'


class AIReport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    def __repr__(self):
        return f'<AIReport {self.id} User:{self.user_id}>'


class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(200), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    def __repr__(self):
        return f'<Transaction {self.id} User:{self.user_id} Type:{self.type} Amount:{self.amount}>'


class UserActivity(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) # Nullable for anonymous tracking if needed later
    action = db.Column(db.String(50), nullable=False)
    details = db.Column(db.Text, nullable=True)
    ip_address = db.Column(db.String(50), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    def __repr__(self):
        return f'<UserActivity {self.user_id} {self.action}>'


# --- Flask-Login User Loader ---
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# --- Helper to get Open-Meteo Data ---
def get_openmeteo_data(lat, lon):
    try:
        cache_session = requests_cache.CachedSession('.cache', expire_after=3600)
        retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
        openmeteo = openmeteo_requests.Client(session=retry_session)

        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": [
                "temperature_2m", "relative_humidity_2m", "precipitation", "cloud_cover", "wind_speed_10m",
                "wind_gusts_10m", "cape", "convective_inhibition", "surface_pressure",
                "direct_normal_irradiance_instant", "soil_moisture_0_to_1cm",
                "temperature_1000hPa", "temperature_950hPa", "temperature_900hPa", "temperature_850hPa",
                "temperature_800hPa", "wind_speed_1000hPa", "wind_speed_950hPa", "wind_speed_900hPa",
                "wind_speed_850hPa", "wind_speed_800hPa", "wind_direction_1000hPa", "wind_direction_950hPa",
                "wind_direction_900hPa", "wind_direction_850hPa", "wind_direction_800hPa",
                "geopotential_height_1000hPa", "geopotential_height_950hPa", "geopotential_height_900hPa",
                "geopotential_height_850hPa", "geopotential_height_800hPa"
            ],
            "models": "best_match",
            "timezone": "auto",
            "forecast_days": 3
        }

        responses = openmeteo.weather_api("https://api.open-meteo.com/v1/forecast", params=params)
        response = responses[0]

        hourly = response.Hourly()
        hourly_data = {
            "date": pd.date_range(
                start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
                end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
                freq=pd.Timedelta(seconds=hourly.Interval()),
                inclusive="left"
            )
        }

        for i, var_name in enumerate(params["hourly"]):
            hourly_data[var_name] = hourly.Variables(i).ValuesAsNumpy()

        return pd.DataFrame(data=hourly_data)

    except Exception as e:
        logging.error(f"Failed to fetch Open-Meteo data: {e}", exc_info=True)
        raise ValueError("Failed to fetch weather data. Please try again later.")


# --- Helper to format Open-Meteo Data for AI ---
def format_openmeteo_data_for_ai(df):
    if df.empty:
        return "No hourly data available."

    now = pd.Timestamp.now(tz='UTC')
    future_df = df[df['date'] >= now].copy()

    if future_df.empty:
        return "No future data available in the forecast window."

    summary_lines = ["--- Open-Meteo Hourly Data Summary for AI Interpretation ---"]
    summary_lines.append(f"Report Generated At: {now.strftime('%Y-%m-%d %H:%M UTC')}")
    summary_lines.append("INSTRUCTION: Treat the first available date below as 'Day 1'.")
    summary_lines.append("")

    future_df['hour_only'] = future_df['date'].dt.hour
    flying_hours_df = future_df[(future_df['hour_only'] >= 9) & (future_df['hour_only'] <= 18)]

    if flying_hours_df.empty:
        return "No flyable hours (09:00-18:00) found in the remaining forecast."

    unique_days = flying_hours_df['date'].dt.date.unique()

    for day in unique_days:
        day_data = flying_hours_df[flying_hours_df['date'].dt.date == day]
        summary_lines.append(f"=== FORECAST FOR DATE: {day} ===")

        for _, row in day_data.iterrows():
            summary_lines.append(f"Time: {row['date'].strftime('%H:00')}")
            summary_lines.append(
                f" - Wind (Surface): {row['wind_speed_10m']:.1f} km/h (Gusts: {row['wind_gusts_10m']:.1f})")
            summary_lines.append(
                f" - Wind (1500m/850hPa): {row['wind_speed_850hPa']:.1f} km/h from {row['wind_direction_850hPa']:.0f}°")
            summary_lines.append(f" - Cloud Cover: {row['cloud_cover']:.0f}%")
            summary_lines.append(f" - Rain (Precipitation): {row['precipitation']:.1f} mm")
            summary_lines.append(f" - Temp (Surface): {row['temperature_2m']:.1f}°C")
            summary_lines.append(f" - Thermal Quality (CAPE): {row['cape']:.0f}")
            summary_lines.append("")

    return "\n".join(summary_lines)

# --- AI Interpretation Helper Function ---
def get_ai_interpretation(lat, lon, asl, req_language=None, req_style=None, req_units=None):
    if not GOOGLE_API_KEY:
        raise ValueError("Google API key is not configured.")
    if not METEOBLUE_API_KEY:
        raise ValueError("Meteoblue API key is not configured.")

    try:
        # 1. Fetch Open-Meteo data
        openmeteo_df = get_openmeteo_data(lat, lon)
        summarized_data_text = format_openmeteo_data_for_ai(openmeteo_df)

        # 2. Fetch the Meteogram image from Meteoblue
        image_url = (
            f"https://my.meteoblue.com/images/meteogram_thermal"
            f"?lat={lat}&lon={lon}&asl={asl}&apikey={METEOBLUE_API_KEY}"
        )
        image_response = requests.get(image_url, timeout=15)
        image_response.raise_for_status()
        meteogram_image = Image.open(io.BytesIO(image_response.content))

        # --- 3. DETERMINE LANGUAGE & STYLE ---
        target_language = "English"
        style_pref = "Basic"

        # Priority: explicit request > user settings > default
        if req_language:
             target_language = LANGUAGE_MAP.get(req_language, target_language)
        elif current_user and current_user.is_authenticated and current_user.ai_language:
             target_language = LANGUAGE_MAP.get(current_user.ai_language, target_language)

        if req_style:
            style_pref = req_style
        elif current_user and current_user.is_authenticated and current_user.ai_prompt_style:
            style_pref = current_user.ai_prompt_style

        print(f"DEBUG AI: Prompt Language='{target_language}', Style='{style_pref}'")

        # --- Specific Instructions for Prompt Styles ---
        additional_instructions = ""
        if style_pref == 'ridge':
            additional_instructions = """
            SPECIAL INSTRUCTIONS FOR RIDGE SOARING:
            1. PRIMARY FOCUS: Wind speed and direction are the most critical factors.
            2. IDEAL WIND: 20-25+ km/h (approx 13mph) is optimal for DHV1/EN-A paragliders.
            3. DANGER WARNINGS: 
               - Sustained winds > 40 km/h can cause problems (blown back). 
               - Gusts > 20 km/h (difference between sustained and gust) can make takeoff very hard/dangerous.
            4. Do NOT focus primarily on thermals; focus on ridge lift potential (wind perpendicular to ridge).
            """
        elif style_pref == 'xcperfect':
            additional_instructions = """
            SPECIAL INSTRUCTIONS FOR XC PERFECT ALERT:
            1. OBJECTIVE: You are the judge. Is today an EPIC 100km+ XC day?
            2. FORMAT: Start your response with either "✅ XC STATUS: GO!" or "❌ XC STATUS: NO GO" or "⚠️ XC STATUS: MARGINAL".
            3. CRITERIA for GO:
               - High Cloudbase (>2000m).
               - Strong but safe thermals.
               - Low wind or good tailwind.
               - No rain/storms.
            4. TONE:
               - If GO: Enthusiastic, hype up the pilot! "Get to the takeoff NOW!"
               - If NO GO: Brutally honest. Save the pilot gas money.
            5. Provide a rough estimation of max potential distance (e.g. "Potential for 50-80km triangle").
            """

        # 4. Construct Prompt
        prompt_content = f"""
        You are an expert paragliding meteorologist.
        The pilot has explicitly requested the analysis in: {req_units if req_units else "metric"} units.
        INSTRUCTIONS:
        1. Tone/Complexity: {style_pref}
        2. RESPONSE LANGUAGE: {target_language}
        3. Make Sure The Dates dont start 1 day before.
        4. PRIMARY SOURCE: Focus heavily on the Meteogram Image for all thermal-related analysis (e.g., cloud base, dry thermals, soaring altitude) and general weather patterns, rather than only raw text data.
        5. Specifically analyze and mention the potential for **dry thermals** and estimate the **soaring altitude** based on the meteogram.
        6. Include Rain/Precipitation status in your analysis.
        7. add all tailored information necessary for {style_pref}.
        8. If the weather is bad warn the pilot about the dangers.
        {additional_instructions}
        (CRITICAL: Write the entire response in {target_language}.)

        Raw Data (Supplementary):
        {summarized_data_text}

        """

        # 5. Gemini API Call
        model = genai.GenerativeModel('gemini-3-pro-preview')
        response = model.generate_content([prompt_content, meteogram_image])
        if response.text:
            return response.text
        else:
            raise ValueError("Gemini API returned an empty response.")
    except Exception as e:
        logging.error(f"AI interpretation error for user ({lat},{lon}): {e}", exc_info=True)
        raise


# --- Root Route (ADDED) ---
@app.route("/")
def index():
    try:
        logging.info(f"Looking for template in: {app.template_folder}")
        logging.info(f"Files in template folder: {os.listdir(app.template_folder)}")
        
        # Check if user needs intro/modal
        open_modal = None
        open_profile = request.args.get('open_profile', 'false') == 'true'

        if not current_user.is_authenticated:
            # logic to decide if login/register modal should be open could go here
            pass
            
        # Determine if Waiver Modal should be shown
        show_waiver_modal = False
        if current_user.is_authenticated:
            if not current_user.waiver_accepted:
                show_waiver_modal = True
        else:
            if not session.get('waiver_accepted'):
                show_waiver_modal = True

        resp = make_response(render_template("index.html", 
                             user_authenticated=current_user.is_authenticated,
                             interpretation_cost=INTERPRETATION_COST,
                             open_modal=open_modal,
                             open_profile=open_profile,
                             show_waiver_modal=show_waiver_modal,
                             mapbox_token=MAPBOX_ACCESS_TOKEN,
                             tutorial_completed=current_user.tutorial_completed if current_user.is_authenticated else False,
                             user_last_state={
                                 'lat': current_user.last_lat,
                                 'lon': current_user.last_lon,
                                 'zoom': current_user.last_zoom,
                                 'pitch': current_user.last_pitch,
                                 'bearing': current_user.last_bearing,
                                 'map_type': current_user.last_map_type
                             } if current_user.is_authenticated else None))
        resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        resp.headers['Vary'] = 'Cookie'
        return resp
    except Exception as e:
        logging.error(f"Error rendering index: {e}", exc_info=True)
        return str(e), 500

@app.route("/map3d")
# @login_required  <-- REMOVED FOR GUEST ACCESS TEST, BUT LOGIC BELOW HANDLES IT
def map3d():
    return render_template("map3d.html", esri_api_key=ESRI_API_KEY,
                           user_last_state={
                               'lat': current_user.last_lat,
                               'lon': current_user.last_lon,
                               'zoom': current_user.last_zoom, # Altitude in 3D
                               'pitch': current_user.last_pitch, # Tilt in 3D
                               'bearing': current_user.last_bearing, # Heading in 3D
                               'map_type': current_user.last_map_type
                           } if current_user.is_authenticated else None)

# --- Safety Waiver Logic (Updated for Guests) ---
@app.before_request
def check_waiver():
    # List of allowed endpoints ensuring no redirect loop
    allowed_endpoints = ['safety_waiver', 'logout', 'static', 'login', 'register', 'index', 'map3d'] # Added login/register/index to allowed list for guests to land
    
    # If endpoint is allowed, skip check
    # We now allow 'index' so the modal can be shown there
    if request.endpoint in allowed_endpoints:
        return

    # Allow API and Proxy endpoints to pass through (handled by their own auth checks returning JSON)
    if request.path.startswith('/api/') or request.path.startswith('/proxy/'):
        return

    # User Logic
    if current_user.is_authenticated:
        if not current_user.waiver_accepted:
             # Redirect to index instead of safety_waiver since it's now a modal on index
             return redirect(url_for('index'))
    
    # Guest Logic
    from flask import session
    if not current_user.is_authenticated:
        if not session.get('waiver_accepted'):
             return redirect(url_for('index'))

@app.route("/safety-waiver", methods=["GET", "POST"])
def safety_waiver():
    from flask import session
    
    # If already accepted, redirect home
    if current_user.is_authenticated and current_user.waiver_accepted:
        return redirect(url_for('index'))
    if not current_user.is_authenticated and session.get('waiver_accepted'):
        return redirect(url_for('index'))

    if request.method == "POST":
        agreement = request.form.get("agreement")
        if agreement:
            if current_user.is_authenticated:
                current_user.waiver_accepted = True
                current_user.waiver_accepted_at = datetime.now(timezone.utc)
                db.session.commit()
            else:
                session['waiver_accepted'] = True
            
            # AJAX Response for Modal
            is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('ajax')
            
            if is_ajax:
                return jsonify({"status": "success", "message": "Waiver accepted"})
                
            flash("Safety Waiver accepted. Fly safe!", "success")
            return redirect(url_for('index'))
        else:
            is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('ajax')
            if is_ajax:
                return jsonify({"status": "error", "message": "You must accept the waiver"}), 400
            flash("You must explicitly accept the waiver to proceed.", "danger")

    return render_template("safety_waiver.html")

# --- User Authentication Routes ---
@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        flash("You are already logged in.", "info")
        return redirect(url_for('index'))
    if request.method == "POST":
        username = request.form.get("username")
        email = request.form.get("email")
        password = request.form.get("password")
        user_exists = User.query.filter_by(username=username).first()
        email_exists = User.query.filter_by(email=email).first()
        if user_exists:
            flash("Username already taken.", "danger")
            return render_template("index.html", open_modal='register', user_authenticated=False, interpretation_cost=INTERPRETATION_COST)
        elif email_exists:
            flash("Email already registered.", "danger")
            return render_template("index.html", open_modal='register', user_authenticated=False, interpretation_cost=INTERPRETATION_COST)
        else:
            new_user = User(username=username, email=email)
            new_user.set_password(password)
            
            # Check for waiver acceptance during registration
            if request.form.get("waiver_agree"):
                new_user.waiver_accepted = True
                new_user.waiver_accepted_at = datetime.now(timezone.utc)
            
            db.session.add(new_user)
            db.session.commit()
            flash("Account created successfully! You can now log in.", "success")
            return redirect(url_for("login"))
    # GET request: Show index with register modal open
    return render_template("index.html", open_modal='register', user_authenticated=False, interpretation_cost=INTERPRETATION_COST)


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        flash("You are already logged in.", "info")
        return redirect(url_for('index'))
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            flash("Logged in successfully!", "success")
            next_page = request.args.get('next')
            return redirect(next_page or url_for("index"))
        else:
            flash("Login Unsuccessful.", "danger")
            return render_template("index.html", open_modal='login', user_authenticated=False, interpretation_cost=INTERPRETATION_COST)
    # GET request: Show index with login modal open
    return render_template("index.html", open_modal='login', user_authenticated=False, interpretation_cost=INTERPRETATION_COST)


# --- OAuth Routes ---
@app.route('/login/google')
def login_google():
    redirect_uri = url_for('google_auth', _external=True)
    return oauth.google.authorize_redirect(redirect_uri)

@app.route('/auth/google')
def google_auth():
    try:
        token = oauth.google.authorize_access_token()
        user_info = oauth.google.get('userinfo').json()
        
        email = user_info.get('email')
        google_id = user_info.get('id')
        name = user_info.get('name') or email.split('@')[0]
        
        user = User.query.filter_by(google_id=google_id).first()
        if not user:
            user = User.query.filter_by(email=email).first()
            if user:
                # Link existing user
                user.google_id = google_id
                db.session.commit()
            else:
                # Create new user
                user = User(username=name, email=email, google_id=google_id)
                # Set dummy password or handle nullable
                # user.set_password(secrets.token_urlsafe(16)) 
                db.session.add(user)
                db.session.commit()
        
        login_user(user)
        flash("Logged in with Google successfully!", "success")
        return redirect(url_for('index'))
    except Exception as e:
        flash(f"Google Login Failed: {e}", "danger")
        return redirect(url_for('login'))

@app.route('/login/apple')
def login_apple():
    redirect_uri = url_for('apple_auth', _external=True)
    return oauth.apple.authorize_redirect(redirect_uri) # Apple often requires POST for callback

@app.route('/auth/apple', methods=['GET', 'POST']) # Apple uses POST for form_post
def apple_auth():
    try:
        token = oauth.apple.authorize_access_token()
        # Apple ID token contains user info
        user_info = token.get('user_info') # Authlib parses id_token automatically if present
         # If not present in token, might need parsing `id_token` claim
        
        # Fallback if user_info is not directly populated (common in Apple)
        if not user_info and 'id_token' in token:
             # This part depends on Authlib version, recent versions parse it. 
             # We assume Authlib parses it.
             pass

        if not user_info:
             flash("Failed to get Apple user info.", "error")
             return redirect(url_for('index'))

        email = user_info.get('email')
        apple_id = user_info.get('sub') # Subject is the unique ID
        
        # Apple only sends email/name on FIRST login. Subsequent logins might not have email if not requested properly or scoped.
        # But 'sub' is consistent.
        
        user = User.query.filter_by(apple_id=apple_id).first()
        if not user:
             if email:
                user = User.query.filter_by(email=email).first()
                if user:
                    user.apple_id = apple_id
                    db.session.commit()
                else:
                    # Create
                    user = User(username=email.split('@')[0], email=email, apple_id=apple_id)
                    db.session.add(user)
                    db.session.commit()
             else:
                 flash("Apple didn't return an email. Please use a different method or check your Apple ID settings.", "warning")
                 return redirect(url_for('index'))
                 
        login_user(user)
        flash("Logged in with Apple successfully!", "success")
        return redirect(url_for('index'))
        
    except Exception as e:
        logging.error(f"Apple Login Error: {e}")
        flash(f"Apple Login Failed. Ensure HTTPS is used.", "danger")
        return redirect(url_for('index'))


@app.route("/reset_password_request", methods=["POST"])
def reset_password_request():
    email = request.form.get("email")
    # Dummy logic for now
    flash(f"If an account exists for {email}, reset instructions have been sent.", "info")
    return redirect(url_for("index"))


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been logged out.", "info")
    return redirect(url_for("index"))


@app.route('/terms')
def terms():
    return render_template('terms.html')


@app.route('/privacy')
def privacy():
    return render_template('privacy.html')


@app.route("/profile")
@login_required
def profile():
    # Redirect to index with profile modal open
    return redirect(url_for('index', open_profile='true'))


@app.route("/add_credits", methods=["GET", "POST"])
@login_required
def add_credits():
    if request.method == "POST":
        try:
            amount = int(request.form.get("amount"))
            if amount > 0:
                current_user.credits += amount
                db.session.add(Transaction(user_id=current_user.id, type='purchase', amount=amount,
                                           description=f'User purchased {amount} credits'))
                db.session.commit()
                flash(f"Successfully added {amount} credits!", "success")
                return redirect(url_for("index", open_profile='true'))
            else:
                flash("Amount must be positive.", "danger")
        except ValueError:
            flash("Invalid amount.", "danger")
    # Fallback to index if GET or error, opening the modal
    return redirect(url_for("index", open_profile='true'))


# --- DEBUG ROUTE ---
@app.route("/debug", methods=["GET"])
def debug_weather():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)

    data = None
    error = None

    if lat and lon:
        try:
            df = get_openmeteo_data(lat, lon)
            df['date'] = df['date'].dt.strftime('%Y-%m-%d %H:%M')
            data = df.to_dict(orient='records')
        except Exception as e:
            error = str(e)

    return render_template("debug.html", data=data, lat=lat, lon=lon, error=error)


# --- Rate Limiting for Emails ---
# Structure: { user_id: [timestamp1, timestamp2, ...] }
EMAIL_LIMITS = {}
EMAIL_LIMIT_COUNT = 2  # Max emails
EMAIL_LIMIT_WINDOW = 300  # Seconds (5 minutes)

def check_email_limit(user_id):
    now = time.time()
    user_timestamps = EMAIL_LIMITS.get(user_id, [])
    
    # Filter out old timestamps
    valid_timestamps = [t for t in user_timestamps if now - t < EMAIL_LIMIT_WINDOW]
    
    if len(valid_timestamps) >= EMAIL_LIMIT_COUNT:
        return False
    
    # Update with new timestamp
    valid_timestamps.append(now)
    EMAIL_LIMITS[user_id] = valid_timestamps
    return True


# --- Helper to Send Email (Brevo) ---
def send_brevo_email(email_to, lat, lon, asl, interpretation_text):
    # 1. Configure Brevo API
    api_key = os.environ.get('BREVO_API_KEY')
    if not api_key:
        logging.error("Brevo API Key not found in environment variables.")
        return False, "Server configuration error"

    configuration = brevo_python.Configuration()
    configuration.api_key['api-key'] = api_key
    api_instance = brevo_python.TransactionalEmailsApi(brevo_python.ApiClient(configuration))

    # 2. Fetch and Prepare the Image
    attachment = None
    if lat and lon and METEOBLUE_API_KEY:
        try:
            img_url = f"https://my.meteoblue.com/images/meteogram_thermal?lat={lat}&lon={lon}&asl={asl}&apikey={METEOBLUE_API_KEY}"
            img_response = requests.get(img_url, timeout=15)
            img_response.raise_for_status()
            img_b64 = base64.b64encode(img_response.content).decode('utf-8')
            attachment = [{
                "content": img_b64,
                "name": "meteogram_thermal.png",
                "contentId": "my-meteogram-image"
            }]
        except Exception as e:
            logging.error(f"Failed to fetch image for email: {e}")
            pass

    # 3. Convert Markdown to HTML
    html_interpretation = markdown.markdown(interpretation_text)

    # 4. Define the Email Content
    subject = f"Your Flight Report: {datetime.now().strftime('%Y-%m-%d')}"
    sender = {"name": "XcThermal", "email": "info@xcthermal.com"}
    to = [{"email": email_to}]

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; color: #333; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }}
        .header {{ background: linear-gradient(135deg, #007bff, #0056b3); padding: 30px 20px; text-align: center; color: white; }}
        .header h1 {{ margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px; }}
        .content {{ padding: 30px; line-height: 1.6; }}
        .coords {{ text-align: center; font-size: 14px; color: #666; margin-bottom: 20px; background: #f8f9fa; padding: 8px; border-radius: 20px; display: inline-block; }}
        .section-title {{ border-bottom: 2px solid #eee; padding-bottom: 10px; margin-top: 30px; margin-bottom: 15px; color: #2c3e50; font-size: 18px; font-weight: bold; }}
        .interpretation {{ background-color: #fff; }}
        .interpretation h1, .interpretation h2, .interpretation h3 {{ color: #007bff; margin-top: 20px; }}
        .interpretation ul {{ padding-left: 20px; }}
        .interpretation li {{ margin-bottom: 8px; }}
        .interpretation strong {{ color: #333; }}
        .meteogram {{ text-align: center; margin-top: 20px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px; }}
        .meteogram img {{ width: 100%; height: auto; border-radius: 4px; }}
        .footer {{ background-color: #f8f9fa; text-align: center; padding: 20px; font-size: 12px; color: #888; border-top: 1px solid #eee; }}
        .btn {{ display: inline-block; background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; font-weight: bold; }}
    </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>XcThermal Report</h1>
            </div>
            <div class="content">
                <div style="text-align: center;">
                    <div class="coords">📍 {lat:.4f}, {lon:.4f}</div>
                </div>
                
                <div class="section-title">🌤️ AI Analysis</div>
                <div class="interpretation">
                    {html_interpretation}
                </div>

                <div class="section-title">📈 Thermal Meteogram</div>
                <div class="meteogram">
                    <img src="cid:my-meteogram-image" alt="Thermal Meteogram">
                </div>
            </div>
            <div class="footer">
                <p>Generated by <strong>XcThermal</strong> based on Open-Meteo & Meteoblue data.</p>
                <p>Fly Safe! 🪂</p>
            </div>
        </div>
    </body>
    </html>
    """

    send_smtp_email = brevo_python.SendSmtpEmail(
        to=to,
        sender=sender,
        subject=subject,
        html_content=html_content,
        attachment=attachment if attachment else None
    )

    try:
        api_response = api_instance.send_transac_email(send_smtp_email)
        logging.info(f"Email sent successfully. Message ID: {api_response.message_id}")
        return True, "Email sent successfully!"
    except ApiException as e:
        logging.error(f"Exception when calling Brevo API: {e}")
        return False, f"Failed to send email: {e}"

# --- Background Task for AI + Email ---
def process_interpretation_and_email(app_ctx, user_id, lat, lon, asl, email, lang, style, units):
    """
    Background thread worker:
    1. Pushes app context.
    2. Generates AI interpretation.
    3. Sends email.
    4. (Optional) Log success/fail or refund on AI fail.
    """
    with app_ctx:
        try:
            # Reload user to ensure session attachment if needed (though id is enough for logic usually)
            # But we don't need the user object for the heavy lifting, just for credits if we were refunding
            logging.info(f"Starting background interpretation for User {user_id}...")
            
            # 1. Generate Interpretation
            interpretation_text = get_ai_interpretation(lat, lon, asl, req_language=lang, req_style=style, req_units=units)
            
            # 2. Send Email
            success, msg = send_brevo_email(email, lat, lon, asl, interpretation_text)
            
            if success:
                logging.info(f"Background job success for User {user_id}")
            else:
                logging.error(f"Background job email failed for User {user_id}: {msg}")
                
        except Exception as e:
            logging.error(f"Background job CRASHED for User {user_id}: {e}", exc_info=True)
            # Potential logic: Refund credits here if the AI failed completely?
            # For now, we just log it.


# --- API Endpoints ---

@app.route("/api/app_log", methods=["POST"])
def api_log_activity():
    try:
        data = request.get_json()
        action = data.get('action')
        details = data.get('details')
        
        # Get User ID if authenticated
        user_id = current_user.id if current_user.is_authenticated else None
        
        # Get IP (simplified)
        if request.headers.getlist("X-Forwarded-For"):
            ip_address = request.headers.getlist("X-Forwarded-For")[0]
        else:
            ip_address = request.remote_addr
            
        new_log = UserActivity(user_id=user_id, action=action, details=str(details), ip_address=ip_address)
        db.session.add(new_log)
        db.session.commit()
        
        return jsonify({"status": "success"}), 200
    except Exception as e:
        logging.error(f"Logging failed: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/settings", methods=["GET", "POST"])
# @login_required
# @login_required
def manage_settings():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    
    if request.method == 'GET':
        print(f"DEBUG [Settings GET]: User={current_user.username}, Lang={current_user.ai_language}")
        response = jsonify({
            'aiLanguage': current_user.ai_language or 'en',
            'unitSystem': current_user.unit_system or 'metric',
            'aiPromptStyle': current_user.ai_prompt_style or 'xc',
            'flightUsage': current_user.flight_usage or 'paragliding',
            'mapStyle': current_user.map_style or 'mapbox://styles/mapbox/satellite-streets-v12',
            'dailyEmailEnabled': current_user.daily_email_enabled,
            'dailyTakeoffDirections': current_user.daily_takeoff_directions,
            'dailyMinXcKm': current_user.daily_min_xc_km,
            'dailyAiStyle': current_user.daily_ai_style or 'xcperfect',
            'dailyAutoRoute': current_user.daily_auto_route
        })
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response

    elif request.method == 'POST':
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'error': 'No JSON data received'}), 400

        print(f"DEBUG [Settings POST]: Payload: {data}")
        changes_detected = False

        if 'aiLanguage' in data:
            current_user.ai_language = data['aiLanguage']
            changes_detected = True
        if 'unitSystem' in data:
            current_user.unit_system = data['unitSystem']
            changes_detected = True
        if 'aiPromptStyle' in data:
            current_user.ai_prompt_style = data['aiPromptStyle']
            changes_detected = True
        if 'flightUsage' in data:
            current_user.flight_usage = data['flightUsage']
            changes_detected = True
        if 'mapStyle' in data:
            current_user.map_style = data['mapStyle']
            changes_detected = True
        
        # --- Daily Interpreter Settings ---
        if 'dailyEmailEnabled' in data:
            current_user.daily_email_enabled = bool(data['dailyEmailEnabled'])
            changes_detected = True
        
        # Helper to safely parse floats from various inputs (strings, numbers, nulls)
        def safe_float(val):
            try:
                if val is None or val == '': return None
                return float(val)
            except (ValueError, TypeError):
                return None

        # --- XcPerfect Location Settings ---
        if 'xcPerfectLat' in data:
            current_user.xc_perfect_lat = safe_float(data['xcPerfectLat'])
            changes_detected = True
        if 'xcPerfectLon' in data:
            current_user.xc_perfect_lon = safe_float(data['xcPerfectLon'])
            changes_detected = True
        if 'xcPerfectAsl' in data:
            current_user.xc_perfect_asl = safe_float(data['xcPerfectAsl'])
            changes_detected = True
            changes_detected = True
        if 'dailyTakeoffDirections' in data:
            current_user.daily_takeoff_directions = data['dailyTakeoffDirections']
            changes_detected = True
        if 'dailyMinXcKm' in data:
            try:
                current_user.daily_min_xc_km = int(data['dailyMinXcKm'])
                changes_detected = True
            except (ValueError, TypeError):
                pass # Ignore invalid int
        if 'dailyAiStyle' in data:
            current_user.daily_ai_style = data['dailyAiStyle']
            changes_detected = True
        if 'dailyAutoRoute' in data:
            current_user.daily_auto_route = bool(data['dailyAutoRoute'])
            changes_detected = True

        if changes_detected:
            try:
                db.session.add(current_user)
                db.session.commit()
                print(f"DEBUG [Settings POST]: Saved. New Lang: {current_user.ai_language}")
                return jsonify({'message': 'Settings updated successfully'}), 200
            except Exception as e:
                db.session.rollback()
                logging.error(f"Error saving settings: {e}")
                return jsonify({'error': 'Failed to save settings'}), 500
        else:
            return jsonify({'message': 'No changes detected'}), 200
    
    return jsonify({'error': 'Method not allowed'}), 405


@app.route("/api/user/state", methods=["POST"])
# @login_required
def update_user_state():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    try:
        if 'lat' in data: current_user.last_lat = float(data['lat'])
        if 'lon' in data: current_user.last_lon = float(data['lon'])
        if 'zoom' in data: current_user.last_zoom = float(data['zoom'])
        if 'pitch' in data: current_user.last_pitch = float(data['pitch'])
        if 'bearing' in data: current_user.last_bearing = float(data['bearing'])
        if 'map_type' in data: current_user.last_map_type = data['map_type']
        
        db.session.commit()
        return jsonify({'message': 'State saved'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route("/api/interpret", methods=["POST"])
# @login_required
def interpret():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    asl = data.get("asl", 0)

    req_lang = data.get("language")
    req_style = data.get("style")
    req_units = data.get("units")

    if not all([lat, lon]):
        return jsonify({"error": "Missing required data."}), 400
    if current_user.credits < INTERPRETATION_COST:
        return jsonify({"error": f"Insufficient credits."}), 403

    current_user.credits -= INTERPRETATION_COST
    db.session.add(Transaction(user_id=current_user.id, type='interpretation', amount=-INTERPRETATION_COST,
                               description=f'AI interpretation for {lat},{lon}'))
    db.session.commit()

    try:
        result = get_ai_interpretation(lat, lon, asl, req_language=req_lang, req_style=req_style, req_units=req_units)
        
        # Save to DB
        new_report = AIReport(user_id=current_user.id, lat=lat, lon=lon, content=result)
        db.session.add(new_report)

        # CHECKPOINT UPDATE: Save this location as the user's last state
        current_user.last_lat = float(lat)
        current_user.last_lon = float(lon)
        # We don't have zoom/pitch/bearing in this payload usually, so we might leave them or set defaults.
        # Ideally, we would want the current view state, but `interpret` payload might be just lat/lon.
        # However, checking frontend calls, `interpret` usually happens at current view center or clicked point.
        # If we update lat/lon, the init logic will center there.
        # If we want to preserve zoom, we can check if data has it, otherwise keep current value.
        if 'zoom' in data: current_user.last_zoom = float(data['zoom'])
        if 'pitch' in data: current_user.last_pitch = float(data['pitch'])
        if 'bearing' in data: current_user.last_bearing = float(data['bearing'])
        if 'map_type' in data: current_user.last_map_type = data['map_type']
        
        db.session.commit()

        return jsonify({"interpretation": result, "remaining_credits": current_user.credits})
    except Exception as e:
        logging.error(f"AI error: {e}", exc_info=True)
        current_user.credits += INTERPRETATION_COST
        db.session.commit()
        return jsonify({"error": "AI failed."}), 500


# --- NEW BACKGROUND ROUTE ---
@app.route("/api/interpret-and-email", methods=["POST"])
# @login_required
def interpret_and_email():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    lat = data.get("lat")
    lon = data.get("lon")
    asl = data.get("asl", 0)
    email_to = data.get("email")

    # Grab user prefs for the AI (since we are generating it fresh)
    req_lang = current_user.ai_language
    req_style = current_user.ai_prompt_style
    req_units = current_user.unit_system

    if not all([lat, lon, email_to]):
        return jsonify({"error": "Missing required data."}), 400
    
    # 1. Check Credits
    if current_user.credits < INTERPRETATION_COST:
        return jsonify({"error": f"Insufficient credits."}), 403

    # 2. Check Email Rate Limit
    if not check_email_limit(current_user.id):
        return jsonify({"error": "Email limit reached. Please wait 5 minutes."}), 429

    # 3. Deduct Credits
    current_user.credits -= INTERPRETATION_COST
    db.session.add(Transaction(user_id=current_user.id, type='interpretation_email', amount=-INTERPRETATION_COST,
                               description=f'Background AI & Email for {lat},{lon}'))
    db.session.commit()

    # 4. Start Background Thread
    # We must pass the REAL app object's context to the thread so it can access config/DB if needed
    # (though our helper functions mostly use args, if they used 'current_app' it would break without this)
    app_ctx = app.app_context()
    
    thread = threading.Thread(
        target=process_interpretation_and_email,
        args=(app_ctx, current_user.id, lat, lon, asl, email_to, req_lang, req_style, req_units)
    )
    thread.start()

    return jsonify({"message": "Processing started. You will receive an email shortly.", "remaining_credits": current_user.credits}), 202


# --- EMAIL ROUTE (UPDATED) ---
@app.route("/api/send-interpretation-email", methods=["POST"])
# @login_required
def send_email_route():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    email_to = data.get('email')
    interpretation_text = data.get('interpretation')
    lat = data.get('lat')
    lon = data.get('lon')
    asl = data.get('asl', 0)

    if not email_to or not interpretation_text:
        return jsonify({'error': 'Missing email or content'}), 400

    # RATE LIMIT CHECK
    if not check_email_limit(current_user.id):
        return jsonify({"error": "Email limit reached. Please wait 5 minutes."}), 429

    success, msg = send_brevo_email(email_to, lat, lon, asl, interpretation_text)

    if success:
        return jsonify({'message': msg}), 200
    else:
        return jsonify({'error': msg}), 500


# --- ROUTE INTERPRETATION ENDPOINT ---
@app.route("/api/interpret-route", methods=["POST"])
# @login_required
def interpret_route():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    route = data.get("route")  # List of {lat, lon}
    req_lang = data.get("language")
    req_style = data.get("style")
    req_units = data.get("units")

    if not route or not isinstance(route, list) or len(route) < 2:
        return jsonify({"error": "Route must contain at least 2 points."}), 400
    
    # Cap points to avoid abuse/timeout
    if len(route) > 10:
        # Sample it down to 10 points max (start, end, and even intermediates)
        indices = np.linspace(0, len(route) - 1, 10, dtype=int)
        route = [route[i] for i in indices]

    # Calculate cost: 1 credit per point (as each is interpreted separately)
    ROUTE_COST = len(route) * INTERPRETATION_COST
    
    if current_user.credits < ROUTE_COST:
         return jsonify({"error": f"Insufficient credits. This route has {len(route)} points, requiring {ROUTE_COST} credits."}), 403

    current_user.credits -= ROUTE_COST
    db.session.add(Transaction(user_id=current_user.id, type='route_interpretation', amount=-ROUTE_COST,
                               description=f'AI Route analysis for {len(route)} points ({ROUTE_COST} credits)'))
    db.session.commit()

    try:
        # 1. Fetch Data for each point (or key points)
        # We'll fetch concurrently or sequentially. For simplicity and reliability -> Sequential loop with error handling.
        
        aggregated_data = []
        for i, point in enumerate(route):
            lat, lon = point['lat'], point['lon']
            try:
                df = get_openmeteo_data(lat, lon)
                # Just take the first meaningful time slice for "now" or "next flyable hour"
                # For summary, we'll grab specific metrics for "12:00" or next closest flying hour of TODAY/TOMORROW
                
                # Simplified Summary extraction
                now = pd.Timestamp.now(tz='UTC')
                future = df[df['date'] >= now]
                if not future.empty:
                    # Pick a representative hour (noon-ish) or next available
                    # Let's try to find next 13:00, or just taking the 1st row if close
                    rep_row = future.iloc[0]
                    
                    aggregated_data.append({
                        "point_index": i + 1,
                        "lat": lat, "lon": lon,
                        "wind_speed": rep_row['wind_speed_10m'],
                        "wind_dir": rep_row.get('wind_direction_1000hPa', 0), # Fallback
                        "cloud_cover": rep_row['cloud_cover'],
                        "thermals_cape": rep_row['cape'],
                        "temp": rep_row['temperature_2m']
                    })
            except Exception as e:
                logging.error(f"Failed to fetch data for point {i}: {e}")
                continue
        
        if not aggregated_data:
             raise ValueError("Failed to fetch weather data for any point in the route.")

        # 2. Construct Prompt
        data_summary_text = "\n".join([
            f"Point {d['point_index']} ({d['lat']:.2f},{d['lon']:.2f}): Wind {d['wind_speed']:.1f}km/h, Clouds {d['cloud_cover']:.0f}%, Thermals(CAPE) {d['thermals_cape']:.0f}"
            for d in aggregated_data
        ])

        target_language = LANGUAGE_MAP.get(req_lang, "English")
        
        prompt = f"""
        Analyze this paragliding route by interpreting EACH point separately:
        
        {data_summary_text}
        
        INSTRUCTIONS:
        - Role: Expert XC Pilot.
        - Style: {req_style or 'Concise'}
        - Language: {target_language}
        - Units: {req_units or 'metric'}
        
        STRUCTURE:
        1. **Point-by-Point Analysis**: Briefly analyze the conditions (Wind, Cloudbase, Thermals) for each point listed above.
        2. **Route Verdict**: Is the connection feasible? Where is the crux?
        
        (Make sure to provide value for every point since the pilot paid for each location analysis.)
        """
        
        # 3. Call AI (Text only for route, no meteogram image stitch yet)
        model = genai.GenerativeModel('gemini-3-pro-preview')
        response = model.generate_content(prompt)
        result_text = response.text if response.text else "AI returned no analysis."
        
        # Save Report
        new_report = AIReport(user_id=current_user.id, lat=route[0]['lat'], lon=route[0]['lon'], content=f"**Route Analysis:**\n\n{result_text}")
        db.session.add(new_report)
        db.session.commit()
        
        return jsonify({"interpretation": result_text, "remaining_credits": current_user.credits})

    except Exception as e:
        logging.error(f"Route AI error: {e}", exc_info=True)
        current_user.credits += ROUTE_COST # Refund
        db.session.commit()
        return jsonify({"error": "Route analysis failed."}), 500





@app.route("/remove_report/<int:report_id>", methods=["POST"])
# @login_required
def remove_report(report_id):
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    report = AIReport.query.get_or_404(report_id)
    if report.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        db.session.delete(report)
        db.session.commit()
        return jsonify({'message': 'Report deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route("/api/thermal-image")
# @login_required
def get_thermal_image():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    asl = request.args.get("asl", type=int, default=0)
    
    if lat is None or lon is None:
        return jsonify({'error': 'Latitude and longitude are required.'}), 400
    if not METEOBLUE_API_KEY:
        return jsonify({'error': 'Server configuration error: API Key missing'}), 500

    img_url = f"https://my.meteoblue.com/images/meteogram_thermal?lat={lat}&lon={lon}&asl={asl}&apikey={METEOBLUE_API_KEY}"
    
    try:
        # Proxy request to Meteoblue
        resp = requests.get(img_url, stream=True, timeout=10)
        resp.raise_for_status()
        
        # Stream the image back to the client
        from flask import Response, stream_with_context
        return Response(stream_with_context(resp.iter_content(chunk_size=1024)), 
                        content_type=resp.headers.get('Content-Type', 'image/png'))
    except Exception as e:
        print(f"Meteoblue Proxy Error: {e}")
        return jsonify({'error': 'Failed to retrieve thermal image'}), 502


@app.route("/api/altitude")
# @login_required
def altitude_api():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    if lat is None or lon is None:
        return jsonify({'error': 'Latitude and longitude are required.'}), 400
    try:
        response = requests.get(f'https://api.open-elevation.com/api/v1/lookup?locations={lat},{lon}', timeout=10)
        response.raise_for_status()
        return jsonify({'altitude': response.json().get('results', [{}])[0].get('elevation')})
    except Exception:
        return jsonify({'error': 'Failed to retrieve altitude'}), 500


@app.route("/api/sun-data", methods=["POST"])
# @login_required
def get_sun_data():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    lat = float(data.get("lat"))
    lon = float(data.get("lon"))
    try:
        loc = LocationInfo(latitude=lat, longitude=lon)
        now = datetime.now()
        s = sun(loc.observer, date=now.date())
        return jsonify({'received': {'altitude': round(elevation(loc.observer, now), 2),
                                     'azimuth': round(azimuth(loc.observer, now), 2),
                                     'sunrise': s['sunrise'].strftime('%H:%M'),
                                     'sunset': s['sunset'].strftime('%H:%M')}})
    except Exception:
        return jsonify({'received': None}), 500



@app.route("/proxy/paragliding-sites")
# @login_required
def proxy_paragliding_sites():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    bounds = {k: request.args.get(k) for k in ["south", "north", "west", "east"]}
    try:
        # Add User-Agent to avoid blocking
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        r = requests.get("https://www.paraglidingearth.com/api/geojson/getBoundingBoxSites.php",
                         params={**bounds, "style": "detailled"}, 
                         headers=headers,
                         timeout=5) # Reduced timeout
        r.raise_for_status()
        try:
            return jsonify(r.json())
        except ValueError:
            print(f"Upstream API Error (Non-JSON): {r.text[:200]}")
            # Return empty feature collection instead of error to keep map alive
            return jsonify({"type": "FeatureCollection", "features": []})
    except Exception as e:
        print(f"Upstream API Request Failed: {e}")
        # Return empty feature collection on failure
        return jsonify({"type": "FeatureCollection", "features": []})






@app.route("/api/tutorial_completed", methods=["POST"])
# @login_required
def set_tutorial_completed():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    current_user.tutorial_completed = True
    db.session.commit()
    return jsonify({"message": "Tutorial marked as completed."}), 200


@app.cli.command("cleanup-reports")
def cleanup_reports():
    """Delete AI reports older than 30 days."""
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)
    try:
        deleted_count = AIReport.query.filter(AIReport.timestamp < cutoff_date).delete()
        db.session.commit()
        print(f"Cleanup successful: {deleted_count} old reports deleted.")
    except Exception as e:
        db.session.rollback()
        print(f"Cleanup failed: {e}")

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        app.run(debug=True, port=5000, host='0.0.0.0')