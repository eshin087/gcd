"""Fusing the takes of one move: the same deterministic animation seen by two or three cameras.

  align   one-shots: each take's time offset against the first take, searched within +-`search` s on the
          motion both cameras see (every landmark's body-frame coordinates, weighted by how well BOTH
          cameras see that axis: the height is seen by every camera, forward only by a side camera ...)
  fold    loops: the cycle's period (autocorrelation, then refined so the folded cycles agree best), and
          every cycle of the take averaged into one clean cycle that wraps exactly
  fuse    per body axis, a weighted mean over the takes, each weighted by how well its camera sees that
          axis: a side camera gives forward / up, a front or back camera gives left-right / up
  reproject  a 3D result drawn into a take's image (weak perspective, scale and shift fitted per frame), and
          the error in % of his torso length: the likeness measure (leave one take out to test fusion)"""
import numpy as np
from .takes import FPS

LIMBS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32, 0]
ERR_PTS = [13, 14, 15, 16, 25, 26, 27, 28, 31, 32]


def _feat(b, wax, idx=LIMBS):
    return b[:, idx, :], wax


def offset_cost(A, wa, B, wb, s):
    """mean weighted squared difference between A[i] and B[i + s] over their overlap"""
    n = len(A)
    i0, i1 = max(0, -s), min(n, len(B) - s)
    if i1 - i0 < n * 0.5:
        return np.inf
    w = np.minimum(wa, wb)
    d = (A[i0:i1] - B[i0 + s:i1 + s]) ** 2 * w
    return d.sum() / ((i1 - i0) * len(LIMBS) * w.sum())


def align(ref, take, search=0.5, pad=None, fps=FPS):
    """frame offset s so take.b[i + s] matches ref.b[i]. The take was loaded `pad` seconds before its
    nominal start (default: `search` + 0.05), so s is searched round that start +- search."""
    A, wa = _feat(ref.b, ref.wax)
    B, wb = _feat(take.b, take.wax)
    p0 = int(round((search + 0.05 if pad is None else pad) * fps))
    best = (np.inf, p0)
    m = int(search * fps)
    for s in range(p0 - m, p0 + m + 1):
        c = offset_cost(A, wa, B, wb, s)
        if c < best[0]:
            best = (c, s)
    return best[1], best[0]


def period(b, wax=(1, 1, 1), lo=0.4, hi=2.5, fps=FPS):
    """the cycle period (s) of a looping take: autocorrelation of the left foot's / hand's motion
    (a left-only signal, so a single step is not mistaken for the cycle), refined by fold agreement"""
    L = [27, 31, 25, 15]
    sig = np.concatenate([b[:, L, 1] * wax[1], b[:, L, 2] * wax[2], b[:, L, 0] * wax[0]], 1)
    sig = sig - sig.mean(0)
    n = len(sig)
    lags = np.arange(int(lo * fps), min(int(hi * fps), n - 10))
    ac = np.array([np.sum(sig[:-L] * sig[L:]) / np.sqrt(np.sum(sig[:-L] ** 2) * np.sum(sig[L:] ** 2)) for L in lags])
    # the first strong peak
    pk = [i for i in range(1, len(ac) - 1) if ac[i] >= ac[i - 1] and ac[i] >= ac[i + 1] and ac[i] > 0.5 * ac.max()]
    L0 = lags[pk[0]] if pk else lags[np.argmax(ac)]
    best = (np.inf, L0 / fps)
    for T in np.linspace(L0 / fps - 4 / fps, L0 / fps + 4 / fps, 41):
        _, spread = fold(b, T, 0, 48, fps, spread=True)
        if spread < best[0]:
            best = (spread, T)
    return best[1], float(ac.max())


