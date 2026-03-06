from playwright.sync_api import sync_playwright
import threading
import http.server
import socketserver
import time

PORT = 8000
DIRECTORY = "/Users/atamantra/Desktop/xcthermal-home/v1.1a"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

threading.Thread(target=start_server, daemon=True).start()
time.sleep(1)

def inspect_dom():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto('http://localhost:8000/templates/index.html')
        page.wait_for_timeout(2000)
        
        # open the profile modal
        page.evaluate('''() => {
            document.getElementById('profileModalOverlay').classList.add('active');
            let profile = document.querySelector('.profile-container');
            if (profile) profile.scrollTop = 900;
        }''')
        page.wait_for_timeout(500)
        
        rects = page.evaluate('''() => {
            const h1 = document.getElementById('t_aiReports');
            const profile = document.querySelector('.profile-container');
            const daily = document.querySelector('.daily-interpreter-section');
            const logs = document.querySelector('.flight-log-section');
            return {
                aiReportsParentBounds: h1 ? h1.parentElement.getBoundingClientRect() : null,
                aiReportsRect: h1 ? h1.getBoundingClientRect() : null,
                profileRect: profile ? profile.getBoundingClientRect() : null,
                dailyRect: daily ? daily.getBoundingClientRect() : null,
                logsRect: logs ? logs.getBoundingClientRect() : null,
                aiReportsDisplay: h1 ? window.getComputedStyle(h1).display : null,
                historySplitStyles: window.getComputedStyle(document.querySelector('.history-split')).cssText
            };
        }''')
        
        import json
        print(json.dumps(rects, indent=2))
        browser.close()

if __name__ == "__main__":
    inspect_dom()
