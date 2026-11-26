"""The sword: the pose tool does not see it, so it is found in the picture.

In every take frame, rays are cast from his right fist (the tool's right wrist / index / pinky) in 120
directions; a ray scores the share of its samples that look like the blade (the reference sword is a
rust-red blade: red well above green and blue, unlike the grey armour, the stone and the gold leaves).
A dynamic programme over the frames picks a smooth sequence of directions (a cut may turn ~25 degrees in a
60 fps frame); frames where no ray scores well (motion blur, the blade edge-on, behind his body) are
UNKNOWN and filled by interpolation.

3D: a blade seen at image angle u lies in the plane through the camera ray and u. Two takes (time-aligned)
give two planes: the blade is their intersection. One take: the direction in its plane nearest a prior
(the blade leaves the fist on the thumb side, across the forearm). The result is the blade's unit direction
in his body frame per clip frame; retarget puts it on the right hand (the hand's +Z, so the weaponR socket
carries it with its local rotation at rest).

Hand keys (where detection fails): spec "blade_keys": [{"take": 0, "keys": [[t, x, y], ...]}] gives the
tip's pixel position in that take's frames at video times t (read off `sword.py` sheets); between keys the
tip is interpolated and those frames override the detector in that take."""
import numpy as np
from PIL import Image
from . import cfg
from .skel import qrot

NA = 120
ANG = np.arange(NA) * 2 * np.pi / NA


