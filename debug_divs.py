import re

def trace_divs(filepath, start_line, end_line):
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    depth = 0
    print(f"Tracing DIVs from line {start_line} to {end_line}")
    for i in range(start_line - 1, min(end_line, len(lines))):
        line = lines[i]
        line_lower = line.lower()
        
        opens = len(re.findall(r'<div\b', line_lower))
        closes = line_lower.count('</div')
        
        depth += opens
        depth -= closes
        
        if opens > 0 or closes > 0: 
            clean_line = line.strip()[:80]
            print(f"L{i+1:04d} [Depth: {depth:2d}] (+{opens}, -{closes}) | {clean_line}")

if __name__ == "__main__":
    trace_divs("/Users/atamantra/Desktop/xcthermal-home/v1.1a/templates/index.html", 1245, 1700)
