"""Calibrate the focal length the camera's swing is measured with (mlib/camflow.py F_PX). Light work.

  python -I camcal.py <film> <t0> <t1> [<t0> <t1> ...]

Give spans where he STANDS STILL (does not turn) while the camera swings round him (the idle chapters'
orbits between views do this). His body yaw in the picture (the tool's hips, shoulders, feet, nose, pooled)
then changes only by the camera's swing; it is fitted against the background's summed sideways shift:
f = shift / angle. Prints the fit and its spread per span; put the result in camflow.F_PX (or set
MOCAP_FPX)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from mlib import camflow, track, takes, cfg  # noqa: E402


def body_yaw(film, tt):
    c = track.load_cache(film, tt[0], tt[-1])
    out = np.full(len(tt), np.nan)
    for i, t in enumerate(tt):
        e = c.get(round(t, 3))
        if e and e[3]:
            w = takes.to_cam(e[2][None])
            f1, feet, nose = takes.facing(w)
            v = f1[0] + feet[0] + nose[0]
            out[i] = np.degrees(np.arctan2(v[0], v[2]))
    return out


def main(a):
    film = a[0]
    spans = [(cfg.parse_time(a[i]), cfg.parse_time(a[i + 1])) for i in range(1, len(a) - 1, 2)]
    X, Y = [], []
    for t0, t1 in spans:
        tt, dx, dy, inl, zoom = camflow.shift(film, t0, t1)
        dx = np.nan_to_num(dx)
        cum = np.cumsum(dx)
        y = body_yaw(film, tt)
        ok = np.isfinite(y)
        yu = np.degrees(np.unwrap(np.radians(y[ok])))
        # a robust running median (the tool's facing is noisy frame to frame)
        ym = np.array([np.median(yu[max(0, i - 7):i + 8]) for i in range(len(yu))])
        x = cum[ok] - cum[ok][0]
        ym = ym - ym[0]
        k = np.polyfit(x, ym, 1)[0]
        print('%s %.2f-%.2f: swing %.0f px, body yaw %.0f deg: %.2f deg per 100 px -> f %.0f px'
              % (film, t0, t1, x[-1] - x[0], ym[-1] - ym[0], k * 100, -57.2958 / k if k else np.inf))
        X.append(x)
        Y.append(ym)
    X = np.concatenate(X)
    Y = np.concatenate(Y)
    k = (X * Y).sum() / (X * X).sum()
    print('all spans: f = %.0f px (camflow.F_PX now %.0f)' % (-57.2958 / k, camflow.F_PX))


if __name__ == '__main__':
    main(sys.argv[1:])
