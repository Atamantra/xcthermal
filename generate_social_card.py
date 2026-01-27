from PIL import Image, ImageOps

def generate_social_card():
    logo_path = 'static/logo.png'
    output_path = 'static/social_card.png'
    
    # Standard social card size
    card_width, card_height = 1200, 630
    # Dark background color (Tailwind gray-800 approx)
    bg_color = (31, 41, 55, 255) # #1f2937

    try:
        # Create background
        card = Image.new('RGBA', (card_width, card_height), bg_color)
        
        # Open logo
        logo = Image.open(logo_path).convert('RGBA')
        
        # Calculate centering position
        # If logo is wider than card (unlikely given it's 500px), resize it, but here we just center
        x = (card_width - logo.width) // 2
        y = (card_height - logo.height) // 2
        
        # Paste logo (using itself as mask for transparency)
        card.paste(logo, (x, y), logo)
        
        # Save
        card.save(output_path, format='PNG')
        print(f"Generated {output_path} ({card_width}x{card_height})")

    except Exception as e:
        print(f"Error generating social card: {e}")

if __name__ == "__main__":
    generate_social_card()
