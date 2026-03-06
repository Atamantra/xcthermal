
import requests

def test_tile(layer_name):
    # Random tile coordinate roughly in the Alps (Z=10, X=535, Y=358) 
    # Note: Y might need to be inverted for standard XYZ vs TMS. 
    # KK7 uses TMS. 
    # Standard Tile: Z=10, X=535, Y=358.
    # TMS Y = (2^Z - 1) - Y = 1023 - 358 = 665.
    
    # Let's try both to be sure we hit *something*.
    
    url = f"https://thermal.kk7.ch/tiles/{layer_name}/10/535/358.png?src=direct"
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'http://localhost:5001/'
        }
        print(f"Testing {layer_name}...")
        r = requests.get(url, headers=headers, timeout=5)
        print(f"URL: {url}")
        print(f"Status: {r.status_code}")
        if r.status_code != 200:
            print("Trying TMS inverted Y (665)...")
            url_tms = f"https://thermal.kk7.ch/tiles/{layer_name}/10/535/665.png?src=direct"
            r2 = requests.get(url_tms, headers=headers, timeout=5)
            print(f"URL: {url_tms}")
            print(f"Status: {r2.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")

test_tile("skyways_all_all")
test_tile("thermals_all_all")
test_tile("certainty_all_all")
test_tile("hotspots_all_all")
