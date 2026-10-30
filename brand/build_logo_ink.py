"""Thaimer, ink/tattoo variant: same naga-dial composition, rendered in black and white.
Usage: python3 build_logo_ink.py <out-dir>
Writes a "paper" set (black ink on off-white) and a "dark" set (light ink on black).
"""
import math
import os
import sys

from build_logo import (pt, CX, CY, R, A0, A1, FLAME, text_path,
                        MARK_CX, MARK_CY, MARK_H)

from build_logo import half_width as _base_half_width


def half_width(t):
    return _base_half_width(t) * 1.3     # heavier body for the ink style


# ingombro misurato della versione a inchiostro (testa elaborata)
MARK_CX, MARK_CY, MARK_H = 264.5, 243.5, 515

OUT = sys.argv[1] if len(sys.argv) > 1 else "out-ink"


def tail_dir(deg):
    a = math.radians(deg)
    return math.sin(a), -math.cos(a)          # direction toward the tail (angle decreasing)


def norm(deg):
    a = math.radians(deg)
    return math.cos(a), math.sin(a)           # outward normal


def ring_poly(r_in_f, r_out_f, n=160):
    """Polygon of the body between two radial fractions of the local half-width (-1 = inner edge, +1 = outer)."""
    outer, inner = [], []
    for i in range(n + 1):
        t = i / n
        deg = A0 + (A1 - A0) * t
        w = half_width(t)
        outer.append(pt(R + w * r_out_f, deg))
        inner.append(pt(R + w * r_in_f, deg))
    pts = outer + inner[::-1]
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"


BELLY = -0.36   # the belly band runs from the inner edge to here


def scales(paper):
    """Overlapping U-shaped scales following the curve of the body, opening toward the head."""
    out = []
    rows = [0.02, 0.62]
    for ri, v in enumerate(rows):
        deg = A0 - 6 - (ri % 2) * 3.4
        while deg > A1 + 2:
            t = (A0 - deg) / (A0 - A1)
            w = half_width(t)
            h = max(1.2, w * 0.31)
            cx, cy = pt(R + w * v, deg)
            nx, ny = norm(deg)
            tx, ty = tail_dir(deg)
            ax, ay = cx + nx * h, cy + ny * h
            bx, by = cx - nx * h, cy - ny * h
            qx, qy = cx + tx * h * 2.1, cy + ty * h * 2.1
            out.append(f"M{ax:.1f},{ay:.1f} Q{qx:.1f},{qy:.1f} {bx:.1f},{by:.1f}")
            step = math.degrees((2 * h * 1.05) / R)
            deg -= max(step, 1.2)
    sw = 2.0
    return f'<path d="{" ".join(out)}" fill="none" stroke="{paper}" stroke-width="{sw}" stroke-linecap="round"/>'


def belly_plates(ink):
    out = []
    deg = A0 - 5
    while deg > A1 + 3:
        t = (A0 - deg) / (A0 - A1)
        w = half_width(t)
        x1, y1 = pt(R - w * 0.98, deg)
        x2, y2 = pt(R + w * BELLY, deg)
        out.append(f'M{x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f}')
        deg -= 4.2 if t < 0.6 else 3.2
    return f'<path d="{" ".join(out)}" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>'


FLAME_LINE = "M-7,0 C-7,-10 -3,-19 1,-27 C3,-31 6,-34 10,-37"


def flames(ink, paper):
    out = []
    deg = -118.0
    while deg > -392:
        t = (A0 - deg) / (A0 - A1)
        s = 1.0 if t < 0.5 else max(0.32, 1.0 - (t - 0.5) * 1.4)
        w = half_width(t)
        x, y = pt(R + w - 2, deg)
        out.append(
            f'<g transform="translate({x:.1f},{y:.1f}) rotate({deg + 90:.1f}) scale({-s:.3f},{s:.3f})">'
            f'<path d="{FLAME}" fill="{ink}" stroke="{ink}" stroke-width="3" stroke-linejoin="round"/>'
            f'<path d="{FLAME_LINE}" fill="none" stroke="{paper}" stroke-width="2" stroke-linecap="round"/>'
            f'<circle cx="3" cy="-7" r="2.6" fill="{paper}"/></g>'
        )
        deg -= 14.5
    return "\n".join(out)


