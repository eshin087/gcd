"""Split a chapter into TAKE CANDIDATES and draw one row per candidate, so you can pick takes. Light work.

  python -I shots.py <film> <t0> <t1> [out.jpg] [--every 0.5]

A candidate is a stretch of one camera shot (a cut = a jump in the picture) in which the camera sees him
from one side (front / right / back / left; from the tracked landmarks, so track the span first; an
untracked span is split by cuts only). He often turns round inside one shot, and the follow camera swings
with him without a cut, so the view is what splits takes. Prints `take k: t0-t1 (dur) view` lines; the
sheet shows each candidate's frames every --every seconds."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from mlib import cfg, draw, track, takes  # noqa: E402


def thumbs(film, t0, t1):
    ts, fs = cfg.frames_in(film, t0, t1)
    th = []
    for f in fs:
        im = Image.open(f)
        im.draft('L', (160, 90))
        th.append(np.asarray(im.convert('L').resize((64, 36)), np.float32))
    return np.array(ts), np.array(th)


def find_shots(film, t0, t1, min_len=0.25):
    ts, th = thumbs(film, t0, t1)
    d = np.abs(np.diff(th, axis=0)).mean((1, 2))
    # a cut: a jump far above the local level
    med = np.median(d) + 1e-3
    cut = [i + 1 for i in range(len(d)) if d[i] > max(18.0, 6 * med)]
    edges = [0] + cut + [len(ts)]
    shots = []
    for a, b in zip(edges[:-1], edges[1:]):
        if b - a < 2 or ts[b - 1] - ts[a] < min_len:
            continue
        shots.append((float(ts[a]), float(ts[b - 1])))
    return shots


def view_of(yaw):
    names = [(0, 'front'), (90, 'right'), (180, 'back'), (-90, 'left'), (-180, 'back')]
    return min(names, key=lambda kv: abs(yaw - kv[0]))[1]


def views(film, s0, s1, step=0.25):
    """per step: the camera's view of him, from the cached landmarks (None where untracked)"""
    c = track.load_cache(film, s0, s1)
    if len(c) < 0.9 * len(cfg.frames_in(film, s0, s1)[0]):
        return None
    ts = np.array(sorted(t for t in c if c[t][3]))
    if len(ts) < 4:
        return None
    w = takes.to_cam(np.array([c[t][2] for t in ts]))
    f1, feet, nose = takes.facing(w)
    out = []
    t = s0
    while t < s1:
        m = (ts >= t) & (ts < t + step)
        if m.sum() == 0:
            out.append((t, None))
        else:
            y = takes.circ_median_deg(np.concatenate([np.degrees(np.arctan2(f[m, 0], f[m, 2])) for f in (feet, nose, f1)]))
            out.append((t, y))
        t += step
    return out


def split_views(shots, film, hold=0.5):
    res = []
    for s0, s1 in shots:
        v = views(film, s0, s1)
        if not v:
            res.append((s0, s1, '?', None))
            continue
        lab = [(t, view_of(y) if y is not None else None, y) for t, y in v]
        cur = None
        start = s0
        ys = []
        k = 0
        while k < len(lab):
            t, l, y = lab[k]
            if l is not None and l != cur:
                # a change that holds for `hold` seconds
                nxt = [x[1] for x in lab[k:k + int(hold / 0.25)] if x[1] is not None]
                if cur is None or (nxt and all(x == l for x in nxt)):
                    if cur is not None:
                        res.append((start, t, cur, takes.circ_median_deg(ys) if ys else None))
                    cur, start, ys = l, t, []
            if y is not None:
                ys.append(y)
            k += 1
        res.append((start, s1, cur or '?', takes.circ_median_deg(ys) if ys else None))
    return res


def main(a):
    every = 0.5
    if '--every' in a:
        i = a.index('--every')
        every = float(a[i + 1])
        del a[i:i + 2]
    film, t0, t1 = a[0], cfg.parse_time(a[1]), cfg.parse_time(a[2])
    out = a[3] if len(a) > 3 else os.path.join(cfg.workdir('shots'), '%s_%d_%d.jpg' % (film, t0, t1))
    shots = split_views(find_shots(film, t0, t1), film)
    rows = []
    for k, (s0, s1, view, yaw) in enumerate(shots):
        print('take %d: %s-%s (%.2f s)  [%.3f, %.3f]  view %s%s' % (k, cfg.fmt_time(s0), cfg.fmt_time(s1), s1 - s0, s0, s1,
              view, '' if yaw is None else ' (yaw %.0f)' % yaw))
        tiles = []
        t = s0
        while t <= s1 + 1e-6 and len(tiles) < 12:
            tt, f = cfg.frame_at(film, t)
            im = Image.open(f).convert('RGB').resize((192, 108))
            draw.label(im, ('#%d %s ' % (k, view) if not tiles else '') + '%.2f' % tt, sz=11)
            tiles.append(im)
            t += every
        rows.append(draw.grid(tiles, 12))
    if rows:
        draw.stack(rows).save(out, quality=82)
        print(out)


if __name__ == '__main__':
    main(sys.argv[1:])
