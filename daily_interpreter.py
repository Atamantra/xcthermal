import time
import logging
from datetime import datetime, timedelta, timezone
from app import app, db, User, UserActivity, get_ai_interpretation, send_brevo_email

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("daily_interpreter.log"),
        logging.StreamHandler()
    ]
)

def run_daily_interpreter():
    """
    Checks weather for all users with daily emails enabled.
    If conditions are 'XC Perfect', sends an email.
    """
    logging.info("Starting Daily Interpreter Cycle...")
    
    with app.app_context():
        # 1. Get Users with Daily Email Enabled
        users = User.query.filter_by(daily_email_enabled=True).all()
        logging.info(f"Found {len(users)} users with daily emails enabled.")
        
        for user in users:
            try:
                # 2. Context Retrieval & Validation
                if not (user.xc_perfect_lat and user.xc_perfect_lon):
                    logging.warning(f"User {user.username} (ID: {user.id}) has daily emails on but no location set. Skipping.")
                    continue
                
                # Check Rate Limiting (UserActivity)
                # Ensure we haven't sent an automatic report in the last 20 hours
                last_report = UserActivity.query.filter_by(
                    user_id=user.id, 
                    action='automatic_daily_report'
                ).order_by(UserActivity.timestamp.desc()).first()
                
                if last_report:
                    time_since = datetime.now(timezone.utc) - last_report.timestamp.replace(tzinfo=timezone.utc)
                    if time_since < timedelta(hours=20):
                        logging.info(f"User {user.username} already received a report {time_since} ago. Skipping.")
                        continue

                logging.info(f"Processing User: {user.username} (Lat: {user.xc_perfect_lat}, Lon: {user.xc_perfect_lon})")

                # 3. Weather Evaluation & AI Analysis
                # We specifically request 'xcperfect' style and the user's preferred language
                interpretation = get_ai_interpretation(
                    lat=user.xc_perfect_lat,
                    lon=user.xc_perfect_lon,
                    asl=user.xc_perfect_asl or 0,
                    req_style='xcperfect',
                    req_language=user.ai_language,
                    req_units=user.unit_system
                )

                # 4. Smart Filtering
                # Check for "✅ XC STATUS: GO!"
                if interpretation and interpretation.strip().startswith("✅ XC STATUS: GO!"):
                    logging.info(f"  -> MATCH: XC Perfect conditions detected for {user.username}!")
                    
                    # 5. Delivery
                    sent = send_brevo_email(
                        email_to=user.email,
                        lat=user.xc_perfect_lat,
                        lon=user.xc_perfect_lon,
                        asl=user.xc_perfect_asl or 0,
                        interpretation_text=interpretation
                    )
                    
                    if sent:
                        logging.info(f"     -> Email sent successfully to {user.email}")
                        
                        # 6. Logging / Rate Limiting Update
                        activity = UserActivity(
                            user_id=user.id,
                            action='automatic_daily_report',
                            details=f"Sent XC Perfect report for {user.xc_perfect_lat}, {user.xc_perfect_lon}",
                            ip_address="127.0.0.1" # Internal script
                        )
                        db.session.add(activity)
                        db.session.commit()
                    else:
                        logging.error(f"     -> Failed to send email to {user.email}")
                else:
                    logging.info(f"  -> No Match: Conditions not ideal ('{interpretation[:30]}...').")
                
                # Sleep briefly to be nice to APIs
                time.sleep(2)

            except Exception as e:
                logging.error(f"Error processing user {user.username}: {e}", exc_info=True)
                # Continue to next user even if one fails
                continue
                
    logging.info("Daily Interpreter Cycle Completed.")

if __name__ == "__main__":
    run_daily_interpreter()
