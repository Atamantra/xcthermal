import sys
print("PRE-IMPORT", file=sys.stderr)
try:
    from app import app, db
    print("POST-IMPORT", file=sys.stderr)
except Exception as e:
    print(f"IMPORT ERROR: {e}", file=sys.stderr)
    sys.exit(1)

if __name__ == '__main__':
    try:
        with app.app_context():
            db.create_all()
            print("DB created, starting run...", file=sys.stderr)
            app.run(debug=False, port=5001, host='0.0.0.0')
    except Exception as e:
        print(f"RUN ERROR: {e}", file=sys.stderr)
