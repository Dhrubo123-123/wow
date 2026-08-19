"""Generates EMBER's app icons to match the golden flame-seal emblem in
src/components/branding/Logo.tsx — same composition (dark seal, gold
ring, tick marks, sunburst rays, ascending flame), rasterized since
Pillow (not an SVG renderer) is what's available in this environment.
"""
import math
from PIL import Image, ImageDraw, ImageFilter

GOLD_LIGHT = (255, 243, 196)
GOLD_MID = (255, 197, 49)
GOLD_DEEP = (169, 102, 11)
BG_DARK_IN = (42, 24, 6)
BG_DARK_OUT = (12, 6, 2)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gold_at(t):
    # 0->light, 0.45->mid, 1->deep, matching the SVG linearGradient stops.
    if t <= 0.45:
        return lerp(GOLD_LIGHT, GOLD_MID, t / 0.45)
    return lerp(GOLD_MID, GOLD_DEEP, (t - 0.45) / 0.55)


def draw_radial_bg(size, cx, cy, r):
    img = Image.new("RGB", (size, size), BG_DARK_OUT)
    px = img.load()
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / r
            t = min(1.0, d)
            px[x, y] = lerp(BG_DARK_IN, BG_DARK_OUT, t)
    return img


def draw_emblem(size, safe_zone=False):
    """safe_zone=True shrinks the emblem so it stays within the W3C
    maskable-icon safe zone (the center ~80%-diameter circle) — anything
    outside that gets clipped when the OS applies its own mask shape.
    The background still fills the canvas edge-to-edge either way."""
    S = size
    cx = cy = S / 2
    R = S * (0.37 if safe_zone else 0.46)

    base = draw_radial_bg(S, cx, cy, R * 1.4)
    draw = ImageDraw.Draw(base, "RGBA")

    # Outer + inner rings.
    ring_w = max(2, S * 0.014)
    for frac, alpha in [(1.0, 255), (0.865, 140)]:
        r = R * frac
        col = gold_at(0.35) + (alpha,)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=int(ring_w if frac == 1.0 else ring_w * 0.6))

    # Engraved tick marks.
    for i in range(28):
        angle = (i / 28) * 2 * math.pi
        r1, r2 = R * 0.94, R * 0.865
        x1, y1 = cx + math.cos(angle) * r1, cy + math.sin(angle) * r1
        x2, y2 = cx + math.cos(angle) * r2, cy + math.sin(angle) * r2
        draw.line([x1, y1, x2, y2], fill=gold_at(0.3) + (110,), width=max(1, int(S * 0.004)))

    # Sunburst rays.
    for i in range(12):
        angle = (i / 12) * 2 * math.pi
        r1, r2 = R * 0.32, R * 0.66
        x1, y1 = cx + math.cos(angle) * r1, cy + math.sin(angle) * r1
        x2, y2 = cx + math.cos(angle) * r2, cy + math.sin(angle) * r2
        draw.line([x1, y1, x2, y2], fill=gold_at(0.3) + (130,), width=max(2, int(S * 0.009)))

    # Ascending flame (approximated with a smooth polygon).
    def flame_points(scale, alpha):
        pts_norm = [
            (0.0, -0.64), (0.22, -0.36), (0.22, 0.02), (0.10, 0.24),
            (0.0, 0.40), (-0.10, 0.24), (-0.22, 0.02), (-0.22, -0.36),
        ]
        return [(cx + px * R * scale, cy + py * R * scale) for px, py in pts_norm]

    flame_img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fd = ImageDraw.Draw(flame_img)
    fd.polygon(flame_points(1.0, 255), fill=gold_at(0.4) + (255,))
    flame_img = flame_img.filter(ImageFilter.GaussianBlur(radius=max(1, S * 0.006)))
    base.paste(Image.new("RGB", (S, S), gold_at(0.4)), (0, 0), flame_img)

    inner_img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(inner_img)
    idraw.polygon(flame_points(0.62, 235), fill=GOLD_LIGHT + (235,))
    inner_img = inner_img.filter(ImageFilter.GaussianBlur(radius=max(1, S * 0.01)))
    base.paste(Image.new("RGB", (S, S), GOLD_LIGHT), (0, 0), inner_img)

    # Base arc flourish (drawn bow).
    arc_box = [cx - R * 0.46, cy + R * 0.30, cx + R * 0.46, cy + R * 0.85]
    draw.arc(arc_box, start=200, end=340, fill=gold_at(0.3) + (220,), width=max(2, int(S * 0.01)))
    dot_r = max(2, S * 0.016)
    draw.ellipse([cx - dot_r, cy + R * 0.62 - dot_r, cx + dot_r, cy + R * 0.62 + dot_r], fill=gold_at(0.3) + (255,))

    return base


def main():
    out_dir = "../public/icons"

    for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
        img = draw_emblem(size, safe_zone=False)
        img.save(f"{out_dir}/{name}")
        print("wrote", name)

    # Maskable: background fills edge-to-edge (no transparency), emblem
    # shrunk to the safe zone so Android's circular/squircle mask can't
    # clip the ring.
    maskable = draw_emblem(512, safe_zone=True)
    maskable.save(f"{out_dir}/icon-maskable-512.png")
    print("wrote icon-maskable-512.png")

    # apple-touch-icon: 180x180, no transparency (iOS ignores alpha anyway).
    apple = draw_emblem(180, safe_zone=False)
    apple.save("../public/apple-touch-icon.png")
    print("wrote apple-touch-icon.png")


if __name__ == "__main__":
    main()
