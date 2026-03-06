
import pycountry
try:
    languages = {l.alpha_2: l.name for l in pycountry.languages if hasattr(l, 'alpha_2')}
    print(f"Successfully loaded {len(languages)} languages.")
    print(f"EN: {languages.get('en')}")
    print(f"TR: {languages.get('tr')}")
except Exception as e:
    print(f"Error: {e}")
