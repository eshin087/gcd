"""Find every other performance of a move in a chapter (light work, on tracked spans).

  python -I find.py <film> <t0> <t1> <span_t0> <span_t1> [--top 12] [--min-gap 0.6]

The span (span_t0 - span_t1) is one performance you have found; the chapter (t0 - t1) is searched for the
moments where his body does the same thing, whatever the camera: the match is on the distances between his
joints in the tool's 3D (shoulders, elbows, wrists, hips, knees, ankles), which no camera angle changes.
Prints the best starts, best first, with the cost (0 = identical; under ~0.5 is the same move) and the
camera's view at that moment. The reference's chapters repeat a move from several cameras, and a combo
chapter often plays the combo growing hit by hit (1, 1-2, 1-2-3 ...): this finds each hit's every take."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from mlib import cfg, track, takes  # noqa: E402

PTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]


def features(film, t0, t1):
    c = track.load_cache(film, t0, t1)
    ts = np.array(sorted(t for t in c if c[t][3]))
    w = np.array([c[t][2] for t in ts])[:, PTS]
    iu = np.triu_indices(len(PTS), 1)
    d = np.linalg.norm(w[:, :, None] - w[:, None], axis=-1)[:, iu[0], iu[1]]
    g = np.arange(t0, t1, 1 / 60.0)
    f = np.stack([np.interp(g, ts, d[:, k]) for k in range(d.shape[1])], 1)
    # the view (for the print)
    cam = takes.to_cam(np.array([c[t][2] for t in ts]))
    f1, feet, nose = takes.facing(cam)
    yaw = np.degrees(np.arctan2((feet + nose)[:, 0], (feet + nose)[:, 2]))
    return g, f, np.interp(g, ts, yaw)


def main(a):
    top, gap = 12, 0.6
    if '--top' in a:
        i = a.index('--top'); top = int(a[i + 1]); del a[i:i + 2]
    if '--min-gap' in a:
        i = a.index('--min-gap'); gap = float(a[i + 1]); del a[i:i + 2]
    film = a[0]
    t0, t1, s0, s1 = [cfg.parse_time(v) for v in a[1:5]]
    g, f, yaw = features(film, t0, t1)
    gr, fr, _ = features(film, s0, s1)
    sd = f.std(0) + 1e-3
    f = f / sd
    fr = fr / sd
    m = len(fr)
    cost = np.full(len(g), np.inf)
    for i in range(len(g) - m):
        cost[i] = np.mean((f[i:i + m] - fr) ** 2)
    order = np.argsort(cost)
    picked = []
    for i in order:
        if not np.isfinite(cost[i]) or len(picked) >= top:
            break
        if all(abs(g[i] - g[j]) > gap for j in picked):
            picked.append(i)
    from shots import view_of
    for i in picked:
        print('%s-%s  cost %.2f  view %s (yaw %.0f)' % (cfg.fmt_time(g[i]), cfg.fmt_time(g[i] + (s1 - s0)), cost[i],
                                                       view_of(yaw[i]), yaw[i]))


if __name__ == '__main__':
    main(sys.argv[1:])
