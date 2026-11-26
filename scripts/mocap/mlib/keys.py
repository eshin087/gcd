"""Hand keys: the author's fixes for what the tracker gets wrong, all from the spec.

1. DROP + 2D KEYS (per take): `"drop": [["t0", "t1"], ...]` marks spans the tracker lost (a tumble, lying
   on the ground, a blur). Inside a dropped span every point is interpolated from the frames round it,
   anchored on any 2D KEYS the author typed: `"keys": [{"t": "11:19.50", "pts": {"hipL": [x, y], ...}}]`,
   full-frame pixel positions read off `keysheet.py`'s ruler. A keyed point's depth comes from the
   tracked frames round the span (interpolated), its picture position from the key: the retarget only
   uses bone DIRECTIONS, so our bone lengths are kept whatever the key's scale. The span gets the
   fusion weight `key_weight` (default 0.6) near keys, 0.05 elsewhere, so a better take wins.
2. POSE KEYS (per clip): `"pose_keys": [{"t": "11:19.55" | "f": 12, "joint": "thighL", ...}]` with one of
     "euler": [x, y, z]   the joint's LOCAL rotation, degrees, XYZ order (rest = [0, 0, 0])
     "dir": [x, y, z]     the bone's direction in his root frame (+X his left, +Y up, +Z front)
   and "blend": frames on each side (default 4): the key is reached at its frame and eased in / out.

Point names: nose, earL/R, shoulderL/R, elbowL/R, wristL/R, pinkyL/R, indexL/R, thumbL/R, hipL/R, kneeL/R,
ankleL/R, heelL/R, toeL/R."""
import numpy as np
from . import cfg, skel
from .skel import JI

PT = {'nose': 0, 'earL': 7, 'earR': 8, 'shoulderL': 11, 'shoulderR': 12, 'elbowL': 13, 'elbowR': 14,
      'wristL': 15, 'wristR': 16, 'pinkyL': 17, 'pinkyR': 18, 'indexL': 19, 'indexR': 20, 'thumbL': 21,
      'thumbR': 22, 'hipL': 23, 'hipR': 24, 'kneeL': 25, 'kneeR': 26, 'ankleL': 27, 'ankleR': 28,
      'heelL': 29, 'heelR': 30, 'toeL': 31, 'toeR': 32}
# the child point of each bone (for "dir" pose keys): joint -> its child joint in our skeleton
CHILD = {'upperArmL': 'foreArmL', 'foreArmL': 'handL', 'upperArmR': 'foreArmR', 'foreArmR': 'handR',
         'thighL': 'shinL', 'shinL': 'footL', 'thighR': 'shinR', 'shinR': 'footR', 'spine': 'chest',
         'chest': 'neck', 'neck': 'head', 'hips': 'spine', 'footL': 'toeL', 'footR': 'toeR',
         'handL': 'weaponL', 'handR': 'weaponR'}


