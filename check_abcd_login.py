import sys
import os
from werkzeug.security import check_password_hash

# Ensure the current directory is in sys.path
sys.path.append(os.getcwd())

from app import app, db, User
from sqlalchemy import or_

def check_credentials(username_input, password_input):
    with app.app_context():
        print(f"--- Checking Login for input: '{username_input}' ---")
        
        # 1. Check if user exists via the NEW logic
        user = User.query.filter(or_(User.username == username_input, User.email == username_input)).first()
        
        if not user:
            print("[FAIL] User not found via username OR email search.")
            return

        print(f"[INFO] Found User: ID={user.id}, Username='{user.username}', Email='{user.email}'")
        
        # 2. Check Password
        if user.password_hash:
            is_valid = user.check_password(password_input)
            print(f"[INFO] Password Check Result: {'SUCCESS' if is_valid else 'WRONG PASSWORD'}")
        else:
            print("[WARN] User has no password set (Social Login only?)")

if __name__ == "__main__":
    check_credentials("abcd", "abcd")
