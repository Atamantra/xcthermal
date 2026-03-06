
from aerofiles.igc import Reader as IGCReader
import io
import pprint

# Path to the example IGC file
file_path = "/Users/atamantra/Desktop/xcthermal-home/example_igc_files/2026-02-09-XCT-EIM-09.igc"

try:
    with open(file_path, 'r') as f:
        content_str = f.read()

    print(f"File size: {len(content_str)} bytes")
    
    f_io = io.StringIO(content_str)
    igc = IGCReader()
    base_parsed = igc.read(f_io)
    
    print("\n--- Top Level Keys ---")
    print(base_parsed.keys())
    
    print("\n--- Header Structure ---")
    if 'header' in base_parsed:
        print(f"Type: {type(base_parsed['header'])}")
        print(f"Length: {len(base_parsed['header'])}")
        if len(base_parsed['header']) > 0:
            print("First item:", base_parsed['header'][0])
            print("Type of first item:", type(base_parsed['header'][0]))
    
    print("\n--- Fix Records Structure ---")
    if 'fix_records' in base_parsed:
        records = base_parsed['fix_records']
        print(f"Type: {type(records)}")
        print(f"Length: {len(records)}")
        
        # Check first non-empty one if any
        if len(records) > 0:
            print("First record:", records[0])
            if isinstance(records[0], dict):
                print("Keys:", records[0].keys())

    # Check for other record types
    print("\n--- K Records / Extensions ---")
    print("k_records:", len(base_parsed.get('k_records', [])))
    
    # Try to find Date in headers manually if it's a list (not dict)
    # Usually IGC headers are like: {'source': 'F', 'name': 'DTE', 'value': '090226'}
    # If it is a list of something else, we need to know what.

except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
