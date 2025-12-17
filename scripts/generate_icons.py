#!/usr/bin/env python3
"""
Generate Writer AI icons with a "W" letter
Requires: pip install Pillow
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import os
except ImportError:
    print("Error: Pillow is required. Install it with: pip install Pillow")
    exit(1)


def create_gradient(size):
    """Create a gradient from purple to darker purple"""
    img = Image.new('RGB', (size, size))
    draw = ImageDraw.Draw(img)

    # Define gradient colors
    start_color = (102, 126, 234)  # #667eea
    end_color = (118, 75, 162)     # #764ba2

    for y in range(size):
        # Calculate color interpolation
        ratio = y / size
        r = int(start_color[0] + (end_color[0] - start_color[0]) * ratio)
        g = int(start_color[1] + (end_color[1] - start_color[1]) * ratio)
        b = int(start_color[2] + (end_color[2] - start_color[2]) * ratio)

        draw.line([(0, y), (size, y)], fill=(r, g, b))

    return img


def create_rounded_rectangle_mask(size, radius):
    """Create a mask for rounded corners"""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)

    # Draw rounded rectangle
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius, fill=255)

    return mask


def generate_icon(size, output_path):
    """Generate a single icon"""
    # Create gradient background
    img = create_gradient(size)

    # Apply rounded corners
    radius = int(size * 0.2)
    mask = create_rounded_rectangle_mask(size, radius)
    img.putalpha(mask)

    # Convert to RGBA
    img = img.convert('RGBA')

    # Draw the "W" letter
    draw = ImageDraw.Draw(img)

    # Calculate font size
    font_size = int(size * 0.6)

    # Try to use a good font, fallback to default
    try:
        # Try common system fonts
        font_paths = [
            "/System/Library/Fonts/Helvetica.ttc",  # macOS
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
            "C:\\Windows\\Fonts\\arialbd.ttf",  # Windows
            "/System/Library/Fonts/SFNSDisplay.ttf",  # macOS SF
        ]

        font = None
        for font_path in font_paths:
            if os.path.exists(font_path):
                font = ImageFont.truetype(font_path, font_size)
                break

        if font is None:
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()

    # Get text bounding box
    text = "W"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    # Center the text
    x = (size - text_width) // 2 - bbox[0]
    y = (size - text_height) // 2 - bbox[1]

    # Draw white "W"
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

    # Save
    img.save(output_path, 'PNG')
    print(f"Created {output_path}")


def main():
    # Create icons directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(os.path.dirname(script_dir), 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    # Generate icons
    sizes = [16, 32, 48, 128]
    print("Generating Writer AI icons with 'W' letter...")

    for size in sizes:
        output_path = os.path.join(icons_dir, f'icon{size}.png')
        generate_icon(size, output_path)

    print("\n✅ All icons generated successfully!")
    print(f"📁 Icons saved to: {icons_dir}")


if __name__ == '__main__':
    main()