def apply_take_keys(T, tk, log=print):
    """drop spans and 2D keys of one take (Take: t, l2, c, gap on the 60 fps grid)"""
    drops = [(cfg.parse_time(a), cfg.parse_time(b)) for a, b in tk.get('drop', [])]
    keys = tk.get('keys', [])
    if not drops and not keys:
        return
    from .fuse import fit_weak
    n = len(T.t)
    bad = np.zeros(n, bool)
    for a, b in drops:
        bad |= (T.t >= a - 1e-3) & (T.t <= b + 1e-3)
    # picture <-> camera mapping per frame (scale, shift), from the good frames, interpolated across
    pel = (T.c[:, 23] + T.c[:, 24]) / 2
    rel = T.c - pel[:, None]
    S, Tr = fit_weak(rel[:, :, :2], T.l2)
    good = ~bad
    idx = np.arange(n)
    if good.sum() >= 2:
        S = np.interp(idx, idx[good], S[good])
        Tr = np.stack([np.interp(idx, idx[good], Tr[good, j]) for j in (0, 1)], 1)
    # anchors per point: good frames + keyed frames
    keyed = {}  # (frame, point) -> camera xy
    for kk in keys:
        f = int(np.argmin(np.abs(T.t - cfg.parse_time(kk['t']))))
        for name, (x, y) in kk['pts'].items():
            j = PT[name]
            cx = (x - Tr[f, 0]) / S[f]
            cy = -(y - Tr[f, 1]) / S[f]
            keyed[(f, j)] = (cx, cy, x, y)
    newc = rel.copy()
    newl2 = T.l2.copy()
    for j in range(33):
        anc = [i for i in idx if good[i]] + [f for (f, jj) in keyed if jj == j and bad[f]]
        anc = sorted(set(anc))
        if len(anc) < 2:
            continue
        anc = np.array(anc)
        for d in range(3):
            vals = np.array([keyed[(f, j)][d] if (f, j) in keyed and d < 2 else rel[f, j, d] for f in anc])
            if d == 2:
                # depth only from the tracked frames round the span (a key has none)
                gi = idx[good]
                vals = None
                newc[bad, j, 2] = np.interp(idx[bad], gi, rel[good, j, 2]) if len(gi) >= 2 else rel[bad, j, 2]
                continue
            newc[bad, j, d] = np.interp(idx[bad], anc, vals)
        for (f, jj), (cx, cy, x, y) in keyed.items():
            if jj == j:
                newl2[f, j, :2] = (x, y)
                newl2[f, j, 3] = 1.0
    # keep the pelvis at the origin of each frame's camera-frame points (as the tool's are)
    T.c = newc + pel[:, None] * 0
    T.l2 = newl2
    T.c = T.c - ((T.c[:, 23] + T.c[:, 24]) / 2)[:, None]
    # weights: near a key the span counts, elsewhere it hardly does
    kw = float(tk.get('key_weight', 0.6))
    gap = T.gap.copy()
    kf = sorted(set(f for (f, _) in keyed))
    for i in np.where(bad)[0]:
        near = min([abs(i - f) for f in kf], default=999)
        gap[i] = 0.04 if near <= 3 else 0.12 if near <= 8 else 1.0
    T.gap = gap
    T.key_weight = kw
    log('  keys %s: %d dropped frames, %d keyed points in %d frames' % (T.name, int(bad.sum()), len(keyed), len(kf)))


def _euler_q(e):
    e = np.radians(e)
    return skel.qmul(skel.qmul(skel.qaxis([1, 0, 0], e[0]), skel.qaxis([0, 1, 0], e[1])), skel.qaxis([0, 0, 1], e[2]))


def apply_pose_key(q, pk, fps, B):
    n = len(q)
    if 'f' in pk:
        f = int(pk['f'])
    else:
        f = int(round((cfg.parse_time(pk['t']) - B.t_ref[0]) * fps))
    f = int(np.clip(f, 0, n - 1))
    j = JI[pk['joint']]
    if 'euler' in pk:
        target = _euler_q(pk['euler'])
    else:
        # the bone's direction in the root frame -> the joint's local rotation
        _, R = skel.fk(q[f:f + 1], np.zeros((1, 3)))
        ch = JI[CHILD[pk['joint']]]
        rest_off = skel.REST[ch]
        cur = skel.qrot(R[0, j], rest_off)
        want = np.asarray(pk['dir'], float)
        want = want / np.linalg.norm(want) * np.linalg.norm(cur)
        a = cur / np.linalg.norm(cur)
        bvec = want / np.linalg.norm(want)
        ax = np.cross(a, bvec)
        ang = np.arctan2(np.linalg.norm(ax), a @ bvec)
        dq = skel.qaxis(ax / max(np.linalg.norm(ax), 1e-9), ang)
        world = skel.qmul(dq, R[0, j])
        target = skel.qmul(skel.qconj(R[0, skel.PARENT[j]]), world)
    w = int(pk.get('blend', 4))
    q = q.copy()
    for k in range(max(0, f - w), min(n, f + w + 1)):
        u = 1 - abs(k - f) / (w + 1)
        u = u * u * (3 - 2 * u)
        q[k, j] = skel.qslerp(q[k, j], target, u)
    return skel.continuous(q)
