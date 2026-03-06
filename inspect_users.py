import sys
import os

# Ensure the current directory is in sys.path
sys.path.append(os.getcwd())

from app import app, db, User

with app.app_context():
    print("--- Inspecting Users ---")
    users = User.query.all()
    for u in users:
        print(f"ID: {u.id} | User: {u.username} | Email: {u.email} | Credits: {u.credits}")
        if u.password_hash:
            print(f"  Hash: {u.password_hash[:20]}...")
        else:
            print("  Hash: None (Social Login?)")
    print(f"Total Users: {len(users)}")
