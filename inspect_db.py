
from app import app, db, Flight, User

with app.app_context():
    flights = Flight.query.all()
    print(f"Total Flights: {len(flights)}")
    for f in flights:
        print(f"Flight ID: {f.id}, Public ID: {f.public_id}, User ID: {f.user_id}, Date: {f.date}")
        user = User.query.get(f.user_id)
        print(f"  -> Associated User: {user.username if user else 'NONE'}")