def band(deg, ink, paper):
    """Decorative band around the body with a four-petal flower, as in Thai naga ornament."""
    t = (A0 - deg) / (A0 - A1)
    w = half_width(t) + 2
    d = 3.0
    p1, p2 = pt(R - w, deg + d), pt(R + w, deg + d)
    p3, p4 = pt(R + w, deg - d), pt(R - w, deg - d)
    quad = f"M{p1[0]:.1f},{p1[1]:.1f} L{p2[0]:.1f},{p2[1]:.1f} L{p3[0]:.1f},{p3[1]:.1f} L{p4[0]:.1f},{p4[1]:.1f} Z"
    cx, cy = pt(R, deg)
    dots = "".join(
        f'<circle cx="{pt(R + w * f, deg)[0]:.1f}" cy="{pt(R + w * f, deg)[1]:.1f}" r="1.3" fill="{ink}"/>'
        for f in (-0.7, -0.35, 0.35, 0.7)
    )
    rot = deg + 45
    flower = (
        f'<g transform="translate({cx:.1f},{cy:.1f}) rotate({rot:.1f})">'
        f'<rect x="-9" y="-9" width="18" height="18" rx="3" fill="{paper}" stroke="{ink}" stroke-width="2.4"/>'
        f'<path d="M0,-7 Q3,0 0,7 Q-3,0 0,-7 Z M-7,0 Q0,3 7,0 Q0,-3 -7,0 Z" fill="{ink}"/>'
        f'<circle r="2" fill="{paper}"/></g>'
    )
    return f'<path d="{quad}" fill="{paper}" stroke="{ink}" stroke-width="2.4" stroke-linejoin="round"/>{dots}{flower}'


def ticks(ink):
    out = []
    for k in range(12):
        deg = k * 30
        major = k % 3 == 0
        x1, y1 = pt(104 if major else 109, deg)
        x2, y2 = pt(119, deg)
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke-width="{6 if major else 3.5}"/>')
    return f'<g stroke="{ink}" stroke-linecap="round">{"".join(out)}</g>'


def hand(ink, paper):
    deg = -62
    tip = pt(98, deg)
    tail = pt(-26, deg)
    px, py = math.cos(math.radians(deg + 90)), math.sin(math.radians(deg + 90))
    b1 = (CX + px * 7, CY + py * 7)
    b2 = (CX - px * 7, CY - py * 7)
    return (
        f'<path d="M{b1[0]:.1f},{b1[1]:.1f} L{tip[0]:.1f},{tip[1]:.1f} L{b2[0]:.1f},{b2[1]:.1f} L{tail[0]:.1f},{tail[1]:.1f} Z" fill="{ink}"/>'
        f'<circle cx="{CX}" cy="{CY}" r="12" fill="{ink}"/><circle cx="{CX}" cy="{CY}" r="5" fill="{paper}"/>'
    )


from head_ink2 import head  # testa in stile tatuaggio thai


def mark_group(ink, paper):
    clip_id = f"scaleclip{abs(hash(ink)) % 10000}"
    return f"""
<g>
  <defs><clipPath id="{clip_id}"><path d="{ring_poly(BELLY, 1)}"/></clipPath></defs>
  <circle cx="{CX}" cy="{CY}" r="126" fill="{paper}" stroke="{ink}" stroke-width="2.5"/>
  <circle cx="{CX}" cy="{CY}" r="99" fill="none" stroke="{ink}" stroke-width="1.2" stroke-dasharray="1.5 5" stroke-linecap="round"/>
  {ticks(ink)}
  {flames(ink, paper)}
  <path d="{ring_poly(BELLY, 1)}" fill="{ink}"/>
  <g clip-path="url(#{clip_id})">{scales(paper)}</g>
  <path d="{ring_poly(-1, BELLY)}" fill="{paper}"/>
  {belly_plates(ink)}
  <path d="{ring_poly(-1, 1)}" fill="none" stroke="{ink}" stroke-width="3.5" stroke-linejoin="round"/>
  {band(-132, ink, paper)}
  {band(-318, ink, paper)}
  {hand(ink, paper)}
  {head(ink, paper)}
</g>
"""


