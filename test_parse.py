from bs4 import BeautifulSoup

with open("templates/index.html") as f:
    soup = BeautifulSoup(f.read(), "html.parser")

profile = soup.find("div", class_="profile-container")
if profile:
    print(f"Profile found! It contains {len(list(profile.children))} direct children.")
    for c in profile.children:
        if c.name:
            print(f" - {c.name} class={c.get('class')}")
            if c.name == "div" and "daily-interpreter-section" in (c.get("class") or []):
                print(f"   (daily-interpreter-section has {len(c.find_all('div'))} divs inside)")
else:
    print("Profile container NOT FOUND!")

