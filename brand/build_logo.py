"""Thaimer — generatore del logo.
Un naga (drago-serpente thailandese) forma il quadrante del timer; le fiamme "kranok" sul dorso fanno da tacche.
Disegno originale, oro su rosso (colori del muay thai). Uso: python3 build_logo.py <cartella-di-output>
"""
import math
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"

CX, CY, R = 256, 288, 150          # centro e raggio del quadrante
A0, A1 = -100.0, -400.0            # il corpo parte dal collo (in alto) e gira in senso antiorario
OUTLINE = "#3a0408"
CREAM = "#fff4d6"

DEFS = """
<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff0a8"/><stop offset=".45" stop-color="#f5b93a"/><stop offset="1" stop-color="#b86e0c"/>
  </linearGradient>
  <linearGradient id="gold2" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#f2ae2e"/><stop offset="1" stop-color="#a85f08"/>
  </linearGradient>
  <radialGradient id="bg" cx=".5" cy=".42" r=".75">
    <stop offset="0" stop-color="#b3141c"/><stop offset=".55" stop-color="#650810"/><stop offset="1" stop-color="#240205"/>
  </radialGradient>
</defs>
"""


def pt(r, deg):
    a = math.radians(deg)
    return CX + r * math.cos(a), CY + r * math.sin(a)


def half_width(t):
    """Semi-larghezza del corpo: costante, poi si assottiglia fino alla punta della coda."""
    if t < 0.58:
        return 17.0
    u = (t - 0.58) / 0.42
    return 17.0 * (1 - u ** 1.25) + 1.6


def body_path():
    n = 160
    outer, inner = [], []
    for i in range(n + 1):
        t = i / n
        deg = A0 + (A1 - A0) * t
        w = half_width(t)
        outer.append(pt(R + w, deg))
        inner.append(pt(R - w, deg))
    pts = outer + inner[::-1]
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"


FLAME = "M-14,2 C-14,-12 -6,-22 -2,-32 C0,-38 6,-42 14,-44 C8,-36 10,-30 12,-24 C15,-14 14,-6 14,2 Z"
FLAME_IN = "M-6,0 C-6,-8 -2,-15 1,-24 C4,-15 7,-8 7,0 Z"


def flames():
    out = []
    deg = -118.0
    while deg > -392:
        t = (A0 - deg) / (A0 - A1)
        s = 1.0 if t < 0.5 else max(0.32, 1.0 - (t - 0.5) * 1.4)
        w = half_width(t)
        x, y = pt(R + w - 2, deg)
        phi = deg + 90
        out.append(
            f'<g transform="translate({x:.1f},{y:.1f}) rotate({phi:.1f}) scale({-s:.3f},{s:.3f})">'
            f'<path d="{FLAME}" fill="url(#gold2)" stroke="{OUTLINE}" stroke-width="3" stroke-linejoin="round"/>'
            f'<path d="{FLAME_IN}" fill="#8a1118" opacity=".75"/></g>'
        )
        deg -= 14.5
    return "\n".join(out)


def belly_lines():
    out = []
    deg = -124.0
    while deg > -350:
        t = (A0 - deg) / (A0 - A1)
        w = half_width(t)
        x1, y1 = pt(R - w * 0.8, deg)
        x2, y2 = pt(R + w * 0.8, deg)
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
        deg -= 7.5
    return "\n".join(out)


def ticks():
    out = []
    for k in range(12):
        deg = k * 30
        major = k % 3 == 0
        x1, y1 = pt(111 if major else 114, deg)
        x2, y2 = pt(124, deg)
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke-width="{6 if major else 4}"/>')
    return "\n".join(out)


