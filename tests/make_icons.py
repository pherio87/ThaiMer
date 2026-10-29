"""Genera le icone della PWA (cronometro arancione su fondo scuro)."""
import math
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
BG = (11, 15, 20)
ACCENT = (255, 107, 44)
WHITE = (238, 242, 246)


def draw_icon(size, safe, rounded):
    """safe = frazione del lato usata dal disegno (le icone maskable richiedono margine)."""
    S = size * 4  # supersampling
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)

    cx, cy = S / 2, S * 0.54
    r = S * safe * 0.36
    ring = max(2, int(r * 0.17))
    # quadrante
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT, width=ring)
    # pulsante in alto
    bw, bh = r * 0.42, r * 0.2
    d.rounded_rectangle([cx - bw / 2, cy - r - bh * 1.5, cx + bw / 2, cy - r - bh * 0.35], radius=int(bh * 0.3), fill=ACCENT)
    d.rectangle([cx - bw * 0.14, cy - r - bh * 0.4, cx + bw * 0.14, cy - r + ring * 0.2], fill=ACCENT)
    # lancetta (verso le ore 2)
    ang = math.radians(-50)
    hx, hy = cx + math.cos(ang) * r * 0.62, cy + math.sin(ang) * r * 0.62
    d.line([cx, cy, hx, hy], fill=WHITE, width=max(2, int(ring * 0.9)))
    dot = ring * 0.8
    d.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


draw_icon(192, 1.0, True).save(f"{OUT}/icon-192.png")
draw_icon(512, 1.0, True).save(f"{OUT}/icon-512.png")
draw_icon(512, 0.78, False).save(f"{OUT}/icon-maskable-512.png")  # pieno, con zona sicura
draw_icon(180, 1.0, False).save(f"{OUT}/apple-touch-icon.png")
print("ok")
