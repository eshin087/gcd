"""Where the cache holds a PHANTOM (a skeleton fitted to a statue, a building) instead of him. Light.

  python -I phantoms.py <film> <t0> <t1> [--below Y] [--exclude x0 y0 x1 y1]...

Per second of the cache: frames tracked, frames a `below` / `exclude` rule refuses (track.plausible), the
median pelvis position (px) and torso length (px). A run of seconds where his pelvis sits high and his torso
is far bigger or smaller than round it is a phantom: re-track it with
`track.py <film> <t0> <t1> --forget --box ... --below Y` (under the lock) and give the takes `"below": Y`."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mlib import cfg, track  # noqa: E402


def main(a):
    below, exclude = None, []
    if '--below' in a:
        i = a.index('--below'); below = float(a[i + 1]); del a[i:i + 2]
    while '--exclude' in a:
        i = a.index('--exclude'); exclude.append([float(v) for v in a[i + 1:i + 5]]); del a[i:i + 5]
    film, t0, t1 = a[0], cfg.parse_time(a[1]), cfg.parse_time(a[2])
    c = track.load_cache(film, t0, t1)
    print('second  frames  ok  refused  pelvis x,y (px)  torso px')
    tot = [0, 0]
    for sec in range(int(t0), int(np.floor(t1)) + 1):
        rows = [v for t, v in c.items() if sec <= t < sec + 1]
        ok = [v for v in rows if v[3]]
        if not rows:
            print('%s  not tracked' % cfg.fmt_time(sec))
            continue
        bad = [v for v in ok if not track.plausible(v[1], below, exclude)] if (below is not None or exclude) else []
        tot[0] += len(ok); tot[1] += len(bad)
        if ok:
            L = np.array([v[1] for v in ok])
            pel = (L[:, 23, :2] + L[:, 24, :2]) / 2
            tor = np.linalg.norm((L[:, 11, :2] + L[:, 12, :2]) / 2 - pel, axis=1)
            print('%s  %4d  %4d  %4d     %5.0f,%4.0f      %4.0f%s' % (cfg.fmt_time(sec), len(rows), len(ok), len(bad), *np.median(pel, 0),
                                                         np.median(tor), '   <- PHANTOM?' if bad and len(bad) > 0.3 * len(ok) else ''))
        else:
            print('%s  %4d     0' % (cfg.fmt_time(sec), len(rows)))
    if below is not None or exclude:
        print('refused %d of %d tracked frames' % (tot[1], tot[0]))


if __name__ == '__main__':
    main(sys.argv[1:])