HEAD = f"""
<g transform="translate(236,140) scale(1.28) translate(-236,-140)">
<!-- cresta di fiamme -->
<g transform="translate(0,90) scale(1,.8) translate(0,-90)" fill="url(#gold2)" stroke="{OUTLINE}" stroke-width="3" stroke-linejoin="round">
  <path d="M268,92 C246,80 228,62 198,56 C212,66 214,74 210,80 C224,80 240,84 254,96 Z"/>
  <path d="M286,88 C272,68 256,50 232,36 C240,52 240,60 236,66 C250,66 262,72 274,86 Z"/>
  <path d="M302,92 C296,72 288,54 272,40 C274,56 272,64 268,68 C278,70 286,78 294,92 Z"/>
</g>
<!-- baffo -->
<path d="M374,122 C402,124 426,140 422,170 C420,184 408,190 401,184 C395,177 402,170 410,174" fill="none" stroke="{OUTLINE}" stroke-width="9" stroke-linecap="round"/>
<path d="M374,122 C402,124 426,140 422,170 C420,184 408,190 401,184 C395,177 402,170 410,174" fill="none" stroke="#f5b93a" stroke-width="4.5" stroke-linecap="round"/>
<!-- interno della bocca -->
<path d="M292,133 C318,139 344,141 366,138 L368,126 C340,132 316,134 292,133 Z" fill="#5a060c"/>
<!-- mandibola -->
<path d="M290,134 C314,139 340,142 360,140 C369,140 373,147 367,152 C340,162 312,162 290,160 C274,160 258,164 240,166 C236,160 234,154 234,148 Z"
      fill="url(#gold)" stroke="{OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
<!-- testa -->
<path d="M224,130 C230,108 246,92 268,88 C282,86 296,88 306,94 C326,98 346,98 366,102 C377,104 388,108 388,118
         C388,126 381,129 372,128 L364,132 C340,136 316,138 294,136 C282,130 268,130 256,136 C246,142 240,150 236,160 L230,150 Z"
      fill="url(#gold)" stroke="{OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
<!-- denti -->
<path d="M350,132 L357,148 L362,131 Z" fill="{CREAM}" stroke="{OUTLINE}" stroke-width="2" stroke-linejoin="round"/>
<path d="M330,138 L335,128 L340,138 Z" fill="{CREAM}" stroke="{OUTLINE}" stroke-width="2" stroke-linejoin="round"/>
<!-- sopracciglio, occhio, narice -->
<path d="M286,98 C298,90 314,92 326,100 C312,98 298,98 286,98 Z" fill="{OUTLINE}" opacity=".55"/>
<path d="M288,108 C298,96 314,98 326,106 C314,118 298,118 288,108 Z" fill="#2a0307" stroke="{OUTLINE}" stroke-width="2"/>
<path d="M300,104 C306,100 314,102 318,106 C312,110 304,110 300,104 Z" fill="#ffcf4a"/>
<circle cx="309" cy="105.5" r="2.6" fill="#2a0307"/>
<circle cx="376" cy="110" r="3" fill="{OUTLINE}"/>
<!-- squame sulla guancia -->
<g fill="none" stroke="{OUTLINE}" stroke-width="2" opacity=".45" stroke-linecap="round">
  <path d="M262,122 q6,8 14,2"/><path d="M276,130 q6,8 14,2"/><path d="M252,134 q6,8 14,2"/>
</g>
</g>
"""


def hand():
    deg = -62
    tip = pt(98, deg)
    tail = pt(-24, deg)
    # lancetta affusolata (stile "lama")
    px, py = math.cos(math.radians(deg + 90)), math.sin(math.radians(deg + 90))
    b1 = (CX + px * 7, CY + py * 7)
    b2 = (CX - px * 7, CY - py * 7)
    return (
        f'<path d="M{b1[0]:.1f},{b1[1]:.1f} L{tip[0]:.1f},{tip[1]:.1f} L{b2[0]:.1f},{b2[1]:.1f} L{tail[0]:.1f},{tail[1]:.1f} Z" '
        f'fill="{CREAM}" stroke="{OUTLINE}" stroke-width="3" stroke-linejoin="round"/>'
        f'<circle cx="{CX}" cy="{CY}" r="12" fill="url(#gold)" stroke="{OUTLINE}" stroke-width="3"/>'
        f'<circle cx="{CX}" cy="{CY}" r="4.5" fill="#8a1118"/>'
    )


