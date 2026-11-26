"""Second-stage steps of a clip (after fusion): his facing as the root's yaw, flat planted feet with the
toes bending on push-off, the hips' height from flat feet, the clavicles, a synthesized breath for holds,
the hips' height in the air from a fixed side camera, and the per-frame step check."""
import numpy as np
from . import skel, cfg
from .skel import JI, J, HDIM
from .retarget import smooth_time, _n

X = np.array([1.0, 0, 0])
Y = np.array([0, 1.0, 0])
Z = np.array([0, 0, 1.0])


# ---------- 1. facing -> root yaw ----------

def facing_yaw(b, fps, sigma_s=0.12):
    """his facing per frame (rad, about +Y, 0 = the clip's +Z) from the fused landmarks: the hip and
    shoulder lines, the feet (heel -> toe) and the nose, unwrapped and smoothed"""
    from .takes import facing
    f1, feet, nose = facing(b)
    v = 2.0 * f1 + 1.0 * feet + 0.7 * nose
    yaw = np.unwrap(np.arctan2(v[:, 0], v[:, 2]))
    yaw = smooth_time(yaw[:, None], sigma_s * fps)[:, 0]
    return yaw - yaw[0]


def rotate_y(b, yaw):
    """rotate every frame's points by -yaw about +Y (into the frame that faces with him)"""
    c, s = np.cos(-yaw), np.sin(-yaw)
    out = b.copy()
    x, z = b[..., 0], b[..., 2]
    out[..., 0] = c[:, None] * x + s[:, None] * z
    out[..., 2] = -s[:, None] * x + c[:, None] * z
    return out


# ---------- 7. flat planted feet, toes, hips height ----------

def _level(Rf):
    """the foot's rotation with its sole level: keep where it points (yaw), drop its pitch and roll"""
    fwd = skel.qrot(Rf, np.broadcast_to(Z, Rf.shape[:-1] + (3,)))
    fwd = fwd * np.array([1, 0, 1.0])
    yaw = np.arctan2(fwd[..., 0], fwd[..., 2])
    return skel.qaxis(Y, yaw)


def flatten_feet(q, hips, root, cmask, loop=False, flat_part=0.7):
    """Within each contact span the foot's sole is level (heel down); when the foot leaves the ground after
    the span, the heel rises over the span's last (1 - flat_part) to the measured pitch at push-off while
    the toes stay flat on the ground (the toe joint bends against the foot). The weights are eased over
    the span's edges (no snap at heel strike or toe-off). Returns q and the flat weight (n, 2)."""
    from .retarget import _span_lists
    q = q.copy()
    n = len(q)
    P, R = skel.fk(q, hips, root)
    W = np.zeros((n, 2))   # foot level weight
    WT = np.zeros((n, 2))  # toe flat weight (push-off)
    for f, s in enumerate(('L', 'R')):
        for span in _span_lists(cmask[:, f], loop):
            L = len(span)
            last = span[-1][0]
            lifts = (loop and L < n) or (not loop and last < n - 1)  # the foot leaves the ground after it
            for j, (k, _) in enumerate(span):
                u = j / max(L - 1, 1)
                if lifts and u > flat_part:
                    w = max(0.0, 1 - (u - flat_part) / (1 - flat_part))
                else:
                    w = 1.0
                W[k, f] = max(W[k, f], w)
                WT[k, f] = max(WT[k, f], 1.0 if (lifts and u > flat_part) else 0.0)
    # ease the weights over the edges (2 frames)
    W = smooth_time(W, 1.2, loop)
    WT = smooth_time(WT, 1.2, loop)
    for f, s in enumerate(('L', 'R')):
        fi, ti, si = JI['foot' + s], JI['toe' + s], JI['shin' + s]
        lev = _level(R[:, fi])
        for k in range(n):
            w = W[k, f]
            if w <= 1e-3 and WT[k, f] <= 1e-3:
                continue
            Rf = skel.qslerp(R[k, fi], lev[k], w)
            q[k, fi] = skel.qmul(skel.qconj(R[k, si]), Rf)
            # toes flat on the ground while the heel is up
            tl = skel.qmul(skel.qconj(Rf), lev[k])
            q[k, ti] = skel.qslerp(q[k, ti], tl, WT[k, f])
    return skel.continuous(q), W