def svg(w, h, body, vb=None):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{vb or f"0 0 {w} {h}"}">{body}</svg>\n'


def fit(scale, cx=256, cy=256):
    return f"translate({cx},{cy}) scale({scale}) translate({-MARK_CX},{-MARK_CY})"


def icon(ink, paper, bg, scale=0.78, rounded=True):
    r = 112 if rounded else 0
    frame = f'<rect x="22" y="22" width="468" height="468" rx="{max(0, r - 22)}" fill="none" stroke="{ink}" stroke-width="3"/>' if rounded else ""
    return svg(512, 512, f'<rect width="512" height="512" rx="{r}" fill="{bg}"/>{frame}<g transform="{fit(scale)}">{mark_group(ink, paper)}</g>')


def mark(ink, paper):
    return svg(457, 523, f'<g transform="translate(-36,18)">{mark_group(ink, paper)}</g>')


def lockup(ink, paper, bg):
    W, H = 1024, 1290
    bold = "/usr/share/fonts/truetype/google-fonts/Poppins-BoldItalic.ttf"
    med = "/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf"
    word, ww = text_path("THAIMER", bold, 170, tracking=10)
    tag, tw = text_path("MUAY THAI TIMER", med, 40, tracking=14)
    ms = 1.66
    parts = []
    if bg:
        parts.append(f'<rect width="{W}" height="{H}" fill="{bg}"/>')
    parts.append(f'<g transform="translate({W/2},{70 + MARK_H*ms/2}) scale({ms}) translate({-MARK_CX},{-MARK_CY})">{mark_group(ink, paper)}</g>')
    wy = 70 + MARK_H * ms + 150
    parts.append(f'<g transform="translate({(W-ww)/2:.1f},{wy:.1f})"><g transform="skewX(-6)"><path d="{word}" fill="{ink}"/></g></g>')
    ly = wy + 34
    parts.append(f'<path d="M{(W-tw)/2 - 70:.0f},{ly + 10} h48 M{(W+tw)/2 + 22:.0f},{ly + 10} h48" stroke="{ink}" stroke-width="3" stroke-linecap="round"/>')
    parts.append(f'<g transform="translate({(W-tw)/2:.1f},{wy + 80:.1f})"><path d="{tag}" fill="{ink}"/></g>')
    return svg(W, H, "\n".join(parts))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    INK, PAPER, BLACK = "#111111", "#f4f0e6", "#0d0d0d"
    files = {
        # black ink on paper
        "ink-icon.svg": icon(INK, PAPER, PAPER),
        "ink-icon-square.svg": icon(INK, PAPER, PAPER, rounded=False),
        "ink-icon-maskable.svg": icon(INK, PAPER, PAPER, scale=0.68, rounded=False),
        "ink-mark.svg": mark(INK, PAPER),
        "ink-lockup.svg": lockup(INK, PAPER, PAPER),
        # light ink on black
        "ink-dark-icon.svg": icon(PAPER, BLACK, BLACK),
        "ink-dark-icon-square.svg": icon(PAPER, BLACK, BLACK, rounded=False),
        "ink-dark-icon-maskable.svg": icon(PAPER, BLACK, BLACK, scale=0.68, rounded=False),
        "ink-dark-mark.svg": mark(PAPER, BLACK),
        "ink-dark-lockup.svg": lockup(PAPER, BLACK, BLACK),
    }
    for name, content in files.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(content)
    print("written:", len(files), "files")
