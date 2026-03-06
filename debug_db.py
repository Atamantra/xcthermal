import sys
import os

# Ensure the current directory is in sys.path
sys.path.append(os.getcwd())

try:
    from app import app, db, User
    print("Import successful.")
except Exception as e:
    print(f"Import Error: {e}")
    sys.exit(1)

with app.app_context():
    try:
        print("Checking database connection and schema...")
        # Attempt to query the User table
        user = User.query.first()
        print(f"Query successful. First user: {user}")
        
        if user:
            # Check if the new field is accessible
            print(f"Tutorial Completed Status: {user.tutorial_completed}")
        
        print("SUCCESS: Database and Model are in sync.")
    except Exception as e:
        print(f"DATABASE ERROR: {e}")
        # Print full traceback if needed
        import traceback
        traceback.print_exc()
