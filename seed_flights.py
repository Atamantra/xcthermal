
import logging
from app import app, db, User, Flight
from datetime import datetime, time, date
import uuid

# Setup logging
logging.basicConfig(level=logging.INFO)

def seed_db():
    with app.app_context():
        # Ensure a user exists
        user = User.query.first()
        if not user:
            print("Creating dummy user...")
            user = User(username='TestPilot', email='test@example.com')
            user.set_password('password')
            db.session.add(user)
            db.session.commit()
        
        print(f"Seeding flights for user: {user.username}")

        # Dummy IGC content (minimal)
        dummy_igc = """
AXXX Test Flight
HFDTE160226
B1200003630000N13800000EA0100001100
B1201003630100N13800100EA0110001200
B1202003630200N13800200EA0120001300
B1203003630100N13800300EA0115001250
B1204003630000N13800400EA0100001100
        """.strip()

        # Check if flights exist to avoid dupes (optional, but good)
        if Flight.query.count() == 0:
            flight1 = Flight(
                public_id=uuid.uuid4().hex[:8],
                user_id=user.id,
                filename="Test_Flight_1.igc",
                site_name="Babadag 1700",
                igc_content=dummy_igc,
                date=date(2026, 2, 16),
                start_time=time(12, 0, 0),
                end_time=time(12, 30, 0),
                duration_min=30,
                distance_km=15.5,
                max_alt=2500,
                height_gain=1200
            )
            
            flight2 = Flight(
                public_id=uuid.uuid4().hex[:8],
                user_id=user.id,
                filename="Mt_Olympus_XC.igc",
                site_name="Mt Olympus",
                igc_content=dummy_igc,
                date=date(2026, 2, 15),
                start_time=time(14, 0, 0),
                end_time=time(15, 45, 0),
                duration_min=105,
                distance_km=42.8,
                max_alt=3200,
                height_gain=1800
            )

            db.session.add(flight1)
            db.session.add(flight2)
            db.session.commit()
            print("Successfully seeded 2 flights!")
        else:
            print("Flights already exist. Skipping seed.")

if __name__ == "__main__":
    seed_db()
