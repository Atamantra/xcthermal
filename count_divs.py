def find_matching_div(filepath, class_name):
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    depth = 0
    in_container = False
    start_line = 0
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        
        if not in_container and f'class="{class_name}"' in line:
            in_container = True
            start_line = i + 1
            print(f"[{i+1}] FOUND START: {line.strip()}")
            depth = 1 # We just opened the target div
            # Check if it also closes on the same line
            depth += line_lower.count('<div') - 1
            depth -= line_lower.count('</div')
            continue
            
        if in_container:
            opens = line_lower.count('<div')
            closes = line_lower.count('</div')
            
            # Simple check for self-closing divs just in case, though invalid in HTML
            # opens -= line_lower.count('/>') if '<div' in line_lower else 0
            
            depth += opens
            depth -= closes
            
            if closes > 0 and depth <= 0:
                print(f"[{i+1}] FOUND END (Depth went to {depth}): {line.strip()}")
                return
            
            if opens > 0 or closes > 0:
                pass # print(f"[{i+1}] Depth: {depth} (+{opens}, -{closes}) | {line.strip()[:60]}")

if __name__ == "__main__":
    find_matching_div("/Users/atamantra/Desktop/xcthermal-home/v1.1a/templates/index.html", "profile-container auth-modal-content")
