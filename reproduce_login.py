import sys
import os
from werkzeug.security import generate_password_hash, check_password_hash

# Ensure the current directory is in sys.path
sys.path.append(os.getcwd())

from app import app, db, User
from sqlalchemy import or_

def test_login(input_str, password):
    print(f"Attempting login with input: '{input_str}'...")
    # This logic mimics the PROPOSED fix to see if it works, 
    # OR we can mimic the CURRENT logic to show it failing first.
    # Let's write the script to test the LOGIC we want to see working.
    
    # Current Logic (will fail for email):
    # user = User.query.filter_by(username=input_str).first()
    
    # New Logic (what we want):
    user = User.query.filter((User.username == input_str) | (User.email == input_str)).first()
    
    if user:
        if user.check_password(password):
            print(f"  [SUCCESS] Found user '{user.username}' and password matched.")
            return True
        else:
            print(f"  [FAILED] Found user '{user.username}' but password incorrect.")
            return False
    else:
        print(f"  [FAILED] No user found for input '{input_str}'.")
        return False

with app.app_context():
    print("--- Setting up Test User ---")
    test_user_name = "login_test_user"
    test_email = "login@test.com"
    test_pass = "password123"
    
    user = User.query.filter_by(username=test_user_name).first()
    if not user:
        user = User(username=test_user_name, email=test_email)
        user.set_password(test_pass)
        db.session.add(user)
        db.session.commit()
        print(f"Created test user: {test_user_name} / {test_email}")
    else:
        # Update password just in case
        user.set_password(test_pass)
        db.session.commit()
        print(f"Reset password for existing test user: {test_user_name}")

    print("\n--- Testing Login Logic ---")
    
    # 1. Test Username Login
    print("Test 1: Login by Username")
    test_login(test_user_name, test_pass)
    
    # 2. Test Email Login
    print("\nTest 2: Login by Email")
    test_login(test_email, test_pass)
    
    # 3. Test Invalid
    print("\nTest 3: Invalid User")
    test_login("nonexistent", test_pass)
