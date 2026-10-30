"""Testa del naga in stile tatuaggio thai (versione inchiostro), disegno originale.
Coordinate del marchio 512, prima della scala 1.28 attorno al collo."""
import math


def _bez(p0, p1, p2, p3, u):
    a = (1 - u) ** 3; b = 3 * (1 - u) ** 2 * u; c = 3 * (1 - u) * u ** 2; d = u ** 3
    return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])


def strand(bx, by, h, lean, w, ink, paper, line=True, dot=True, barb=False, halo=True, rot=0):
    """Fiamma thai affusolata: sale, si piega all'indietro e chiude con una punta uncinata.
    rot ruota la fiamma attorno alla base (gradi, senso SVG)."""
    p0 = (bx, by)
    p1 = (bx + w * 0.5, by - h * 0.55)
    p2 = (bx - lean * 0.15, by - h * 1.08)
    p3 = (bx - lean, by - h * 0.86)
    n = 44
    pts = [_bez(p0, p1, p2, p3, i / n) for i in range(n + 1)]
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        u = i / n
        j0, j1 = max(0, i - 1), min(n, i + 1)
        dx, dy = pts[j1][0] - pts[j0][0], pts[j1][1] - pts[j0][1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        hw = (w / 2) * (1 - u) ** 0.85 * (1 + 0.35 * math.sin(math.pi * u))
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
    d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in left + right[::-1]) + " Z"
    out = ""
    if barb:
        bxx, byy = pts[17]
        out += strand(bxx - w * 0.15, byy + 2, h * 0.34, h * 0.34, w * 0.5, ink, paper, line=False, dot=False, halo=halo)
    if halo:
        out += f'<path d="{d}" fill="{paper}" stroke="{paper}" stroke-width="5" stroke-linejoin="round"/>'
    out += f'<path d="{d}" fill="{ink}" stroke="{ink}" stroke-width="1.5" stroke-linejoin="round"/>'
    if line:
        sp = pts[5:34]
        out += '<path d="M' + " L".join(f"{x:.1f},{y:.1f}" for x, y in sp) + f'" fill="none" stroke="{paper}" stroke-width="1.4" stroke-linecap="round"/>'
    if dot:
        x, y = pts[6]
        out += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="1.9" fill="{paper}"/>'
    if rot:
        out = f'<g transform="rotate({rot} {bx} {by})">{out}</g>'
    return out


def teeth(x0, y0, x1, y1, n, size, down, ink, paper):
    out = []
    for i in range(n):
        u = (i + 0.5) / n
        x, y = x0 + (x1 - x0) * u, y0 + (y1 - y0) * u
        s = size * (0.75 + 0.5 * u)
        tip = y + s if down else y - s
        out.append(f"M{x - s * 0.42:.1f},{y:.1f} L{x + s * 0.1:.1f},{tip:.1f} L{x + s * 0.42:.1f},{y:.1f} Z")
    return f'<path d="{" ".join(out)}" fill="{paper}" stroke="{ink}" stroke-width="1.5" stroke-linejoin="round"/>'