def hips_from_flat(q, hips, root, cmask, W, lowest_body=None):
    """the hips' height so a planted foot's sole is on the ground: a flat planted foot puts its ankle at
    exactly HDIM.ankle; a heel-up foot puts its ball (toe joint) on the ground"""
    h0 = hips.copy()
    h0[:, 1] = 0
    P, _ = skel.fk(q, h0, root)
    n = len(q)
    hy = hips[:, 1].copy()
    for i in range(n):
        c = []
        for f, s in enumerate(('L', 'R')):
            if not cmask[i, f]:
                continue
            a = P[i, JI['foot' + s], 1] - HDIM['ankle']
            t = P[i, JI['toe' + s], 1]
            c.append(min(a, t) if W[i, f] < 0.999 else a)
        if c:
            hy[i] = -min(c)
    # never a foot through the ground
    low = np.minimum(P[:, JI['footL'], 1] - HDIM['ankle'], P[:, JI['toeL'], 1])
    low = np.minimum(low, np.minimum(P[:, JI['footR'], 1] - HDIM['ankle'], P[:, JI['toeR'], 1]))
    if lowest_body is not None:
        low = np.minimum(low, lowest_body)
    hy = np.maximum(hy, -low)
    out = hips.copy()
    out[:, 1] = hy
    return out


# ---------- 6. clavicles ----------

def clavicles(q, k=0.3, loop=False):
    """a shrug / reach: each clavicle takes `k` of its upper arm's lift above the horizontal and of its
    swing forward, about the chest's axes (a rule from the upper arm's direction; the tool has no
    clavicle point). The upper arm is counter-rotated so the arm's direction is unchanged."""
    q = q.copy()
    n = len(q)
    for s, sg in (('L', 1), ('R', -1)):
        ci, ui = JI['clav' + s], JI['upperArm' + s]
        rest = np.array([sg, 0, 0.0])
        d = skel.qrot(q[:, ui], np.broadcast_to(rest, (n, 3)))  # the upper arm's direction in the clavicle's frame
        lift = np.arcsin(np.clip(d[:, 1], -1, 1))
        fwd = np.arcsin(np.clip(d[:, 2], -1, 1))
        lift = np.clip(lift, 0, None) * k  # shrug only when the arm goes up
        fwd = np.clip(fwd, -0.3, None) * k
        # lift: about the forward axis (sign by side); reach: about +Y
        rl = skel.qaxis(Z, sg * lift)
        rf = skel.qaxis(Y, -sg * fwd)
        rc = skel.qmul(rf, rl)
        q[:, ci] = skel.qmul(q[:, ci], rc)
        q[:, ui] = skel.qmul(skel.qconj(rc), q[:, ui])
    return skel.continuous(q)


# ---------- 9. breath ----------

def breathe(q, fps, period=3.6, chest_deg=1.2, shoulder_deg=1.0):
    """SYNTHESIZED (not measured): a slow breath for a held pose: the chest lifts (pitches back a little)
    and both clavicles rise, one cycle over the clip (the clip's length should be a whole number of
    periods; build.py sets n from the period)."""
    q = q.copy()
    n = len(q)
    ph = np.sin(2 * np.pi * np.arange(n) / n * max(1, round(n / fps / period)))
    q[:, JI['chest']] = skel.qmul(q[:, JI['chest']], skel.qaxis(X, -np.radians(chest_deg) * ph))
    q[:, JI['neck']] = skel.qmul(q[:, JI['neck']], skel.qaxis(X, np.radians(chest_deg) * ph * 0.8))
    for s, sg in (('L', 1), ('R', -1)):
        r = skel.qaxis(Z, sg * np.radians(shoulder_deg) * ph)
        q[:, JI['clav' + s]] = skel.qmul(q[:, JI['clav' + s]], r)
        q[:, JI['upperArm' + s]] = skel.qmul(skel.qconj(r), q[:, JI['upperArm' + s]])
    return skel.continuous(q)


# ---------- 3. airborne: the hips' height from a fixed side camera ----------

def air_height(T, idx, standing_frames):
    """the pelvis' height above the ground (m) per frame of take T (indices `idx`), from the picture: a FIXED
    camera that sees him from the side. The ground line is the lowest foot point in `standing_frames`
    (indices into T, both feet down); metres per pixel from his standing pelvis height = HDIM.hipsY."""
    l2 = T.l2
    feet = [27, 28, 29, 30, 31, 32]
    gy = np.median(l2[standing_frames][:, feet, 1].max(1))
    pel = (l2[:, 23, 1] + l2[:, 24, 1]) / 2
    stand_px = np.median(gy - pel[standing_frames])
    mpp = HDIM['hipsY'] / max(stand_px, 1)
    return (gy - pel[idx]) * mpp