def fold(x, T, ph0, n, fps=FPS, spread=False):
    """average every cycle of x (k, ...) into n frames of one cycle of period T (s) starting at phase ph0 (s).
    Gaussian kernel in phase; a robust pass drops samples far from the first mean."""
    k = len(x)
    ph = (np.arange(k) / fps - ph0) / T % 1.0
    flat = x.reshape(k, -1)
    out = np.zeros((n, flat.shape[1]))
    sp = 0.0
    sig = 0.6 / n
    for i in range(n):
        d = (ph - i / n + 0.5) % 1.0 - 0.5
        wk = np.exp(-0.5 * (d / sig) ** 2)
        m = (wk[:, None] * flat).sum(0) / wk.sum()
        r = np.abs(flat - m).mean(1)
        wk2 = wk * (r < 2.5 * np.median(r[wk > 0.3]) + 1e-6)
        m = (wk2[:, None] * flat).sum(0) / max(wk2.sum(), 1e-9)
        out[i] = m
        if spread:
            sp += (wk2[:, None] * (flat - m) ** 2).sum() / max(wk2.sum(), 1e-9)
    out = out.reshape((n,) + x.shape[1:])
    return (out, sp / n) if spread else out


def circ_align(A, wa, B, wb):
    """circular frame shift s so B[(i + s) % n] matches A[i] (folded cycles of equal length)"""
    n = len(A)
    w = np.minimum(wa, wb)
    best = (np.inf, 0)
    for s in range(n):
        d = ((A[:, LIMBS] - np.roll(B, -s, 0)[:, LIMBS]) ** 2 * w).sum()
        if d < best[0]:
            best = (d, s)
    return best[1]


def fuse(parts):
    """parts: list of (b (n,33,3), wax (3,)[, valid (n,)]) already aligned. Weighted mean per body axis;
    `valid` (0..1 per frame) lowers a take where its frames were missing (interpolated over a gap)."""
    num = 0
    den = 0
    for p in parts:
        b, wax = p[0], p[1]
        w = np.asarray(wax, float)[None, None, :]
        if len(p) > 2 and p[2] is not None:
            w = w * p[2][:, None, None]
        num = num + b * w
        den = den + w
    return num / np.maximum(den, 1e-9)


def validity(gap):
    """per frame: 1 where a real frame is near, falling to 0.02 over a gap"""
    return np.clip(1.0 - (gap - 0.04) / 0.08, 0.02, 1.0)


def fit_weak(X2, l2, vis_min=0.3):
    """per frame: scale s and shift (tx, ty) so (s x + tx, -s y + ty) fits the image landmarks"""
    n = len(X2)
    S = np.zeros(n)
    T = np.zeros((n, 2))
    idx = [11, 12, 23, 24, 13, 14, 25, 26, 27, 28]
    for i in range(n):
        p = X2[i, idx] * np.array([1, -1.0])
        q = l2[i, idx, :2]
        pm, qm = p.mean(0), q.mean(0)
        pc, qc = p - pm, q - qm
        s = (pc * qc).sum() / max((pc * pc).sum(), 1e-9)
        S[i] = s
        T[i] = qm - s * pm
    return S, T


def reproject(b, take):
    """b (n,33,3) in his body frame, on take's time grid -> image points (n,33,2) and the error (% torso)"""
    cam = b @ take.R.T
    S, T = fit_weak(cam[:, :, :2], take.l2)
    img = cam[:, :, :2] * np.array([1, -1.0]) * S[:, None, None] + T[:, None]
    torso = np.linalg.norm((take.l2[:, 11, :2] + take.l2[:, 12, :2]) / 2 - (take.l2[:, 23, :2] + take.l2[:, 24, :2]) / 2, axis=1)
    e = np.linalg.norm(img[:, ERR_PTS] - take.l2[:, ERR_PTS, :2], axis=2) / torso[:, None] * 100
    return img, float(np.median(e)), float(np.percentile(e, 90))


def symmetrize(b, k=1.0):
    """a gait cycle made left-right symmetric: the average of the cycle and its mirror half a cycle on
    (his right side's motion is his left side's, half a cycle later, mirrored). k: how much (0..1).
    For unarmed gaits only (spec "symmetric": true): it hides a real asymmetry such as a held sword."""
    from .takes import MIRROR
    n = len(b)
    h = n / 2.0
    i0 = int(np.floor(h))
    a = h - i0
    sh = np.roll(b, -i0, 0) * (1 - a) + np.roll(b, -i0 - 1, 0) * a
    m = sh[:, MIRROR] * np.array([-1, 1, 1.0])
    return b * (1 - k / 2) + m * (k / 2)
