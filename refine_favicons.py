from PIL import Image
import os

def refine_favicons():
    source_path = 'static/favicon.png'
    
    if not os.path.exists(source_path):
        print(f"Error: {source_path} not found.")
        return

    try:
        img = Image.open(source_path).convert('RGBA')
        datas = img.getdata()
        
        # 1. Detect Background Color
        # We assume the "box" background is the most common non-transparent color 
        # or simply sample a specific point known to be background.
        # Since corners are transparent (0,0,0,0), let's look at a point likely to be the box.
        # (128, 5) - Top center, inside the box?
        # Or let's just count frequencies of non-transparent pixels.
        
        color_counts = {}
        for item in datas:
            if item[3] > 0: # Non-transparent
                color_counts[item] = color_counts.get(item, 0) + 1
        
        # Sort by frequency
        sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)
        if not sorted_colors:
            print("Image is fully transparent?")
            return

        bg_color = sorted_colors[0][0] # Most common color is likely the background
        print(f"Detected background color: {bg_color}")
        
        # 2. Key out the background
        new_data = []
        tolerance = 10 # Allow slight variation
        
        for item in datas:
            # Check difference only on RGB channels
            diff = sum([abs(item[i] - bg_color[i]) for i in range(3)])
            if diff <= tolerance and item[3] > 0:
                new_data.append((0, 0, 0, 0)) # Make Transparent
            else:
                new_data.append(item)
        
        img_transparent = Image.new('RGBA', img.size)
        img_transparent.putdata(new_data)
        
        # Save exact transparent version
        img_transparent.save('static/favicon_transparent.png', 'PNG')
        print("Generated static/favicon_transparent.png")
        
        # 3. Regenerate Small Favicons from Transparent Source
        sizes = {
            'favicon-32x32.png': (32, 32),
            'favicon-16x16.png': (16, 16)
            # NOT apple-touch-icon, keep that as original box
        }
        
        for filename, size in sizes.items():
            out_path = os.path.join('static', filename)
            # Lanczos functionality
            resized_img = img_transparent.resize(size, resample=Image.Resampling.LANCZOS)
            resized_img.save(out_path, format='PNG')
            print(f"Refined {out_path}")

        # 4. Regenerate .ico from Transparent Source
        ico_sizes = [(16, 16), (32, 32), (48, 48)]
        ico_images = []
        for size in ico_sizes:
            ico_images.append(img_transparent.resize(size, resample=Image.Resampling.LANCZOS))
            
        ico_path = os.path.join('static', 'favicon.ico')
        ico_images[0].save(ico_path, format='ICO', sizes=ico_sizes, append_images=ico_images[1:])
        print(f"Refined {ico_path}")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    refine_favicons()