# ---------- 7b. step check ----------

def worst_step(q, fps):
    d = np.abs(np.sum(q[1:] * q[:-1], -1))
    a = np.degrees(2 * np.arccos(np.clip(d, 0, 1)))
    j = int(np.argmax(a.max(0)))
    f = int(np.argmax(a[:, j]))
    return float(a.max()), skel.JOINTS[j], f + 1


def step_limit(fps):
    """the default per-frame limit: 1500 degrees a second (a wrist in a fast cut stays under it)"""
    return 1500.0 / fps


def despike(q, fps, limit=None, loop=False):
    """joints whose rotation jumps beyond the limit for a frame or two and comes back (the tool losing a
    limb) are bridged by slerp over the spike"""
    limit = limit or step_limit(fps)
    q = q.copy()
    n = len(q)
    for j in range(1, J):
        for it in range(3):
            d = np.abs(np.sum(q[1:, j] * q[:-1, j], -1))
            a = np.degrees(2 * np.arccos(np.clip(d, 0, 1)))
            bad = np.where(a > limit)[0]
            if not len(bad):
                break
            for b in bad:
                lo = max(0, b - 2)
                hi = min(n - 1, b + 4)
                for k in range(lo + 1, hi):
                    t = (k - lo) / (hi - lo)
                    q[k, j] = skel.qslerp(q[lo, j], q[hi, j], t)
    return skel.continuous(q)


# ---------- 5. two hands on one grip ----------

def two_hand(q, hips, root, fps, t_ref0=None, gap=0.11, free=(), blend=4):
    """The left fist closes on the grip just below the right (toward the pommel, `gap` m along the blade):
    the left arm is re-solved (two-bone IK, elbow kept on its measured side) and the left hand takes the
    right hand's grip turned half round the blade. `free`: (f0, f1) clip-frame spans where the footage
    shows the left hand off the grip; the arm eases out of / back into the grip over `blend` frames."""
    q = q.copy()
    n = len(q)
    w = np.ones(n)
    for f0, f1 in free:
        for k in range(n):
            if f0 <= k <= f1:
                w[k] = 0
            else:
                d = min(abs(k - f0), abs(k - f1))
                if d <= blend:
                    w[k] = min(w[k], d / (blend + 1))
    P, R = skel.fk(q, hips, root)
    flip = skel.qaxis(Z, np.pi)
    for k in range(n):
        if w[k] <= 0:
            continue
        RhR = R[k, JI['handR']]
        blade = skel.qrot(RhR, Z)
        gripR = P[k, JI['weaponR']]
        RhL = skel.qmul(RhR, flip)
        sockL = gripR - blade * gap
        wrist = sockL - skel.qrot(RhL, np.array([HDIM['palm'], 0, 0]))
        a = P[k, JI['upperArmL']]
        pole = P[k, JI['foreArmL']]
        L1, L2 = HDIM['upperArm'], HDIM['foreArm']
        d = wrist - a
        D = np.clip(np.linalg.norm(d), 1e-4, L1 + L2 - 1e-4)
        dn = d / max(np.linalg.norm(d), 1e-9)
        cosA = np.clip((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1)
        perp = (pole - a) - dn * ((pole - a) @ dn)
        perp = perp / max(np.linalg.norm(perp), 1e-9)
        elbow = a + L1 * (cosA * dn + np.sqrt(1 - cosA * cosA) * perp)
        wr = a + dn * D
        up, fo = elbow - a, wr - elbow
        h = np.cross(up, fo)
        h = h / max(np.linalg.norm(h), 1e-9)
        Ru = skel.frame_q(X, -Y, up[None], h[None])[0]
        Rf = skel.frame_q(X, -Y, fo[None], h[None])[0]
        Rp = R[k, JI['clavL']]
        new_u = skel.qmul(skel.qconj(Rp), Ru)
        new_f = skel.qmul(skel.qconj(Ru), Rf)
        new_h = skel.qmul(skel.qconj(Rf), RhL)
        for jn, val in (('upperArmL', new_u), ('foreArmL', new_f), ('handL', new_h)):
            j = JI[jn]
            q[k, j] = skel.qslerp(q[k, j], val, w[k])
    return skel.continuous(q)
