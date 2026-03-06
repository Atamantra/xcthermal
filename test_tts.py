import sys
import os

# Put venv in path
sys.path.insert(0, os.path.abspath('venv/lib/python3.14/site-packages'))
# Add current dir to path
sys.path.insert(0, os.path.abspath('.'))

import inspect
from google import genai
from google.genai import types

print(dir(types.SpeechConfig))
print(dir(types.VoiceConfig))
print(dir(types.PrebuiltVoiceConfig))
