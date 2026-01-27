
import sqlite3
import os

# Connect to the SQLite database
db_path = 'instance/site.db'

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Attempt to add waiver_accepted column
    try:
        cursor.execute("ALTER TABLE user ADD COLUMN waiver_accepted BOOLEAN DEFAULT 0")
        print("Added 'waiver_accepted' column.")
    except sqlite3.OperationalError as e:
        print(f"Skipping 'waiver_accepted' (may already exist): {e}")

    # Attempt to add waiver_accepted_at column
    try:
        cursor.execute("ALTER TABLE user ADD COLUMN waiver_accepted_at DATETIME")
        print("Added 'waiver_accepted_at' column.")
    except sqlite3.OperationalError as e:
        print(f"Skipping 'waiver_accepted_at' (may already exist): {e}")

    conn.commit()
    print("Migration completed successfully.")

except Exception as e:
    print(f"An error occurred: {e}")
    conn.rollback()

finally:
    conn.close()
