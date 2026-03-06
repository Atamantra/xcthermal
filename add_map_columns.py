import sqlite3
import os
from app import app

# Database path
db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'instance', 'site.db')

def migrate():
    print(f"Connecting to database at {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    columns_to_add = [
        ("last_lat", "FLOAT"),
        ("last_lon", "FLOAT"),
        ("last_zoom", "FLOAT"),
        ("last_pitch", "FLOAT"),
        ("last_bearing", "FLOAT"),
        ("last_map_type", "VARCHAR(10) DEFAULT '2d'")
    ]

    for col_name, col_type in columns_to_add:
        try:
            print(f"Adding column {col_name}...")
            cursor.execute(f"ALTER TABLE user ADD COLUMN {col_name} {col_type}")
            print(f"Successfully added {col_name}.")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print(f"Column {col_name} already exists. Skipping.")
            else:
                print(f"Error adding {col_name}: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
