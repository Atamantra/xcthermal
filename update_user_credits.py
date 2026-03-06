import sys
import os

# Ensure the current directory is in sys.path
sys.path.append(os.getcwd())

from app import app, db, User

with app.app_context():
    email = "doganliataberk@gmail.com"
    user = User.query.filter_by(email=email).first()
    
    if user:
        print(f"Found user: {user.username} (ID: {user.id})")
        print(f"Current credits: {user.credits}")
        
        user.credits = 200
        db.session.commit()
        
        print(f"Updated credits to: {user.credits}")
    else:
        print(f"User with email {email} not found.")