def mark_group():
    """Il marchio (senza sfondo), in coordinate 512x512."""
    return f"""
<g id="mark">
  <circle cx="{CX}" cy="{CY}" r="128" fill="#2a0307" opacity=".55"/>
  <circle cx="{CX}" cy="{CY}" r="128" fill="none" stroke="#f5b93a" stroke-opacity=".5" stroke-width="2"/>
  <g stroke="{CREAM}" stroke-linecap="round" opacity=".9">{ticks()}</g>
  {flames()}
  <path d="{body_path()}" fill="url(#gold)" stroke="{OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
  <g stroke="{OUTLINE}" stroke-width="2" opacity=".32" stroke-linecap="round">{belly_lines()}</g>
  {hand()}
  {HEAD}
</g>
"""


# ingombro misurato del marchio: x 45..481, y 19..496
MARK_CX, MARK_CY = 263, 257.5
MARK_H = 477


def fit(scale, cx=256, cy=256):
    return f'translate({cx},{cy}) scale({scale}) translate({-MARK_CX},{-MARK_CY})'


def svg(width, height, body, viewbox=None):
    vb = viewbox or f"0 0 {width} {height}"
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{vb}">{DEFS}{body}</svg>\n'


def icon_svg(scale=0.82, rounded=True, size=512):
    r = 112 if rounded else 0
    return svg(size, size, f"""
<rect width="512" height="512" rx="{r}" fill="url(#bg)"/>
<g transform="{fit(scale)}">{mark_group()}</g>
""", "0 0 512 512")


def mark_svg():
    # solo marchio, sfondo trasparente (per la testata dell'app e per fondi scuri)
    return svg(444, 485, f'<g transform="translate({-41},{-15})">{mark_group()}</g>', "0 0 444 485")


# ---------- scritta convertita in tracciati (nessuna dipendenza da font installati) ----------
def text_path(text, font_path, size, tracking=0.0):
    font = TTFont(font_path)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    k = size / upm
    x = 0.0
    parts = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        tp = TransformPen(pen, (k, 0, 0, -k, x, 0))
        gs[name].draw(tp)
        parts.append(pen.getCommands())
        x += gs[name].width * k + tracking
    return " ".join(parts), x - tracking


def lockup_svg(bg=True):
    W, H = 1024, 1230
    bold = "/usr/share/fonts/truetype/google-fonts/Poppins-BoldItalic.ttf"
    med = "/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf"
    word, ww = text_path("THAIMER", bold, 170, tracking=10)
    tag, tw = text_path("MUAY THAI TIMER", med, 40, tracking=14)
    mark_scale = 1.8
    parts = []
    if bg:
        parts.append(f'<rect width="{W}" height="{H}" fill="url(#bg)"/>')
    parts.append(f'<g transform="translate({W/2},{70 + MARK_H*mark_scale/2}) scale({mark_scale}) translate({-MARK_CX},{-MARK_CY})">{mark_group()}</g>')
    wy = 70 + MARK_H * mark_scale + 150
    parts.append(
        f'<g transform="translate({(W - ww) / 2:.1f},{wy:.1f})">'
        f'<g transform="skewX(-6)"><path d="{word}" fill="url(#gold)" stroke="{OUTLINE}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/></g></g>'
    )
    parts.append(f'<g transform="translate({(W - tw) / 2:.1f},{wy + 80:.1f})"><path d="{tag}" fill="{CREAM}" opacity=".9"/></g>')
    return svg(W, H, "\n".join(parts))


if __name__ == "__main__":
    import os
    os.makedirs(OUT, exist_ok=True)
    files = {
        "icon.svg": icon_svg(0.82, True),
        "icon-square.svg": icon_svg(0.82, False),
        "icon-maskable.svg": icon_svg(0.72, False),
        "mark.svg": mark_svg(),
        "lockup.svg": lockup_svg(True),
        "lockup-transparent.svg": lockup_svg(False),
    }
    for name, content in files.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(content)
    print("scritti:", ", ".join(files))
