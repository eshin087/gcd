"""KEY-FIRST limbs and blade (spec take keys "limb_keys" (alias "arm_keys") and "lose"): for attacks, jumps,
tumbles: anywhere the tracker fails, the author's 2D keys REPLACE it for the points they give, and drive
the 3D, from ONE take.

  "lose": [{"t0": "1:15.12", "t1": "1:15.33", "limbs": ["armL", "armR"]}, ...]
      the tracker's points of those limbs are thrown away over the span and bridged from the frames round
      it (in 3D and in the picture); the other limbs stay tracked. Limbs: armL, armR (elbow, wrist, hand),
      legL, legR (knee, ankle, heel, toe), torso (shoulders, hips; the picture fit is bridged too), head,
      body (everything). Keys inside the span then give the motion.
  "limb_keys": {"blend": 3, "keys": [
      {"t": "1:15.34", "pts": {"shoulderR": [x, y], "elbowR": [x, y], "wristR": [x, y], "kneeL": [x, y],
                              "hilt": [x, y], "tip": [x, y], ...},
       "near": ["elbowR"], "far": ["tip", "kneeL"]}, ...]}
      (a plain list of keys is the same with blend 3)

- Points: nose, earL/R, shoulderL/R, elbowL/R, wristL/R, hipL/R, kneeL/R, ankleL/R, heelL/R, toeL/R, and the
  blade's hilt and tip. Full-frame pixels, read off `armsheet.py` (it prints the tracker and the current
  keys, and writes a pre-filled key list to correct instead of typing from scratch).
- Between keys each point follows a smooth spline (Catmull-Rom in time); a key every 2-5 frames through a
  cut. A point is replaced from its first key to its last; `blend` frames either side ease back to the
  tracker (or to the bridged `lose` span). A point never keyed stays tracked / bridged.
- DEPTH, from ONE take: a root point (shoulder, hip, nose, ear) keeps the tracker's depth (smoothed; bridged
  in a lost span); every other point hangs off its parent (shoulder -> elbow -> wrist, hip -> knee ->
  ankle -> heel / toe, hilt -> tip) at the bone's LENGTH: its depth is what the length leaves after the
  picture's part (a bone seen at full length lies flat in the picture). The depth's sign holds while the
  bone is clearly foreshortened and passes smoothly through zero; it is the tracker's sign unless a key
  says: "near": [names] = that point is NEARER the camera than its parent, "far": [names] = farther. A
  direction the picture cannot settle at all: a `pose_keys` "dir" entry (his own frame).
- With keys in two takes that see the same moment (rare: see "check" takes), every keyed point is
  triangulated from both (two-view least squares).
- The hands of a keyed arm: the sword hand takes the blade (the hand's +Z along it); a free hand relaxes
  along the forearm (key its roll with pose_keys on handL). The keyed blade wins over the detector.
- Keyed arm joints keep their real speed: `despike` leaves them alone; a keyed cut usually needs
  `"qa": {"maxStepDeg": .., "reason": "keyed cut ..."}` for the checker."""
import numpy as np
from . import cfg
from .skel import HDIM

PTS = {'nose': 0, 'earL': 7, 'earR': 8, 'shoulderL': 11, 'shoulderR': 12, 'elbowL': 13, 'elbowR': 14,
       'wristL': 15, 'wristR': 16, 'hipL': 23, 'hipR': 24, 'kneeL': 25, 'kneeR': 26, 'ankleL': 27,
       'ankleR': 28, 'heelL': 29, 'heelR': 30, 'toeL': 31, 'toeR': 32}
ARM = {k: v for k, v in PTS.items() if k[:-1] in ('shoulder', 'elbow', 'wrist')}
ROOTS = ('nose', 'earL', 'earR', 'shoulderL', 'shoulderR', 'hipL', 'hipR')
BONES = [('shoulderL', 'elbowL'), ('elbowL', 'wristL'), ('shoulderR', 'elbowR'), ('elbowR', 'wristR'),
         ('hipL', 'kneeL'), ('kneeL', 'ankleL'), ('ankleL', 'heelL'), ('ankleL', 'toeL'),
         ('hipR', 'kneeR'), ('kneeR', 'ankleR'), ('ankleR', 'heelR'), ('ankleR', 'toeR')]
