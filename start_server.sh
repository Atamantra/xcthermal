#!/bin/bash
cd "$(dirname "$0")"

if [ -f "venv/bin/gunicorn" ]; then
    source venv/bin/activate
    GUNICORN_PATH="venv/bin/gunicorn"
elif [ -f ".venv/bin/gunicorn" ]; then
    source .venv/bin/activate
    GUNICORN_PATH=".venv/bin/gunicorn"
else
    echo "No valid virtual environment with gunicorn found!"
    exit 1
fi

echo "Using gunicorn: $GUNICORN_PATH"

pkill -f gunicorn
sleep 1


# Fix for macOS High Sierra and later multithreading issue
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES

nohup $GUNICORN_PATH -w 4 -t 120 -b 0.0.0.0:5001 wsgi:app > server.log 2>&1 &
echo "Gunicorn started on port 5001."
sleep 3
tail -n 20 server.log
