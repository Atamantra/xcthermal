from app import app, db
from sqlalchemy import inspect

with app.app_context():
    inspector = inspect(db.engine)
    columns = [col['name'] for col in inspector.get_columns('user')]
    print(f"User table columns: {columns}")
    
    # Check for likely culprits
    expected = ['daily_ai_style', 'daily_min_xc_km', 'daily_takeoff_directions', 'daily_email_enabled', 'daily_auto_route']
    missing = [col for col in expected if col not in columns]
    if missing:
        print(f"MISSING COLUMNS: {missing}")
    else:
        print("All expected daily settings columns are present.")