CHAIN = {'L': (11, 13, 15), 'R': (12, 14, 16)}
HAND = {'L': (17, 19, 21), 'R': (18, 20, 22)}  # pinky, index, thumb
NAMES = list(PTS) + ['hilt', 'tip']
LIMBS = {'armL': [13, 15, 17, 19, 21], 'armR': [14, 16, 18, 20, 22], 'legL': [25, 27, 29, 31],
         'legR': [26, 28, 30, 32], 'torso': [11, 12, 23, 24], 'head': list(range(0, 11)),
         'body': list(range(33))}
FIT = [11, 12, 23, 24, 25, 26, 27, 28]  # picture <-> camera fit: torso and legs (never the arms)
TORSO_M = 0.576  # our shoulders' mid -> hips' mid (dims.js: spine + chest + clavUp + hipDrop)


def _keys(tk):
    ak = tk.get('limb_keys', tk.get('arm_keys'))
    if not ak:
        return None, 3
    if isinstance(ak, dict):
        return ak.get('keys', []), int(ak.get('blend', 3))
    return ak, 3


def _hermite(kt, kv, t):
    """Catmull-Rom through keys (kt (m,), kv (m, 2)) at times t (inside [kt0, kt-1]); one key: constant"""
    m = len(kt)
    if m == 1:
        return np.repeat(kv[:1], len(t), 0)
    tan = np.zeros_like(kv)
    for i in range(m):
        a, b = max(i - 1, 0), min(i + 1, m - 1)
        tan[i] = (kv[b] - kv[a]) / max(kt[b] - kt[a], 1e-6)
    i = np.clip(np.searchsorted(kt, t, side='right') - 1, 0, m - 2)
    h = np.maximum(kt[i + 1] - kt[i], 1e-6)
    u = np.clip((t - kt[i]) / h, 0, 1)[:, None]
    h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
    return h00 * kv[i] + h10 * h[:, None] * tan[i] + h01 * kv[i + 1] + h11 * h[:, None] * tan[i + 1]


def lost_mask(T, tk):
    """(n, 33) bool: the points the spec's "lose" spans throw away"""
    n = len(T.t)
    m = np.zeros((n, 33), bool)
    for ls in tk.get('lose', []):
        a, b = cfg.parse_time(ls['t0']), cfg.parse_time(ls['t1'])
        fr = (T.t >= a - 1e-3) & (T.t <= b + 1e-3)
        for lb in ls.get('limbs', ['body']):
            m[np.ix_(fr, LIMBS[lb])] = True
    return m


def _bridge(arr, bad):
    """per point: values in bad frames interpolated (linear in time) from the good frames round them"""
    out = arr.copy()
    n = len(arr)
    idx = np.arange(n)
    for j in range(arr.shape[1]):
        b = bad[:, j]
        if not b.any() or b.all():
            continue
        g = ~b
        for d in range(arr.shape[2]):
            out[b, j, d] = np.interp(idx[b], idx[g], arr[g, j, d])
    return out


def picture_fit(T, lost=None):
    """per frame: scale S (px per tool metre) and shift Tr so (S x + tx, -S y + ty) = the picture, fitted
    on the torso and legs the spec did not lose (never the arms), bridged where too few are left, smoothed"""
    from .retarget import smooth_time
    pel = (T.c[:, 23] + T.c[:, 24]) / 2
    rel = T.c - pel[:, None]
    n = len(rel)
    S = np.full(n, np.nan)
    Tr = np.full((n, 2), np.nan)
    for i in range(n):
        use = [j for j in FIT if lost is None or not lost[i, j]]
        if len(use) < 4 or (lost is not None and lost[i, [11, 12, 23, 24]].any()):
            continue
        p = rel[i, use, :2] * np.array([1, -1.0])
        q = T.l2[i, use, :2]
        pm, qm = p.mean(0), q.mean(0)
        s = ((p - pm) * (q - qm)).sum() / max(((p - pm) ** 2).sum(), 1e-9)
        S[i] = s
        Tr[i] = qm - s * pm
    ok = ~np.isnan(S)
    idx = np.arange(n)
    if ok.sum() >= 2 and not ok.all():
        S = np.interp(idx, idx[ok], S[ok])
        Tr = np.stack([np.interp(idx, idx[ok], Tr[ok, d]) for d in (0, 1)], 1)
    S = smooth_time(S[:, None], 2.0)[:, 0]
    Tr = smooth_time(Tr, 1.0)
    return S, Tr


