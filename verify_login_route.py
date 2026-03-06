import sys
import os

# Ensure the current directory is in sys.path
sys.path.append(os.getcwd())

from app import app, db, User

def run_test():
    with app.app_context():
        # Setup Test User
        test_user_name = "route_test_user"
        test_email = "route@test.com"
        test_pass = "password123"
        
        user = User.query.filter_by(username=test_user_name).first()
        if user:
            db.session.delete(user)
            db.session.commit()
            
        user = User(username=test_user_name, email=test_email)
        user.set_password(test_pass)
        db.session.add(user)
        db.session.commit()
        
        print(f"Created test user: {test_user_name} / {test_email}")

    client = app.test_client()
    
    # Enable testing mode to propagate exceptions? 
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False # If CSRF was enabled (it's not explicitly in the code I saw, but good practice)

    print("\n--- Testing Login Route ---")
    
    # 1. Login with Username
    print("Attempting login with USERNAME...")
    rv = client.post('/login', data=dict(
        username=test_user_name,
        password=test_pass
    ), follow_redirects=True)
    
    if b"Logged in successfully" in rv.data:
        print("  [PASS] Login with Username succeeded.")
    else:
        print("  [FAIL] Login with Username failed.")
        print(rv.data)

    # Logout to clear session
    client.get('/logout', follow_redirects=True)

    # 2. Login with Email
    print("\nAttempting login with EMAIL...")
    rv = client.post('/login', data=dict(
        username=test_email,  # Form field is still 'username'
        password=test_pass
    ), follow_redirects=True)
    
    if b"Logged in successfully" in rv.data:
        print("  [PASS] Login with Email succeeded.")
    else:
        print("  [FAIL] Login with Email failed.")
        # print(rv.data) # Reduce noise

    # Cleanup
    with app.app_context():
        user = User.query.filter_by(username=test_user_name).first()
        if user:
            db.session.delete(user)
            db.session.commit()
            print("\nTest user cleaned up.")

if __name__ == "__main__":
    run_test()