def rust_mask(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    s = r + g + b + 1
    # dark rust red: red above green and blue, little green (the gold leaves have a lot), not bright
    return ((r - g) > 18) & ((r - b) > 22) & (r / s > 0.42) & (g / s < 0.30) & (s > 60) & (s < 450)


def fist_of(l2, side='R'):
    if side == 'L':
        return (l2[15, :2] * 0.4 + l2[19, :2] * 0.35 + l2[17, :2] * 0.25)
    return (l2[16, :2] * 0.4 + l2[20, :2] * 0.35 + l2[18, :2] * 0.25)


def fix_sword_arm(T, log=print, margin=0.12):
    """The sword is in his RIGHT hand: where the blade leaves the tool's LEFT fist clearly better than its
    right one, the tool swapped his arms in that frame; swap them back (5-frame majority)."""
    from .takes import ARM_L, ARM_R
    n = len(T.t)
    vote = np.zeros(n)
    for i in range(n):
        _, path = cfg.frame_at(T.film, T.t[i])
        img = np.asarray(Image.open(path).convert('RGB'), np.int16)
        sr = ray_scores(img, T.l2[i], 'R')[0].max()
        sl = ray_scores(img, T.l2[i], 'L')[0].max()
        vote[i] = 1 if sl > sr + margin else 0
    sw = np.array([np.median(vote[max(0, i - 2):i + 3]) > 0.5 for i in range(n)])
    if sw.any():
        for a, b in zip(ARM_L, ARM_R):
            T.l2[sw, a], T.l2[sw, b] = T.l2[sw, b].copy(), T.l2[sw, a].copy()
            T.c[sw, a], T.c[sw, b] = T.c[sw, b].copy(), T.c[sw, a].copy()
        T.solve_camera(None, T.spec_yaw, lambda s: None)
    log('  sword %s: arms swapped back in %d frames (the blade was in the tool-labelled left fist)' % (T.name, int(sw.sum())))
    return int(sw.sum())


def ray_scores(img, l2, side='R'):
    """scores (NA,) and the visible length (px) per direction, from his right fist"""
    H = np.linalg.norm((l2[11, :2] + l2[12, :2]) / 2 - (l2[27, :2] + l2[28, :2]) / 2) * 1.25
    H = max(H, 40)
    f = fist_of(l2, side)
    rr = np.linspace(0.06 * H, 0.42 * H, 26)
    m = rust_mask(img)
    h, w = m.shape
    sc = np.zeros(NA)
    ln = np.zeros(NA)
    for k, a in enumerate(ANG):
        d = np.array([np.cos(a), np.sin(a)])
        nrm = np.array([-d[1], d[0]])
        hits = np.zeros(len(rr))
        for o in (-3.0, -1.5, 0.0, 1.5, 3.0):
            p = f[None] + rr[:, None] * d[None] + o * nrm[None]
            x = np.clip(p[:, 0].round().astype(int), 0, w - 1)
            y = np.clip(p[:, 1].round().astype(int), 0, h - 1)
            ok = (p[:, 0] >= 0) & (p[:, 0] < w) & (p[:, 1] >= 0) & (p[:, 1] < h)
            hits = np.maximum(hits, m[y, x] & ok)
        # a blade is a run from near the fist: weight the near part more
        wgt = np.linspace(1.3, 0.7, len(rr))
        sc[k] = (hits * wgt).sum() / wgt.sum()
        run = np.where(hits == 0)[0]
        ln[k] = rr[min(run[run > 2][0], len(rr) - 1)] if (run > 2).any() else rr[-1]
    return sc, ln


def track_2d(T, idx, max_step_deg=30.0, min_score=0.2):
    """2D blade angles for take T's frames `idx` (indices into T.t): angle (rad, image axes: x right,
    y down), confidence (0 = unknown), and the raw best score"""
    S = []
    for i in idx:
        _, path = cfg.frame_at(T.film, T.t[i])
        img = np.asarray(Image.open(path).convert('RGB'), np.int16)
        S.append(ray_scores(img, T.l2[i])[0])
    S = np.array(S)
    n = len(S)
    best = S.max(1)
    # DP: cost = -score (or flat when unknown) + a penalty on turning beyond max_step
    step = max_step_deg / (360 / NA)
    da = np.abs((np.arange(NA)[:, None] - np.arange(NA)[None] + NA / 2) % NA - NA / 2)
    trans = np.where(da <= step, 0.0, (da - step) * 0.08) + da * 0.004
    known = best >= min_score
    unary = np.where(known[:, None], -S, 0.0)
    cost = unary[0].copy()
    back = np.zeros((n, NA), int)
    for t in range(1, n):
        tot = cost[:, None] + trans
        back[t] = np.argmin(tot, 0)
        cost = tot[back[t], np.arange(NA)] + unary[t]
    path = np.zeros(n, int)
    path[-1] = int(np.argmin(cost))
    for t in range(n - 1, 0, -1):
        path[t - 1] = back[t, path[t]]
    conf = np.where(known, np.clip((best - min_score) / 0.3 + 0.3, 0, 1), 0.0)
    # sub-bin refinement
    ang = ANG[path].copy()
    for t in range(n):
        k = path[t]
        a, b, c = S[t, (k - 1) % NA], S[t, k], S[t, (k + 1) % NA]
        den = a - 2 * b + c
        if known[t] and abs(den) > 1e-6:
            ang[t] += 0.5 * (a - c) / den * (2 * np.pi / NA)
    return ang, conf, best


def keyed_2d(T, idx, keys):
    """angles from hand keys (tip pixel positions at video times), interpolated"""
    ks = sorted((cfg.parse_time(k[0]), k[1], k[2]) for k in keys)
    kt = np.array([k[0] for k in ks])
    tip = np.array([[k[1], k[2]] for k in ks])
    out = np.full(len(idx), np.nan)
    for j, i in enumerate(idx):
        t = T.t[i]
        if t < kt[0] - 1e-3 or t > kt[-1] + 1e-3:
            continue
        p = np.array([np.interp(t, kt, tip[:, 0]), np.interp(t, kt, tip[:, 1])])
        d = p - fist_of(T.l2[i])
        out[j] = np.arctan2(d[1], d[0])
    return out


def prior_dir(b, k):
    """the blade's likely direction from the hand landmarks: across the forearm, on the thumb side"""
    fo = b[k, 16] - b[k, 14]
    fo /= np.linalg.norm(fo) + 1e-9
    th = b[k, 20] - b[k, 18]
    th = th - fo * (th @ fo)
    if np.linalg.norm(th) < 1e-6:
        th = np.array([0, 0, 1.0]) - fo * fo[2]
    return th / (np.linalg.norm(th) + 1e-9)


def blade_dirs(spec, clip, B, Ts, log=print):
    """the blade's unit direction (n, 3) in his body frame per clip frame (after decimation)"""
    kind = clip.get('kind', 'oneshot')
    nb = len(B.b)
    step = 1 if kind != 'oneshot' else int(round(60.0 / B.fps))
    # fused 60 fps frames -> each take's frame index
    per = []
    for ti, T in enumerate(Ts):
        if kind == 'oneshot':
            s = B.offsets[ti]
            idx = np.clip(np.arange(nb) * step + s, 0, len(T.t) - 1)
        else:
            idx = np.arange(len(T.t))
        ang, conf, best = track_2d(T, idx)
        for kk in clip.get('blade_keys', []):
            if kk.get('take', 0) == ti:
                ka = keyed_2d(T, idx, kk['keys'])
                ok = ~np.isnan(ka)
                ang[ok] = ka[ok]
                conf[ok] = 1.0
        per.append((T, idx, ang, conf))
        log('  sword %s: blade found in %d%% of frames (median score %.2f)' % (T.name, 100 * (conf > 0).mean(), np.median(best)))
    out = np.full((nb, 3), np.nan)
    if kind != 'oneshot':
        # a held pose: each take's median picture angle gives a plane; two takes from different sides
        # intersect in the blade (else one take + the prior)
        planes = []
        for T, idx, ang, conf in per:
            ok = conf > 0
            if ok.sum() < 3:
                continue
            a_med = np.arctan2(np.median(np.sin(ang[ok])), np.median(np.cos(ang[ok])))
            u = np.array([np.cos(a_med), -np.sin(a_med), 0.0])
            planes.append((T.R.T @ np.cross(u, [0, 0, 1.0]), ok.mean(), T, u, idx[ok]))
        d = None
        best = None
        for i in range(len(planes)):
            for j in range(i + 1, len(planes)):
                c = np.cross(planes[i][0], planes[j][0])
                if np.linalg.norm(c) > 0.5 and (best is None or np.linalg.norm(c) > best[0]):
                    best = (np.linalg.norm(c), c / np.linalg.norm(c), planes[i])
        if best is not None:
            d = best[1]
            T0, u0 = best[2][2], best[2][3]
            if (T0.R @ d)[:2] @ u0[:2] < 0:
                d = -d
            log('  sword: held blade from two takes (planes intersected)')
        elif planes:
            p0 = max(planes, key=lambda p: p[1])
            d = _in_plane(p0[2], p0[3], prior_dir(B.b, 0))
            log('  sword: held blade from one take + the prior')
        if d is not None:
            out[:] = d
        B.blade_conf = np.ones(nb) * (1.0 if d is not None else 0.0)
    else:
        bconf = np.zeros(nb)
        for k in range(nb):
            planes = []
            for T, idx, ang, conf in per:
                if conf[k] <= 0:
                    continue
                u = np.array([np.cos(ang[k]), -np.sin(ang[k]), 0.0])  # image dir -> camera (y up)
                n_cam = np.cross(u, [0, 0, 1.0])
                planes.append((T.R.T @ n_cam, conf[k], T, u))
            if not planes:
                continue
            planes.sort(key=lambda p: -p[1])
            d = None
            if len(planes) >= 2:
                n1, n2 = planes[0][0], planes[1][0]
                c = np.cross(n1, n2)
                if np.linalg.norm(c) > 0.3:
                    d = c / np.linalg.norm(c)
                    # the sign: its picture in the best take points along u
                    T0, u0 = planes[0][2], planes[0][3]
                    if (T0.R @ d)[:2] @ u0[:2] < 0:
                        d = -d
            if d is None:
                T0, u0 = planes[0][2], planes[0][3]
                d = _in_plane(T0, u0, prior_dir(B.b, k))
            out[k] = d
            bconf[k] = planes[0][1]
        B.blade_conf = bconf
    # fill unknown frames: interpolate directions (normalised lerp), hold at the ends
    ok = ~np.isnan(out[:, 0])
    if not ok.any():
        log('  ! sword: no blade found; the hand keeps its measured roll')
        return None
    # the blade is rigid in the fist: unknown frames are filled in the FOREARM's frame (forearm axis +
    # the thumb side), so a fast cut the camera blurs follows the arm instead of a straight blend
    idx = np.arange(nb)
    Fm = forearm_frames(B.b)  # (nb, 3, 3) columns = forearm axes in the body frame
    loc = np.full((nb, 3), np.nan)
    loc[ok] = np.einsum('nji,nj->ni', Fm[ok], out[ok])
    # outliers: a measured direction far (> 50 deg) from the median of its measured neighbours (in the
    # forearm's frame, where the blade barely moves) is a wrong ray; drop it
    ki = np.where(ok)[0]
    for j, k in enumerate(ki):
        nb_ = ki[max(0, j - 4):j + 5]
        med = np.median(loc[nb_], 0)
        med /= np.linalg.norm(med) + 1e-9
        if loc[k] @ med < np.cos(np.radians(50)):
            ok[k] = False
    loc[~ok] = np.nan
    for c in range(3):
        loc[:, c] = np.interp(idx, idx[ok], loc[ok, c])
    out = np.einsum('nij,nj->ni', Fm, loc)
    out /= np.linalg.norm(out, axis=1, keepdims=True)
    from .retarget import smooth_time
    out = smooth_time(out, 1.0 if B.fps <= 30 else 2.0)
    out /= np.linalg.norm(out, axis=1, keepdims=True)
    log('  sword: %d of %d clip frames measured, the rest interpolated' % (ok.sum(), nb))
    return out


def forearm_frames(b):
    """per frame a right-handed frame on his right forearm: x along it (elbow -> wrist), y the thumb side"""
    x = b[:, 16] - b[:, 14]
    x /= np.linalg.norm(x, axis=1, keepdims=True) + 1e-9
    y = b[:, 20] - b[:, 18]
    y -= x * np.sum(x * y, 1, keepdims=True)
    bad = np.linalg.norm(y, axis=1) < 1e-4
    y[bad] = np.array([0, 0, 1.0])
    from .retarget import smooth_time
    y = smooth_time(y / (np.linalg.norm(y, axis=1, keepdims=True) + 1e-9), 2.0)
    y -= x * np.sum(x * y, 1, keepdims=True)
    y /= np.linalg.norm(y, axis=1, keepdims=True) + 1e-9
    z = np.cross(x, y)
    return np.stack([x, y, z], 2)


def _in_plane(T, u, prior):
    """the unit body-frame direction whose picture in take T points along u, nearest the prior"""
    a = T.R.T @ u  # in the image plane, along u
    c = T.R.T @ np.array([0, 0, 1.0])  # the camera ray (depth)
    # directions cos(t) a + sin(t) c with cos(t) > 0 (it must point along u in the picture)
    t = np.arctan2(prior @ c, prior @ a)
    t = np.clip(t, -1.2, 1.2)
    d = np.cos(t) * a + np.sin(t) * c
    return d / np.linalg.norm(d)


def _one_view(T, i, ang, b0):
    u = np.array([np.cos(ang), -np.sin(ang), 0.0])
    bb = T.b[i:i + 1]
    return _in_plane(T, u, prior_dir(bb, 0))