OURS = {'elbow': HDIM['upperArm'], 'wrist': HDIM['foreArm'], 'knee': HDIM['thigh'], 'ankle': HDIM['shin']}


def zoom_fix(T, S, Tr, tor, lost=None):
    """the picture scale per frame where the camera ZOOMS: the take's cleaning drops a zoomed frame as an
    odd size and interpolates it from its unzoomed neighbours, so its fitted scale is wrong for keys read off
    that very frame (heavy2, charge2: blades of 1.5-1.8 m; a key in a drop span: 5.6 m). Every cached frame of
    the span (odd ones too) gives his torso's picture length and pelvis; where that scale differs from the
    fit by more than 15 %, it wins (and the pelvis sets the shift). Returns S, Tr, frames changed"""
    from . import track
    c = track.load_cache(T.film, T.t[0], T.t[-1])
    ts = sorted(t for t, v in c.items() if v[3])
    if len(ts) < 2 or tor <= 0:
        return S, Tr, 0
    L = np.array([c[t][1] for t in ts])
    pel = (L[:, 23, :2] + L[:, 24, :2]) / 2
    tp = np.linalg.norm((L[:, 11, :2] + L[:, 12, :2]) / 2 - pel, axis=1)
    ts = np.array(ts)
    near = np.abs(T.t[:, None] - ts[None]).min(1) < 0.02
    St = np.interp(T.t, ts, tp) / tor
    bad = near & (np.abs(St / np.maximum(S, 1e-9) - 1) > 0.15)
    if lost is not None:
        bad &= ~lost[:, [11, 12, 23, 24]].any(1)  # a torso the spec says the tracker lost is no measure
    if not bad.any():
        return S, Tr, 0
    S, Tr = S.copy(), Tr.copy()
    S[bad] = St[bad]
    Tr[bad, 0] = np.interp(T.t[bad], ts, pel[:, 0])
    Tr[bad, 1] = np.interp(T.t[bad], ts, pel[:, 1])
    return S, Tr, int(bad.sum())


def _cap_len(xy, base, L, w):
    """a keyed point whose picture offset from its parent is longer than the bone (a zoom, a misread) is
    pulled in to the bone's length along the same picture direction"""
    d = xy - base
    ln = np.linalg.norm(d, axis=1)
    over = (ln > L) & (w > 0)
    xy = xy.copy()
    xy[over] = base[over] + d[over] / ln[over, None] * L
    return xy, int(over.sum())


def _interp_keys(T, keys, blend):
    """per keyed name: (pixel positions on T.t (n, 2), weight (n,)); and the hint signs per name (n,)"""
    n = len(T.t)
    fr = 1.0 / 60.0
    out = {}
    hints = {}
    for nm in NAMES:
        ks = sorted([(cfg.parse_time(k['t']), k['pts'][nm]) for k in keys if nm in k.get('pts', {})], key=lambda a: a[0])
        if not ks:
            continue
        kt = np.array([a for a, _ in ks])
        kv = np.array([b for _, b in ks], float)
        tt = np.clip(T.t, kt[0], kt[-1])
        px = _hermite(kt, kv, tt)
        d = np.maximum(kt[0] - T.t, T.t - kt[-1]) / fr  # frames outside the keyed range
        w = np.where(d <= 0, 1.0, np.clip(1 - d / (blend + 1), 0, 1))
        out[nm] = (px, w)
        hs = np.zeros(n)
        for k in keys:
            s = (1 if nm in k.get('near', []) else 0) - (1 if nm in k.get('far', []) else 0)
            if s:
                hs[int(np.argmin(np.abs(T.t - cfg.parse_time(k['t']))))] = s
        hints[nm] = hs
    return out, hints


