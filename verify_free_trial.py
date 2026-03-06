import requests
import json
import random

BASE_URL = "http://127.0.0.1:5000"

def test_free_trial():
    # 1. Generate a random IP to ensure clean slate
    mock_ip = f"10.0.0.{random.randint(1, 254)}"
    headers = {
        "Content-Type": "application/json",
        "X-Forwarded-For": mock_ip
    }
    payload = {
        "lat": 46.0,
        "lon": 11.0,
        "asl": 1000,
        "language": "en",
        "style": "xc",
        "units": "metric"
    }

    print(f"--- Testing mocked IP: {mock_ip} ---")

    # 2. First Request (Should Succeed)
    print("\n1. Sending FIRST request (Expect Success)...")
    try:
        resp = requests.post(f"{BASE_URL}/api/interpret", json=payload, headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print("Success! Response contains interpretation:", "interpretation" in data)
            print("Free Trial Flag:", data.get("free_trial"))
        else:
            print("Failed:", resp.text)
            return
    except Exception as e:
        print("Request failed (Server down?):", e)
        return

    # 3. Second Request (Should Fail)
    print("\n2. Sending SECOND request (Expect Failure/403)...")
    try:
        resp = requests.post(f"{BASE_URL}/api/interpret", json=payload, headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 403:
            data = resp.json()
            print("Correctly blocked!")
            print("Error Code:", data.get("error"))
            print("Message:", data.get("message"))
        else:
            print("INCORRECT! Should have been 403.")
            print("Response:", resp.text)
    except Exception as e:
        print("Request failed:", e)

if __name__ == "__main__":
    test_free_trial()
