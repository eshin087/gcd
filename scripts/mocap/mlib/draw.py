"""Picture helpers: landmark overlays, stick figures, sheets. Light work (no lock)."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# the tool's landmark bones; colour: his left green, his right red, the middle yellow
MP_BONES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27),
            (24, 26), (26, 28), (27, 29), (29, 31), (27, 31), (28, 30), (30, 32), (28, 32), (15, 19), (16, 20),
            (0, 7), (0, 8)]
GREEN, RED, YEL, BLUE, CYAN, WHITE = (60, 255, 90), (255, 70, 70), (255, 230, 0), (90, 150, 255), (0, 240, 255), (255, 255, 255)


def side_col(i, j):
    if i % 2 == 1 and j % 2 == 1 and i > 10:
        return GREEN
    if i % 2 == 0 and j % 2 == 0 and i > 10:
        return RED
    return YEL


def font(sz=12):
    try:
        return ImageFont.truetype('arial.ttf', sz)
    except Exception:
        return ImageFont.load_default()


def draw_mp(dr, l2, off=(0, 0), sc=1.0, width=2, vis=0.0):
    for i, j in MP_BONES:
        if l2[i, 3] < vis or l2[j, 3] < vis:
            continue
        a = ((l2[i, 0] - off[0]) * sc, (l2[i, 1] - off[1]) * sc)
        b = ((l2[j, 0] - off[0]) * sc, (l2[j, 1] - off[1]) * sc)
        dr.line([a, b], fill=side_col(i, j), width=width)


def label(im, text, xy=(2, 1), sz=12, fill=YEL):
    dr = ImageDraw.Draw(im)
    f = font(sz)
    w = dr.textlength(text, font=f)
    dr.rectangle([xy[0], xy[1], xy[0] + w + 4, xy[1] + sz + 3], fill=(0, 0, 0))
    dr.text((xy[0] + 2, xy[1]), text, fill=fill, font=f)


def grid(tiles, cols, bg=(12, 12, 16)):
    if not tiles:
        return Image.new('RGB', (10, 10))
    cw = max(t.size[0] for t in tiles)
    ch = max(t.size[1] for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    sh = Image.new('RGB', (cols * cw, rows * ch), bg)
    for i, t in enumerate(tiles):
        sh.paste(t, ((i % cols) * cw, (i // cols) * ch))
    return sh


def stack(rows, bg=(12, 12, 16)):
    w = max(r.size[0] for r in rows)
    h = sum(r.size[1] for r in rows)
    sh = Image.new('RGB', (w, h), bg)
    y = 0
    for r in rows:
        sh.paste(r, (0, y))
        y += r.size[1]
    return sh