def _signed_depth(mag, L, tracked, hint, w):
    """a bone's signed depth per frame: |depth| from its length, the sign held while it is clearly
    foreshortened (|dz| > 0.3 L; the author's hint there, else the tracker's majority), interpolated
    straight through the near-zero zones (no flip)"""
    n = len(mag)
    big = (mag > 0.3 * L) & (w > 0)
    out = np.full(n, np.nan)
    i = 0
    while i < n:
        if not big[i]:
            i += 1
            continue
        j = i
        while j < n and big[j]:
            j += 1
        hs = hint[i:j]
        if np.any(hs != 0):
            sg = 1.0 if hs[hs != 0].sum() >= 0 else -1.0
        else:
            sg = 1.0 if np.sum(np.sign(tracked[i:j]) * mag[i:j]) >= 0 else -1.0
        out[i:j] = sg * mag[i:j]
        i = j
    ok = ~np.isnan(out)
    idx = np.arange(n)
    if not ok.any():
        return np.sign(np.where(tracked == 0, 1, tracked)) * mag
    return np.interp(idx, idx[ok], out[ok])


def _synth_hand(c, wr, el, side, thumb_dir=None):
    """hand points (pinky, index, thumb) from the wrist and forearm (tool metres): the hand along the
    forearm, its thumb side `thumb_dir` (the blade) or across the forearm"""
    fo = c[:, wr] - c[:, el]
    fo /= np.maximum(np.linalg.norm(fo, axis=1, keepdims=True), 1e-9)
    if thumb_dir is None:
        thumb_dir = np.cross(fo, np.array([0, 0, 1.0]))
        bad = np.linalg.norm(thumb_dir, axis=1) < 1e-3
        thumb_dir[bad] = np.array([0, 1.0, 0])
    s = thumb_dir - fo * np.sum(fo * thumb_dir, 1, keepdims=True)
    s /= np.maximum(np.linalg.norm(s, axis=1, keepdims=True), 1e-9)
    w = c[:, wr]
    pk, ix, th = HAND[side]
    return {pk: w + 0.075 * fo - 0.02 * s, ix: w + 0.085 * fo + 0.02 * s, th: w + 0.045 * fo + 0.035 * s}


