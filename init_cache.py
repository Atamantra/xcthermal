
from app import app, db

if __name__ == "__main__":
    with app.app_context():
        try:
            db.create_all()
            print("Successfully initialized database tables (MeteogramCache should now exist).")
        except Exception as e:
            print(f"Error initializing database: {e}")
