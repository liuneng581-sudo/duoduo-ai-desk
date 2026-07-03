"""Generate 多多AI客服 app icon — red rounded square with white '多' character."""
from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [16, 24, 32, 48, 64, 128, 256]
BG_COLOR = (229, 62, 62)  # #E53E3E Pinduoduo red
FG_COLOR = (255, 255, 255)
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

def create_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded square background
    margin = max(1, size // 16)
    radius = size // 6
    draw.rounded_rectangle(
        [margin, margin, size - margin - 1, size - margin - 1],
        radius=radius,
        fill=BG_COLOR
    )

    # Try to draw text, fall back to simple mark
    font_size = int(size * 0.6)
    try:
        # macOS system Chinese font
        font = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", font_size, index=3)
    except Exception:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", font_size)
        except Exception:
            font = ImageFont.load_default()

    text = "多"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) / 2 - bbox[0]
    y = (size - text_h) / 2 - bbox[1]
    draw.text((x, y), text, fill=FG_COLOR, font=font)

    return img

# Generate all sizes
images = [create_icon(s) for s in SIZES]

# Save as multi-resolution ICO
ico_path = os.path.join(OUT_DIR, "icon.ico")
images[0].save(
    ico_path,
    format="ICO",
    sizes=[(s, s) for s in SIZES],
    append_images=images[1:]
)
print(f"✅ Icon saved: {ico_path} ({os.path.getsize(ico_path)} bytes)")

# Also save a PNG for other uses
png_path = os.path.join(OUT_DIR, "icon.png")
images[-1].save(png_path, format="PNG")
print(f"✅ PNG saved: {png_path}")