def apply(T, tk, log=print):
    """the take's "lose" spans and limb keys -> its camera-frame points (one-view depth) and picture
    points; keeps on the take what the fusion needs (T.ak). Call after the take's camera is solved; it is
    solved again."""
    keys, blend = _keys(tk)
    keys = keys or []
    lost = lost_mask(T, tk)
    if not keys and not lost.any():
        return
    from .retarget import smooth_time
    n = len(T.t)
    c0 = T.c.copy()
    pel = (c0[:, 23] + c0[:, 24]) / 2
    rel = c0 - pel[:, None]
    S, Tr = picture_fit(T, lost)
    good = ~lost
    # the tool's own scale and bone lengths, from the frames it did not lose
    gt = good[:, [11, 12, 23, 24]].all(1)
    tor = np.median(np.linalg.norm((rel[gt, 11] + rel[gt, 12]) / 2 - (rel[gt, 23] + rel[gt, 24]) / 2, axis=1)) if gt.any() else 0.5
    k_m = tor / TORSO_M
    zf = bool(tk.get('zoom_fix'))  # take "zoom_fix": true (opt-in: it changes the depths a take's hints were set for)
    S, Tr, nz = zoom_fix(T, S, Tr, tor, lost) if zf else (S, Tr, 0)
    # lost points: bridged in 3D and in the picture from the frames round each span
    if lost.any():
        rel = _bridge(rel, lost)
        l2 = T.l2.copy()
        l2[:, :, :2] = _bridge(T.l2[:, :, :2], lost)
        T.l2 = l2
    kp, hints = _interp_keys(T, keys, blend)
    W = np.zeros((n, 33))
    pix = T.l2[:, :, :2].copy()
    new = rel.copy()

    def cam_xy(px):
        return np.stack([(px[:, 0] - Tr[:, 0]) / S, -(px[:, 1] - Tr[:, 1]) / S], 1)

    zt = smooth_time(rel[:, :, 2], 2.0)  # the depths (tracked or bridged), smoothed: roots and signs
    notes = []
    long_n = 0
    for nm in ROOTS:
        if nm not in kp:
            continue
        j = PTS[nm]
        px, w = kp[nm]
        new[:, j, :2] = rel[:, j, :2] * (1 - w[:, None]) + cam_xy(px) * w[:, None]
        new[:, j, 2] = zt[:, j]
        pix[:, j] = pix[:, j] * (1 - w[:, None]) + px * w[:, None]
        W[:, j] = w
    for pn, cn in BONES:
        if cn not in kp:
            continue
        pj, cj = PTS[pn], PTS[cn]
        px, w = kp[cn]
        xy = cam_xy(px)
        ok = good[:, pj] & good[:, cj]
        L3 = np.median(np.linalg.norm(rel[ok if ok.any() else slice(None), cj] - rel[ok if ok.any() else slice(None), pj], axis=1))
        d2 = np.linalg.norm(xy - new[:, pj, :2], axis=1)
        full = w >= 0.999
        Lref = max(L3, OURS.get(cn[:-1], 0) * k_m)  # the tracker under-reads an armoured arm: never cap below ours
        L = max(L3, float(d2[full].max()) * 1.02 if full.any() else L3)
        if zf:
            L = min(L, 1.15 * Lref)
            xy, nl = _cap_len(xy, new[:, pj, :2], L, w)
            d2 = np.linalg.norm(xy - new[:, pj, :2], axis=1)
            long_n += nl
        mag = np.sqrt(np.maximum(L * L - d2 * d2, 0))
        dz = _signed_depth(mag, L, zt[:, cj] - zt[:, pj], hints[cn], w)
        new[:, cj, :2] = rel[:, cj, :2] * (1 - w[:, None]) + xy * w[:, None]
        new[:, cj, 2] = rel[:, cj, 2] * (1 - w) + (new[:, pj, 2] + dz) * w
        pix[:, cj] = pix[:, cj] * (1 - w[:, None]) + px * w[:, None]
        W[:, cj] = w
        if cn[:-1] in ('elbow', 'wrist', 'knee', 'ankle'):
            notes.append('%s %.2f' % (cn, L / k_m))
    # the blade: hilt + tip (the tip's depth from the blade's length)
    T.ak_blade = None
    if 'tip' in kp:
        pt, wt = kp['tip']
        if 'hilt' in kp:
            ph, wh = kp['hilt']
        else:
            from .sword import fist_of
            ph = np.array([fist_of(np.concatenate([pix[i], T.l2[i, :, 2:]], 1)) for i in range(n)])
            wh = wt
        hxy, txy = cam_xy(ph), cam_xy(pt)
        hz = new[:, 16, 2]  # the hilt at the sword wrist's depth
        d2 = np.linalg.norm(txy - hxy, axis=1)
        full = wt >= 0.999
        Lb = HDIM['blade'] * k_m
        L = max(Lb, float(d2[full].max()) * 1.02 if full.any() else 0)
        if zf:
            L = min(L, 1.15 * Lb)
            txy, nl = _cap_len(txy, hxy, L, wt)
            d2 = np.linalg.norm(txy - hxy, axis=1)
            long_n += nl
        mag = np.sqrt(np.maximum(L * L - d2 * d2, 0))
        trk = new[:, 16, 2] - new[:, 14, 2]  # no tracked blade: the sword forearm's own sign
        dz = _signed_depth(mag, L, trk, hints['tip'], wt)
        hc = np.concatenate([hxy, hz[:, None]], 1)
        tc = np.concatenate([txy, (hz + dz)[:, None]], 1)
        T.ak_blade = dict(h=hc, t=tc, w=np.minimum(wt, wh), hpx=ph, tpx=pt)
        notes.append('blade %.2f' % (L / k_m))
    # the hands of a keyed (or lost) arm: synthesized along the forearm (the sword hand's thumb side
    # toward the blade)
    for side, (sh, el, wr) in CHAIN.items():
        w = np.maximum(W[:, wr], lost[:, wr].astype(float))
        if not (w > 0).any():
            continue
        thumb = None
        if side == 'R' and T.ak_blade is not None:
            thumb = T.ak_blade['t'] - T.ak_blade['h']
        hp = _synth_hand(new, wr, el, side, thumb)
        for j, v in hp.items():
            new[:, j] = new[:, j] * (1 - w[:, None]) + v * w[:, None]
            pj = np.stack([S * new[:, j, 0] + Tr[:, 0], -S * new[:, j, 1] + Tr[:, 1]], 1)
            pix[:, j] = pix[:, j] * (1 - w[:, None]) + pj * w[:, None]
            W[:, j] = np.maximum(W[:, j], W[:, wr])
    T.c = new + pel[:, None]
    T.l2 = T.l2.copy()
    T.l2[:, :, :2] = pix
    T.l2[W > 0, 3] = np.maximum(T.l2[W > 0, 3], 0.9)
    # a lost, unkeyed point hardly counts in a fusion
    T.ak = dict(W=W, S=S, Tr=Tr, pix=pix.copy(), k=k_m, tor=tor, lost=lost)
    T.solve_camera(T.spec.get('pitch'), T.spec_yaw, lambda s: None)
    msg = '  limb keys %s: ' % T.name
    if nz:
        msg += 'zoom: %d frames scaled by his torso in the picture; ' % nz
    if long_n:
        msg += '%d keyed bone frames longer than the bone in the picture (capped at 1.15x); ' % long_n
    if lost.any():
        msg += '%d frames lose points (%s); ' % (int(lost.any(1).sum()), ', '.join(sorted(set(
            lb for ls in tk.get('lose', []) for lb in ls.get('limbs', ['body'])))))
    if keys:
        kf = sorted(set(round(cfg.parse_time(k['t']), 3) for k in keys))
        msg += '%d keys %s-%s, points %s; lengths (m) %s' % (len(kf), cfg.fmt_time(kf[0]), cfg.fmt_time(kf[-1]),
                                                           ','.join(sorted(kp)), ', '.join(notes))
    log(msg)


