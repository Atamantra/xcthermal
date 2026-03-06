from PIL import Image
import os

def generate_favicons():
    source_path = 'static/favicon.png'
    
    if not os.path.exists(source_path):
        print(f"Error: {source_path} not found.")
        return

    try:
        img = Image.open(source_path)
        # Ensure RGBA for transparency
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # 1. Generate PNGs (High Quality)
        sizes = {
            'favicon-32x32.png': (32, 32),
            'favicon-16x16.png': (16, 16),
            'apple-touch-icon.png': (180, 180)
        }
        
        for filename, size in sizes.items():
            out_path = os.path.join('static', filename)
            # Use Lanczos for high quality downsampling
            resized_img = img.resize(size, resample=Image.Resampling.LANCZOS)
            resized_img.save(out_path, format='PNG')
            print(f"Generated {out_path}")

        # 2. Generate favicon.ico (Multiple sizes in one file)
        # Standard sizes for ico: 16, 32, 48
        ico_sizes = [(16, 16), (32, 32), (48, 48)]
        ico_images = []
        for size in ico_sizes:
            ico_images.append(img.resize(size, resample=Image.Resampling.LANCZOS))
            
        ico_path = os.path.join('static', 'favicon.ico')
        # Save as ICO containing multiple sizes
        ico_images[0].save(ico_path, format='ICO', sizes=ico_sizes, append_images=ico_images[1:])
        print(f"Generated {ico_path} (containing {ico_sizes})")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    generate_favicons()