def head(ink, paper):
    return f"""
<g transform="translate(236,140) scale(1.28) translate(-236,-140)">

  <!-- criniera dietro al cranio -->
  {strand(236, 150, 34, 40, 16, ink, paper, rot=-70)}
  {strand(232, 132, 40, 44, 16, ink, paper, rot=-55)}

  <!-- baffi e fiamme che scorrono indietro dalla mandibola -->
  {strand(300, 168, 40, 34, 14, ink, paper, rot=-100, barb=True)}
  {strand(330, 170, 34, 30, 12, ink, paper, rot=-104)}
  {strand(354, 166, 26, 24, 10, ink, paper, rot=-108, dot=False)}

  <!-- interno della bocca e lingua -->
  <path d="M294,134 L382,124 L380,132 C376,142 370,150 366,156 C342,152 316,146 294,138 Z" fill="{ink}"/>
  <path d="M306,142 C326,148 348,150 366,146 C376,144 384,146 388,150 C380,150 374,152 372,156 C366,152 360,152 352,154 C334,154 318,150 306,144 Z"
        fill="{paper}" stroke="{ink}" stroke-width="1.6" stroke-linejoin="round"/>

  <!-- mandibola con linee di contorno parallele -->
  <path d="M290,138 C314,146 340,152 364,156 C374,157 378,164 372,169 C346,178 312,176 290,172 C272,170 256,172 240,174 C236,166 234,158 234,148 Z"
        fill="{paper}" stroke="{ink}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M244,166 C262,163 280,163 296,165 C318,169 344,170 366,163" fill="none" stroke="{ink}" stroke-width="1.5"/>
  <path d="M248,159 C264,156 282,156 298,158 C320,162 342,164 362,160" fill="none" stroke="{ink}" stroke-width="1.2"/>
  <path d="M240,174 C258,172 274,170 290,172 C312,176 344,178 372,169 C358,169 340,171 314,169 C292,167 266,166 244,168 Z" fill="{ink}"/>
  {teeth(300, 141, 362, 156, 8, 7, False, ink, paper)}
  <path d="M352,156 C354,148 356,142 362,136 C362,144 362,150 364,157 Z" fill="{paper}" stroke="{ink}" stroke-width="2" stroke-linejoin="round"/>

  <!-- cranio e mascella superiore -->
  <path d="M224,130 C230,108 246,92 268,88 C284,84 300,88 312,94 C330,98 350,98 370,100 C384,101 394,104 396,112
           C397,120 391,126 382,126 C360,129 330,133 296,136 C282,130 268,130 256,136 C246,142 240,150 236,160 L230,150 Z"
        fill="{paper}" stroke="{ink}" stroke-width="4" stroke-linejoin="round"/>
  <!-- linee di contorno parallele sul muso e sul labbro -->
  <path d="M322,104 C340,106 358,106 374,107 C382,108 388,111 389,116" fill="none" stroke="{ink}" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M300,128 C326,126 352,122 380,119" fill="none" stroke="{ink}" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M296,133 C326,130 356,127 382,123 C378,129 356,131 330,134 C318,135 306,136 296,136 Z" fill="{ink}"/>
  {teeth(304, 135, 372, 126, 8, 7, True, ink, paper)}
  <!-- zanne ricurve -->
  <path d="M370,125 C368,136 370,146 376,154 C376,144 378,134 381,124 Z" fill="{paper}" stroke="{ink}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M336,130 C335,138 336,144 340,149 C341,142 342,136 344,129 Z" fill="{paper}" stroke="{ink}" stroke-width="1.8" stroke-linejoin="round"/>

  <!-- muso che termina in spirale -->
  <path d="M388,104 C398,98 406,88 402,78 C398,70 386,70 384,78 C382,85 390,89 394,84" fill="none" stroke="{ink}" stroke-width="6" stroke-linecap="round"/>
  <path d="M388,104 C398,98 406,88 402,78" fill="none" stroke="{paper}" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M384,108 C388,104 392,104 394,108" fill="none" stroke="{ink}" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="388" cy="113" r="2.6" fill="{ink}"/>

  <!-- squame del muso -->
  <g fill="none" stroke="{ink}" stroke-width="1.5" stroke-linecap="round">
    <path d="M336,113 q4,5 9,0"/><path d="M347,113 q4,5 9,0"/><path d="M358,114 q4,5 9,0"/>
    <path d="M341,119 q4,5 9,0"/><path d="M352,119 q4,5 9,0"/>
  </g>

  <!-- spirale kranok sulla guancia con contorno doppio -->
  <path d="M246,128 C252,112 274,110 283,122 C290,132 280,143 268,139 C259,136 260,125 270,127" fill="none" stroke="{ink}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M240,140 C244,120 262,106 282,110" fill="none" stroke="{ink}" stroke-width="1.4" stroke-linecap="round"/>
  <g fill="none" stroke="{ink}" stroke-width="1.5" stroke-linecap="round">
    <path d="M286,120 q6,6 13,1"/><path d="M290,128 q6,5 12,0"/>
  </g>

  <!-- cresta: molte fiamme che scorrono all'indietro, dalla nuca al davanti -->
  {strand(252, 106, 34, 22, 13, ink, paper, barb=True)}
  {strand(266, 100, 52, 28, 15, ink, paper, barb=True)}
  {strand(281, 96, 68, 32, 17, ink, paper, barb=True)}
  {strand(296, 94, 76, 30, 18, ink, paper, barb=True)}
  {strand(311, 96, 64, 24, 17, ink, paper, barb=True)}
  {strand(324, 100, 44, 18, 14, ink, paper, barb=True)}

  <!-- diadema alla base della cresta -->
  <path d="M248,106 C252,98 258,95 264,96 L268,87 L275,94 L285,82 L293,92 L303,83 L311,92 L321,87 L324,97 C330,96 336,99 338,105
           C322,100 304,98 288,98 C272,98 260,102 248,106 Z" fill="{paper}" stroke="{ink}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M254,103 C268,97 286,95 302,95 C316,95 328,97 334,101" fill="none" stroke="{ink}" stroke-width="1.3"/>
  <g fill="{ink}"><circle cx="268" cy="95" r="1.7"/><circle cx="285" cy="90" r="2.1"/><circle cx="303" cy="91" r="2.1"/><circle cx="321" cy="95" r="1.7"/></g>

  <!-- sopracciglio arricciato -->
  <path d="M282,106 C286,92 304,86 322,92 C332,95 338,102 340,108 C332,102 322,98 310,98 C298,98 290,102 282,106 Z" fill="{ink}"/>
  <path d="M282,106 C274,104 270,96 276,92 C281,89 286,94 282,98" fill="none" stroke="{ink}" stroke-width="2.6" stroke-linecap="round"/>
  <g fill="{paper}"><circle cx="300" cy="96" r="1.5"/><circle cx="312" cy="94.5" r="1.5"/><circle cx="324" cy="96" r="1.5"/></g>

  <!-- occhio grande e tondo -->
  <path d="M290,114 C294,104 304,100 316,101 C326,102 332,108 332,114 C326,122 302,124 290,114 Z" fill="{paper}" stroke="{ink}" stroke-width="2.4"/>
  <circle cx="312" cy="112" r="8" fill="{paper}" stroke="{ink}" stroke-width="2.6"/>
  <circle cx="313" cy="112" r="4.4" fill="{ink}"/>
  <circle cx="315" cy="110" r="1.4" fill="{paper}"/>
  <path d="M290,114 C282,116 274,114 268,108 C276,110 282,110 288,110 Z" fill="{ink}"/>

  <!-- baffo lungo -->
  <path d="M384,126 C412,130 434,146 430,174 C428,188 414,194 406,188 C400,182 406,172 414,176" fill="none" stroke="{ink}" stroke-width="6" stroke-linecap="round"/>
  <path d="M392,129 C412,135 426,148 424,166" fill="none" stroke="{paper}" stroke-width="1.5" stroke-linecap="round"/>
</g>
"""
