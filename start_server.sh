#!/bin/bash
cd /home/bigolden/xcthermal
source venv/bin/activate
pkill -f gunicorn
sleep 1
nohup gunicorn -w 4 -b 0.0.0.0:5001 wsgi:app > server.log 2>&1 &
echo "Gunicorn started."
sleep 3
tail -n 20 server.log
