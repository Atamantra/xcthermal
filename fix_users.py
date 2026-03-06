
from app import app, db, Flight, User
import uuid

with app.app_context():
    # 1. Delete TestPilot
    test_pilot = User.query.filter_by(username='TestPilot').first()
    if test_pilot:
        print(f"Deleting TestPilot (ID: {test_pilot.id}) and their flights...")
        Flight.query.filter_by(user_id=test_pilot.id).delete()
        db.session.delete(test_pilot)
        db.session.commit()
        print("TestPilot deleted.")
    
    # 2. Create 'abcd' user if not exists
    abcd_user = User.query.filter_by(username='abcd').first()
    if not abcd_user:
        print("Creating 'abcd' user...")
        abcd_user = User(username='abcd', email='abcd@example.com', credits=100)
        abcd_user.set_password('password') # Or whatever default password
        db.session.add(abcd_user)
        db.session.commit()
        print(f"'abcd' user created with ID: {abcd_user.id}")
    else:
        print(f"'abcd' user already exists (ID: {abcd_user.id}).")

    # Verify
    print("\nCurrent Users:")
    for u in User.query.all():
        print(f"- {u.username} (ID: {u.id})")
        
    print("\nCurrent Flights:")
    flights = Flight.query.all()
    if not flights:
        print("No flights in DB.")
    for f in flights:
        print(f"- Flight {f.id} (User: {f.user_id})")
