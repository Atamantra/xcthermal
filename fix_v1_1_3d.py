import os

target_file = '../v1.1_3d/app.py'

try:
    with open(target_file, 'r') as f:
        content = f.read()

    # The string to replace
    bad_line = "app = Flask(__name__, template_folder='templates', static_folder='static')"
    
    # The replacement (using defined basedir)
    new_lines = """# Fixed absolute paths
template_dir = os.path.join(basedir, 'templates')
static_dir = os.path.join(basedir, 'static')
app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)"""

    if bad_line in content:
        new_content = content.replace(bad_line, new_lines)
        with open(target_file, 'w') as f:
            f.write(new_content)
        print("Successfully patched v1.1_3d/app.py")
    else:
        print("Target line not found. It might have been already fixed or formatted differently.")
        # Debugging: print around the expected location if possible, or just exact match check failing
        # Let's hope exact match works. The diff showed it exactly.

except Exception as e:
    print(f"Error: {e}")
