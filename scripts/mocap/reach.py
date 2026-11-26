"""An attack clip's numbers against the game (light work, on built clips):

  python -I reach.py specs/<set>.json [clip ...]

Per clip: the hips' farthest offset from the root (they must stay near it), and whether the blade's
gameplay segment (HDIM.bladeBase to bladeTip along the weaponR socket's +Z, the root travel included) passes through points straight
ahead of him at chest height (1.2, 1.9, 2.6 m: the game's light attack must reach 1.9 m) between the
windup and the active phase, and on which frames. The engine's own suite checks the same in play."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from mlib import cfg, skel, clip as C  # noqa: E402
from mlib.skel import JI, HDIM  # noqa: E402


def reach(B, dists=(1.2, 1.9, 2.6), y=1.3, tol=0.15):
    P, R = skel.fk(B.q, B.hips, B.root)  # with the root's travel: the target stands still
    g = P[:, JI['weaponR']]
    ax = skel.qrot(R[:, JI['weaponR']], np.broadcast_to(np.array([0, 0, 1.0]), (len(g), 3)))
    ph = B.phases or {}
    f0, f1 = ph.get('windup', 0), ph.get('active', len(g) - 1)
    out = {}
    for d in dists:
        pt = np.array([0, y, d])
        hits = []
        for f in range(max(0, f0 - 2), min(len(g), f1 + 3)):
            # the swept quad between frame f-1 and f: sample both segments and a few between
            for u in np.linspace(0, 1, 5):
                gg = g[f - 1] * (1 - u) + g[f] * u if f else g[f]
                aa = ax[f - 1] * (1 - u) + ax[f] * u if f else ax[f]
                aa = aa / np.linalg.norm(aa)
                s = np.clip((pt - gg) @ aa, HDIM['bladeBase'], HDIM['bladeTip'])
                if np.linalg.norm(gg + aa * s - pt) < tol:
                    hits.append(f)
                    break
        out[d] = hits
    return out


def main(a):
    spec = cfg.load_spec(a[0])
    want = set(a[1:])
    for c in spec['clips']:
        if want and c['name'] not in want:
            continue
        try:
            B = C.load(spec['set'], c['name'])
        except FileNotFoundError:
            continue
        off = np.linalg.norm(B.hips[:, [0, 2]], axis=1).max()
        line = '%-12s hips off the root at most %.2f m' % (c['name'], off)
        if getattr(B, 'blade', None) is not None and B.phases:
            r = reach(B)
            line += '; blade reaches ' + ', '.join('%.1f m %s' % (d, ('frames %d-%d' % (h[0], h[-1])) if h else 'NO')
                                                  for d, h in r.items())
            ev = [e['f'] for e in B.events if e['name'] == 'hit']
            line += '; hit at %s, windup %s, active %s' % (ev, B.phases.get('windup'), B.phases.get('active'))
        print(line)


if __name__ == '__main__':
    main(sys.argv[1:])
