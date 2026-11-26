"""A sheet for checking (and hand-keying) the blade in one take of a sword clip. Light work.

  python -I bladesheet.py specs/<set>.json <clip> [take=0] [--every 2] [--from t0] [--to t1] [--cell 260] [--cols 8] [--side L]

The clip's "blade_blur" / "blade_color" are used as the build uses them (magenta = found as a blurred fan).
--cell 400 --cols 4 makes the blade readable in a fast cut; --side L checks the left sword.

Each tile is the frame round his right fist with: the detected blade (cyan; grey when the frame is
UNKNOWN and the direction will be interpolated), the fist (white dot), and a pixel ruler in FULL-FRAME
coordinates (ticks every 20 px, labels every 100). To key a bad frame, read the tip's x, y off the ruler
and add it to the clip's spec: "blade_keys": [{"take": <take>, "keys": [["<video time>", x, y], ...]}]."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from mlib import cfg, clip as C, sword, draw  # noqa: E402


def main(a):
    every = 2
    t_from = t_to = None
    cell, cols, side = 260, 8, 'R'
    for flag in ('--cell', '--cols', '--side'):
        if flag in a:
            i = a.index(flag)
            v = a[i + 1]
            del a[i:i + 2]
            if flag == '--cell':
                cell = int(v)
            elif flag == '--cols':
                cols = int(v)
            else:
                side = v
    for flag in ('--every', '--from', '--to'):
        if flag in a:
            i = a.index(flag)
            v = a[i + 1]
            del a[i:i + 2]
            if flag == '--every':
                every = int(v)
            elif flag == '--from':
                t_from = cfg.parse_time(v)
            else:
                t_to = cfg.parse_time(v)
    spec = cfg.load_spec(a[0])
    c = [x for x in spec['clips'] if x['name'] == a[1]][0]
    ti = int(a[2]) if len(a) > 2 else 0
    T = C._take(spec, c, c['takes'][ti], log=lambda s: None)
    idx = np.arange(0, len(T.t), every)
    if t_from is not None:
        idx = idx[T.t[idx] >= t_from]
    if t_to is not None:
        idx = idx[T.t[idx] <= t_to]
    ang, conf, best = sword.track_2d(T, idx, side=side, blur=bool(c.get('blade_blur')),
                                     color=c.get('blade_color' if side == 'R' else 'blade_color_L', 'rust'))
    tiles = []
    for j, i in enumerate(idx):
        _, path = cfg.frame_at(T.film, T.t[i])
        im = Image.open(path).convert('RGB')
        f = sword.fist_of(T.l2[i], side)
        H = np.linalg.norm((T.l2[i, 11, :2] + T.l2[i, 12, :2]) / 2 - (T.l2[i, 27, :2] + T.l2[i, 28, :2]) / 2) * 1.25
        R = 0.5 * H
        box = (int(f[0] - R), int(f[1] - R), int(f[0] + R), int(f[1] + R))
        sc = cell / (box[2] - box[0])
        cr = im.crop(box).resize((cell, cell), Image.BILINEAR)
        dr = ImageDraw.Draw(cr)
        for x in range((box[0] // 20 + 1) * 20, box[2], 20):
            X = (x - box[0]) * sc
            dr.line([X, cell - (10 if x % 100 else 18), X, cell], fill=draw.YEL)
            if x % 100 == 0:
                dr.text((X + 2, cell - 28), str(x), fill=draw.YEL)
        for y in range((box[1] // 20 + 1) * 20, box[3], 20):
            Y = (y - box[1]) * sc
            dr.line([0, Y, 10 if y % 100 else 18, Y], fill=draw.YEL)
            if y % 100 == 0:
                dr.text((20, Y - 6), str(y), fill=draw.YEL)
        L = 0.4 * H
        tip = f + L * np.array([np.cos(ang[j]), np.sin(ang[j])])
        col = (draw.CYAN if best[j] >= 0.42 else (255, 80, 255)) if conf[j] > 0 else (120, 120, 120)
        dr.line([((f[0] - box[0]) * sc, (f[1] - box[1]) * sc), ((tip[0] - box[0]) * sc, (tip[1] - box[1]) * sc)], fill=col, width=2)
        fx, fy = (f[0] - box[0]) * sc, (f[1] - box[1]) * sc
        dr.ellipse([fx - 3, fy - 3, fx + 3, fy + 3], fill=draw.WHITE)
        draw.label(cr, '%s  s%.2f' % (cfg.fmt_time(T.t[i]), best[j]), sz=11)
        tiles.append(cr)
    out = os.path.join(cfg.workdir('sheets', spec['set']), '%s_blade%s_take%d.jpg' % (c['name'], '' if side == 'R' else 'L', ti))
    draw.grid(tiles, cols).save(out, quality=85)
    print('blade found in %d of %d frames; %s' % ((conf > 0).sum(), len(conf), out))


if __name__ == '__main__':
    main(sys.argv[1:])
