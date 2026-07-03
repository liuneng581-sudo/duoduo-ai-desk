"""Generate 多多AI客服 icon using pure Python (no deps)."""
import struct, zlib, os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
W, H = 256, 256
BG = (229, 62, 62, 255)  # #E53E3E red

def create_png():
    """Create a red circle icon on transparent background."""
    raw = b""
    cx, cy = W // 2, H // 2
    r = W // 2 - 12  # circle radius

    # Draw text "多" using simple pixel pattern (5x7 font approximation)
    # For simplicity, just do a circle icon with a white center dot
    for y in range(H):
        raw += b"\x00"  # filter byte
        for x in range(W):
            dist = ((x - cx)**2 + (y - cy)**2) ** 0.5
            if dist <= r:
                # Inside circle
                if dist <= r * 0.35:
                    # Inner white circle (stylized "dot")
                    raw += struct.pack("BBBB", 255, 255, 255, 255)
                else:
                    raw += struct.pack("BBBB", *BG)
            else:
                raw += struct.pack("BBBB", 0, 0, 0, 0)

    def chunk(ctype, data):
        c = ctype + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")

    return sig + ihdr + idat + iend

def png_to_ico(png_data, size=256):
    """Wrap PNG in ICO format."""
    # ICO header + 1 entry + PNG data
    num_images = 1
    offset = 6 + 16  # header + 1 directory entry
    entry = struct.pack("<BBBBHHIH", size if size < 256 else 0, size if size < 256 else 0, 0, 0, 1, 32, len(png_data), offset)
    header = struct.pack("<HHH", 0, 1, num_images)
    return header + entry + png_data

png_data = create_png()
ico_data = png_to_ico(png_data)

ico_path = os.path.join(OUT_DIR, "icon.ico")
with open(ico_path, "wb") as f:
    f.write(ico_data)
print(f"✅ icon.ico created ({len(ico_data)} bytes)")

png_path = os.path.join(OUT_DIR, "icon.png")
with open(png_path, "wb") as f:
    f.write(png_data)
print(f"✅ icon.png created ({len(png_data)} bytes)")
