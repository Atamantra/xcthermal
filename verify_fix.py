from app import app, db, User

with app.app_context():
    user = User.query.first()
    if user:
        try:
            print(f"User found: {user.username}")
            print(f"daily_auto_route value: {user.daily_auto_route}")
            print("SUCCESS: Attribute exists and is accessible.")
        except AttributeError:
            print("FAILURE: AttributeError: 'User' object has no attribute 'daily_auto_route'")
    else:
        print("WARNING: No users found in database to test with.")