def _tri(rows, prior, lam=0.03):
    """least squares body-frame point from picture rows [(A (2,3), b (2,), w)], pulled weakly to `prior`"""
    M = lam * np.eye(3)
    v = lam * prior
    for A, b, w in rows:
        M += w * A.T @ A
        v += w * A.T @ b
    return np.linalg.solve(M, v)


def override_fused(B, Ts, fused, log=print):
    """one-shots: the fused 60 fps landmarks' arm points (and the blade) where any take is keyed: each
    point triangulated from every keyed take that sees that moment (two views), else the keyed take's own
    one-view point. Sets B.key_blade (60 fps (n, 3) unit, his body frame) and B.key_blade_w, B.key_relax
    (n, 2): how much each hand is keyed."""
    n = len(fused)
    out = fused.copy()
    kt = [(i, T) for i, T in enumerate(Ts) if getattr(T, 'ak', None) is not None]
    B.key_blade = None
    B.key_blade_w = np.zeros(n)
    B.key_relax = np.zeros((n, 2))
    if not kt:
        return fused
    offs = B.offsets
    ref_tor = kt[0][1].ak['tor']
    two = np.zeros(n, int)
    for j in sorted(set(j for _, T in kt for j in np.where(T.ak['W'].max(0) > 0)[0]) - set(range(17, 23))):
        for k in range(n):
            rows, pri, ws = [], [], []
            for i, T in kt:
                f = k + offs[i]
                if not (0 <= f < len(T.t)):
                    continue
                w = T.ak['W'][f, j]
                if w <= 0:
                    continue
                sc = ref_tor / T.ak['tor']
                S, Tr = T.ak['S'][f], T.ak['Tr'][f]
                px = T.ak['pix'][f, j]
                b = np.array([(px[0] - Tr[0]) / S, -(px[1] - Tr[1]) / S]) * sc
                rows.append((T.Rs[f][:2], b, w))
                pri.append(T.b[f, j] * sc)
                ws.append(w)
            if not rows:
                continue
            prior = np.average(pri, axis=0, weights=ws)
            p = _tri(rows, prior) if len(rows) >= 2 else prior
            if len(rows) >= 2:
                two[k] += 1
            wm = max(ws)
            out[k, j] = fused[k, j] * (1 - wm) + p * wm
    # the blade: hilt and tip as points
    hb, tb, bw = np.zeros((n, 3)), np.zeros((n, 3)), np.zeros(n)
    have = False
    for k in range(n):
        rh, rt, ph, pt, ws = [], [], [], [], []
        for i, T in kt:
            bl = getattr(T, 'ak_blade', None)
            f = k + offs[i]
            if bl is None or not (0 <= f < len(T.t)) or bl['w'][f] <= 0:
                continue
            sc = ref_tor / T.ak['tor']
            S, Tr = T.ak['S'][f], T.ak['Tr'][f]
            R = T.Rs[f]
            for px, rr in ((bl['hpx'][f], rh), (bl['tpx'][f], rt)):
                rr.append((R[:2], np.array([(px[0] - Tr[0]) / S, -(px[1] - Tr[1]) / S]) * sc, bl['w'][f]))
            ph.append(R.T @ bl['h'][f] * sc)  # camera -> body: v_body = R^T v_cam
            pt.append(R.T @ bl['t'][f] * sc)
            ws.append(bl['w'][f])
        if not ws:
            continue
        have = True
        h0 = np.average(ph, axis=0, weights=ws)
        t0 = np.average(pt, axis=0, weights=ws)
        if len(ws) >= 2:
            # keep the one-view blade length: triangulate the tip's DIRECTION from the hilt
            h1 = _tri(rh, h0)
            t1 = _tri(rt, t0)
            d = t1 - h1
            if d @ (t0 - h0) < 0:
                d = t0 - h0
        else:
            d = t0 - h0
        hb[k], tb[k] = h0, h0 + d
        bw[k] = max(ws)
    if have:
        d = tb - hb
        B.key_blade = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
        B.key_blade_w = bw
    for f, side in enumerate(('L', 'R')):
        sh, el, wr = CHAIN[side]
        for i, T in kt:
            idx = np.clip(np.arange(n) + offs[i], 0, len(T.t) - 1)
            B.key_relax[:, f] = np.maximum(B.key_relax[:, f], np.maximum(T.ak['W'][idx, wr], T.ak['lost'][idx, wr]))
    # the hand points of keyed arms, from the fused (keyed) forearm in his body frame
    for f, side in enumerate(('L', 'R')):
        sh, el, wr = CHAIN[side]
        w = B.key_relax[:, f]
        if not (w > 0).any():
            continue
        thumb = B.key_blade if side == 'R' and B.key_blade is not None else None
        if thumb is None:
            # across the forearm toward his front (body frame +Z)
            hp = _synth_hand_body(out, wr, el, side)
        else:
            hp = _synth_hand(out, wr, el, side, thumb)
        for j, v in hp.items():
            out[:, j] = out[:, j] * (1 - w[:, None]) + v * w[:, None]
    log('  arm keys: fused keyed points replaced in %d frames (%d of them from two views); keyed blade in %d frames'
        % (int((B.key_relax.max(1) > 0).sum()), int((two > 0).sum()), int((bw > 0).sum())))
    return out


def _synth_hand_body(b, wr, el, side):
    fo = b[:, wr] - b[:, el]
    fo /= np.maximum(np.linalg.norm(fo, axis=1, keepdims=True), 1e-9)
    s = np.cross(np.array([0, 1.0, 0]), fo) * (1 if side == 'L' else -1)
    s += np.array([0, 0, 0.5])
    return _synth_hand(b, wr, el, side, s)
