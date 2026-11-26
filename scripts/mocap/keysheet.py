"""A sheet for hand-keying joints in one take (light work).

  python -I keysheet.py specs/<set>.json <clip> [take=0] [--from t] [--to t] [--every 3] [--cell 300] [--box x,y,side]

Each tile is one frame round him with: the tool's landmarks (thin; his left green, right red) and, at each,
a short name (sL/sR shoulders, eL/eR elbows, wL/wR wrists, hL/hR hips, kL/kR knees, aL/aR ankles, tL/tR
toes, n nose), a pixel ruler in FULL-FRAME coordinates (ticks every 10 px, labels every 50), and the frame's
video time. Read the positions of the joints you can see and type them into the take's spec entry:

  "drop": [["11:19.40", "11:19.80"]],
  "keys": [{"t": "11:19.55", "pts": {"hipL": [612, 455], "kneeL": [650, 470], "ankleL": [700, 440]}}]

Names for "pts": nose, earL/R, shoulderL/R, elbowL/R, wristL/R, pinkyL/R, indexL/R, thumbL/R, hipL/R,
kneeL/R, ankleL/R, heelL/R, toeL/R. A dropped span is interpolated from the frames round it through your
keys; key every 3-6 frames of a fast span, at the extremes of the motion."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from mlib import cfg, clip as C, draw, track  # noqa: E402

SHORT = {0: 'n', 11: 'sL', 12: 'sR', 13: 'eL', 14: 'eR', 15: 'wL', 16: 'wR', 23: 'hL', 24: 'hR', 25: 'kL',
         26: 'kR', 27: 'aL', 28: 'aR', 31: 'tL', 32: 'tR'}


def main(a):
    opt = {'--from': None, '--to': None, '--every': '3', '--cell': '300', '--box': None}
    for k in list(opt):
        if k in a:
            i = a.index(k)
            opt[k] = a[i + 1]
            del a[i:i + 2]
    spec = cfg.load_spec(a[0])
    c = [x for x in spec['clips'] if x['name'] == a[1]][0]
    ti = int(a[2]) if len(a) > 2 else 0
    tk = c['takes'][ti]
    film = tk.get('film', c.get('film', spec.get('film')))
    t0 = cfg.parse_time(opt['--from'] or tk['t0'])
    t1 = cfg.parse_time(opt['--to'] or tk['t1'])
    every = int(opt['--every'])
    cell = int(opt['--cell'])
    cache = track.load_cache(film, t0, t1)
    ts, fs = cfg.frames_in(film, t0, t1)
    ts, fs = ts[::every], fs[::every]
    # one crop for the whole span: round every tracked point (he moves; keep the scale fixed)
    ok = [cache[round(t, 3)][1] for t in ts if round(t, 3) in cache and cache[round(t, 3)][3]]
    if opt['--box']:
        x, y, sd = [float(v) for v in opt['--box'].split(',')]
        box = (int(x), int(y), int(x + sd), int(y + sd))
    else:
        # frames where his size is normal (a phantom on a statue is far bigger or smaller)
        tor = np.array([np.linalg.norm((l[11, :2] + l[12, :2]) / 2 - (l[23, :2] + l[24, :2]) / 2) for l in ok])
        med = np.median(tor)
        good = [l for l, tt in zip(ok, tor) if 0.6 * med < tt < 1.6 * med]
        pts = np.concatenate([l[:, :2] for l in good])
        lo = np.percentile(pts, 2, axis=0)
        hi = np.percentile(pts, 98, axis=0)
        side = max(max(hi - lo) * 1.3, med * 5.5) + 30
        cx, cy = (lo + hi) / 2
        box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
    sc = cell / (box[2] - box[0])
    tiles = []
    for t, f in zip(ts, fs):
        im = Image.open(f).convert('RGB').crop(box).resize((cell, cell), Image.BILINEAR)
        dr = ImageDraw.Draw(im)
        for x in range((box[0] // 10 + 1) * 10, box[2], 10):
            X = (x - box[0]) * sc
            dr.line([X, cell - (6 if x % 50 else 14), X, cell], fill=draw.YEL)
            if x % 50 == 0:
                dr.text((X + 1, cell - 26), str(x), fill=draw.YEL)
        for y in range((box[1] // 10 + 1) * 10, box[3], 10):
            Y = (y - box[1]) * sc
            dr.line([0, Y, 6 if y % 50 else 14, Y], fill=draw.YEL)
            if y % 50 == 0:
                dr.text((16, Y - 6), str(y), fill=draw.YEL)
        e = cache.get(round(t, 3))
        if e and e[3]:
            l2 = e[1]
            draw.draw_mp(dr, l2, off=box[:2], sc=sc, width=1)
            for j, nm in SHORT.items():
                x, y = (l2[j, 0] - box[0]) * sc, (l2[j, 1] - box[1]) * sc
                dr.text((x + 3, y - 5), nm, fill=draw.WHITE)
        draw.label(im, cfg.fmt_time(t), sz=12)
        tiles.append(im)
    out = os.path.join(cfg.workdir('sheets', spec['set']), '%s_keys_take%d.jpg' % (c['name'], ti))
    draw.grid(tiles, 6).save(out, quality=88)
    print(out, len(tiles), 'frames, crop', box)


if __name__ == '__main__':
    main(sys.argv[1:])
