"""Retargeting: landmarks in his body frame -> our skeleton, BY BONE DIRECTION (our bone lengths, the
reference's angles), then the hips' height, foot contact, root travel and cleaning.

Every joint's rotation (in the root's frame) is the rotation that takes its rest axes onto the measured
ones (skel.frame_q): a primary axis matched exactly (the bone) and a secondary one as near as it can
(the hinge of an elbow or knee, the hip line, the palm ...):

  hips   hip line (his left)  + the torso's up            spine  halfway between hips and chest
  chest  shoulder line         + the torso's up            neck   halfway between chest and head
  head   ears / eye corners    + nose forward (with a neutral pitch correction)
  upper arm / forearm   the bone + the elbow's hinge (upper x fore; held from the last bent frame while
                        the arm is straight)            hand  wrist -> index/pinky + the thumb side
  thigh / shin          the bone + the knee's hinge (held, or from the foot while straight)
  foot                  heel -> toe + the knee's hinge  toe   rest (the tool does not see it)
Clavicles stay at rest (a shrug is not measured)."""
import numpy as np
from . import skel
from .skel import JI, J, HDIM

X = np.array([1.0, 0, 0])
Y = np.array([0, 1.0, 0])
Z = np.array([0, 0, 1.0])


def _n(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def _mid(b, i, j):
    return (b[:, i] + b[:, j]) / 2


def smooth_time(x, sig, loop=False):
    """Gaussian smoothing along axis 0 with a per-frame sigma (frames) array or scalar"""
    n = len(x)
    sig = np.broadcast_to(np.asarray(sig, float), (n,))
    flat = x.reshape(n, -1)
    out = np.empty_like(flat)
    for i in range(n):
        s = max(sig[i], 1e-3)
        r = int(np.ceil(3 * s))
        k = np.arange(i - r, i + r + 1)
        w = np.exp(-0.5 * ((k - i) / s) ** 2)
        if loop:
            k = k % n
        else:
            ok = (k >= 0) & (k < n)
            k, w = k[ok], w[ok]
        out[i] = (w[:, None] * flat[k]).sum(0) / w.sum()
    return out.reshape(x.shape)


def adaptive_sigma(b, slow=2.5, fast=0.7, v_fast=4.0, fps=60.0, loop=False):
    """per-frame smoothing width: wide when he is still, narrow when limbs move fast (keeps the snap)"""
    v = np.linalg.norm(np.gradient(b[:, [15, 16, 27, 28, 13, 14]], axis=0), axis=2).max(1) * fps
    v = smooth_time(v[:, None], 3.0, loop)[:, 0]
    k = np.clip(v / v_fast, 0, 1)
    return slow + (fast - slow) * k


def _held_hinge(h_raw, bend, default, lo=12.0, hi=30.0):
    """a hinge axis that is only trusted while the joint is bent: straight frames take the nearest bent
    frame's axis (forward and backward passes averaged), or the default"""
    n = len(h_raw)
    h_raw = h_raw.copy()
    # a hinge flips over when the tool reads a near-straight joint as bent the impossible way: while the
    # bend is small, keep the axis on the side of the last frame's
    for i in range(1, n):
        if h_raw[i] @ h_raw[i - 1] < 0 and np.degrees(bend[i]) < 45:
            h_raw[i] = -h_raw[i]
    w = np.clip((np.degrees(bend) - lo) / (hi - lo), 0, 1)[:, None]
    fw = np.zeros_like(h_raw)
    bw = np.zeros_like(h_raw)
    cur = default[0]
    for i in range(n):
        cur = _n(w[i] * h_raw[i] + (1 - w[i]) * (cur if i else default[i]))
        cur = _n(w[i] * h_raw[i] + (1 - w[i]) * (0.85 * cur + 0.15 * default[i]))
        fw[i] = cur
    cur = default[-1]
    for i in range(n - 1, -1, -1):
        cur = _n(w[i] * h_raw[i] + (1 - w[i]) * (0.85 * cur + 0.15 * default[i]))
        bw[i] = cur
    return _n(fw + bw)


def _bend(a, b):
    return np.arccos(np.clip(np.sum(_n(a) * _n(b), -1), -1, 1))


def _line(v, max_yaw):
    """a left-right line (hips, shoulders) with its turn about the vertical kept within +-max_yaw degrees of
    his left and median-filtered over 5 frames: from the side its depth is the tool's guess and flips"""
    yaw = np.degrees(np.arctan2(-v[:, 2], v[:, 0]))
    n = len(yaw)
    med = np.array([np.median(yaw[max(0, i - 2):i + 3]) for i in range(n)])
    med = np.clip(med, -max_yaw, max_yaw)
    # a turn of more than 40 degrees in one frame is the tool losing the line's depth: hold, then ease
    for i in range(1, n):
        if abs(med[i] - med[i - 1]) > 40:
            med[i] = med[i - 1] + np.sign(med[i] - med[i - 1]) * 40
    h = np.hypot(v[:, 0], v[:, 2])
    out = np.stack([np.cos(np.radians(med)) * h, v[:, 1], -np.sin(np.radians(med)) * h], 1)
    return _n(out)


HEAD_PITCH0 = np.radians(12.0)  # the tool's nose sits below the ears' line on a level head


def _line_tumble(v):
    """a left-right line through a tumble: no clamp (he turns upside down), but kept continuous: a frame
    whose line points against the last one's had its sides swapped by the tool"""
    v = _n(v.copy())
    for i in range(1, len(v)):
        if v[i] @ v[i - 1] < 0:
            v[i] = -v[i]
    return _n(smooth_time(v, 1.5))


def world_rotations(b, blade=None, tumble=False, clip=None, bladeL=None, relax=None):
    """b (n,33,3) body-frame landmarks -> world rotations (n,J,4) in the root's frame.
    blade (n,3) optional: the sword's direction (unit) in the body frame; sets the right hand's roll.
    relax (n,2) optional (spec "arm_keys"): how much each hand (L, R) is in a keyed span, where its tracked
    hand points mean nothing: a free hand there relaxes along the forearm."""
    n = len(b)
    R = np.zeros((n, J, 4))
    R[:, 0] = skel.qident((n,))
    up_t = _n(_mid(b, 11, 12) - _mid(b, 23, 24))
    if tumble:
        hipL = _line_tumble(b[:, 23] - b[:, 24])
        shL = _line_tumble(b[:, 11] - b[:, 12])
    else:
        hipL = _line(b[:, 23] - b[:, 24], 70)
        shL = _line(b[:, 11] - b[:, 12], 110)
    R[:, JI['hips']] = skel.frame_q(X, Y, hipL, up_t)
    R[:, JI['chest']] = skel.frame_q(X, Y, shL, up_t)
    R[:, JI['spine']] = skel.qslerp(R[:, JI['hips']], R[:, JI['chest']], 0.5)
    # head: across from the ears and the eye corners, forward from the nose
    hx = _n(_n(b[:, 7] - b[:, 8]) + _n(b[:, 3] - b[:, 6]))
    hc = (b[:, 7] + b[:, 8] + b[:, 3] + b[:, 6]) / 4
    hf = _n(b[:, 0] - hc)
    hq = skel.frame_q(X, Z, hx, hf)
    hq = skel.qmul(hq, skel.qaxis(X, np.full(n, -HEAD_PITCH0)))
    # keep the head within a sane range of the chest (the ponytail and the helmet confuse it)
    R[:, JI['head']] = hq
    R[:, JI['neck']] = skel.qslerp(R[:, JI['chest']], hq, 0.5)
    for s, k in (('L', 1), ('R', -1)):
        R[:, JI['clav' + s]] = R[:, JI['chest']]
        sh, el, wr = (11, 13, 15) if s == 'L' else (12, 14, 16)
        pk, ix, th = (17, 19, 21) if s == 'L' else (18, 20, 22)
        up = b[:, el] - b[:, sh]
        fo = b[:, wr] - b[:, el]
        rest_dir = k * X
        rest_h = np.cross(rest_dir, Z)
        if clip is not None and clip.get('hinge', 'held') == 'transport':
            # spec "hinge": "transport" (default "held"): through a near-straight elbow the hinge is
            # carried along the upper arm's turn from both sides and the roll spread over the straight frames
            # (the held hinge's two directions averaged to a 70-degree roll of the arm in one frame: charge2)
            from .bonekeys import hinge_path
            h = hinge_path(_n(np.cross(up, fo)), _bend(up, fo), _n(up), _n(np.cross(up, Z)))
        else:
            h = _held_hinge(_n(np.cross(up, fo)), _bend(up, fo), _n(np.cross(up, Z)))
        R[:, JI['upperArm' + s]] = skel.frame_q(rest_dir, rest_h, up, h)
        R[:, JI['foreArm' + s]] = skel.frame_q(rest_dir, rest_h, fo, h)
        fing = _mid(b, pk, ix) - b[:, wr]
        thumb = b[:, ix] - b[:, pk]
        if s == 'L' and bladeL is not None:
            # a second sword in the left fist: the same rule as the right
            R[:, JI['hand' + s]] = skel.frame_q(Z, rest_dir, bladeL, _n(fo))
        elif s == 'R' and blade is not None:
            # the blade leaves the fist along the hand's +Z (the thumb side); the hand's long axis stays as
            # near the forearm as the blade allows
            sec = _n(fo)
            if relax is not None:
                # spec "arm_keys": where the keyed blade runs nearly along the forearm the hand's roll is
                # undefined: hold the last frame's (no 90-degree flip in one frame)
                sec = sec.copy()
                for i in range(1, n):
                    p_ = sec[i] - blade[i] * (blade[i] @ sec[i])
                    if np.linalg.norm(p_) < 0.45:
                        q_ = sec[i - 1] - blade[i] * (blade[i] @ sec[i - 1])
                        sec[i] = q_ / max(np.linalg.norm(q_), 1e-9)
            R[:, JI['hand' + s]] = skel.frame_q(Z, rest_dir, blade, sec)
            if clip is not None and clip.get('roll_dps', 1000.0):
                # the hand's roll about the blade continuous (a blade that crosses the forearm's line flipped
                # the hand 60-178 degrees in one frame); only steps over the limit are touched
                from .bonekeys import roll_continuity
                R[:, JI['hand' + s]] = roll_continuity(R[:, JI['hand' + s]], float(clip.get('roll_dps', 1000.0)) / clip.get('fps', 30))
        elif clip is not None and clip.get('free_hand'):
            R[:, JI['hand' + s]] = free_hand(b, s, R[:, JI['foreArm' + s]], clip['free_hand'])
        else:
            # the tool's hand points are rough: lean the hand's axis toward the forearm
            fing = _n(_n(fing) + 0.6 * _n(fo))
            R[:, JI['hand' + s]] = skel.frame_q(rest_dir, Z, fing, thumb)
        held = (s == 'L' and bladeL is not None) or (s == 'R' and blade is not None)
        if relax is not None and not held and (relax[:, 0 if s == 'L' else 1] > 0).any():
            rw = relax[:, 0 if s == 'L' else 1]
            flex = skel.qaxis(Z, np.full(n, -k * np.radians(12.0)))
            relaxed = skel.qmul(R[:, JI['foreArm' + s]], flex)
            R[:, JI['hand' + s]] = skel.qslerp(skel.continuous(R[:, JI['hand' + s]]), relaxed, rw)
        R[:, JI['weapon' + s]] = R[:, JI['hand' + s]]
    for s in ('L', 'R'):
        hp, kn, an, he, to = (23, 25, 27, 29, 31) if s == 'L' else (24, 26, 28, 30, 32)
        th_ = b[:, kn] - b[:, hp]
        sh_ = b[:, an] - b[:, kn]
        ff = _n(b[:, to] - b[:, he])
        h = _held_hinge(_n(np.cross(th_, sh_)), _bend(th_, sh_), _n(np.cross(th_, -ff)), lo=6.0, hi=20.0)
        R[:, JI['thigh' + s]] = skel.frame_q(-Y, X, th_, h)
        R[:, JI['shin' + s]] = skel.frame_q(-Y, X, sh_, h)
        R[:, JI['foot' + s]] = skel.frame_q(Z, X, ff, h)
        R[:, JI['toe' + s]] = R[:, JI['foot' + s]]
    return R


def free_hand(b, s, Rfore, opt=True):
    """spec "free_hand": a free hand from the tool's hand points WHERE THEY ARE PLAUSIBLE, else a relaxed hand
    that follows the forearm. Per frame the measured palm (wrist -> index / pinky = the fingers, index -
    pinky = the thumb side) counts by a confidence: the hand's length in the tool's 3D near a real hand's
    (0.06-0.16 m), the fingers within 75 degrees of the forearm, the thumb side not along the fingers;
    the confidence is smoothed, the measured and the relaxed rotations are blended by it, and the result
    is smoothed (`{"sigma": 2.0, "flex": 12}`: frames, and the relaxed wrist's bend in degrees)"""
    opt = opt if isinstance(opt, dict) else {}
    sh, el, wr = (11, 13, 15) if s == 'L' else (12, 14, 16)
    pk, ix = (17, 19) if s == 'L' else (18, 20)
    k = 1 if s == 'L' else -1
    fo = _n(b[:, wr] - b[:, el])
    fing_raw = _mid(b, pk, ix) - b[:, wr]
    ln = np.linalg.norm(fing_raw, axis=1)
    fing = _n(fing_raw)
    thumb = b[:, ix] - b[:, pk]
    c1 = np.clip(1 - np.abs(ln - 0.1) / 0.06, 0, 1)
    c2 = np.clip((np.sum(fing * fo, 1) - np.cos(np.radians(75))) / 0.3, 0, 1)
    c3 = np.clip(1 - np.abs(np.sum(_n(thumb) * fing, 1)) / 0.7, 0, 1)
    conf = smooth_time((c1 * c2 * c3)[:, None], 3.0)[:, 0]
    meas = skel.frame_q(k * X, Z, _n(fing + 0.25 * fo), thumb)
    flex = skel.qaxis(Z, np.full(len(b), -k * np.radians(float(opt.get('flex', 12)))))
    relaxed = skel.qmul(Rfore, flex)
    out = skel.qslerp(relaxed, skel.continuous(meas), conf)
    out = skel.qnorm(smooth_time(skel.continuous(out), float(opt.get('sigma', 2.0))))
    return out


# ---------- ground, contact, root ----------

def foot_points(P):
    """lowest points of each foot (n, 2): the heel's bottom (ankle - HDIM.ankle) and the ball (toe joint)"""
    out = []
    for s in ('L', 'R'):
        a = P[:, JI['foot' + s], 1] - HDIM['ankle']
        t = P[:, JI['toe' + s], 1]
        out.append(np.minimum(a, t))
    return np.stack(out, 1)


BODY_R = {'hips': 0.12, 'spine': 0.12, 'chest': 0.13, 'neck': 0.08, 'head': 0.11, 'upperArmL': 0.06,
          'upperArmR': 0.06, 'foreArmL': 0.05, 'foreArmR': 0.05, 'handL': 0.04, 'handR': 0.04,
          'shinL': 0.06, 'shinR': 0.06}


def body_low(P):
    """the lowest point of the whole body (for tumbles: the back or a shoulder can be on the ground)"""
    v = [P[:, JI[k], 1] - r for k, r in BODY_R.items()]
    return np.min(np.stack(v, 1), 1)


def _spans(mask, min_len=3, fill=2):
    m = mask.copy()
    n = len(m)
    # fill short holes
    i = 0
    while i < n:
        if not m[i]:
            j = i
            while j < n and not m[j]:
                j += 1
            if 0 < i and j < n and j - i <= fill:
                m[i:j] = True
            i = j
        else:
            i += 1
    spans = []
    i = 0
    while i < n:
        if m[i]:
            j = i
            while j < n and m[j]:
                j += 1
            if j - i >= min_len:
                spans.append([i, j - 1])
            i = j
        else:
            i += 1
    out = np.zeros(n, bool)
    for a, b in spans:
        out[a:b + 1] = True
    return out, spans


def ground_and_contact(q, fps, loop=False, ground='feet', travel='free', log=print, clip_opts={}, yaw=None, air=None,
                       v_given=None):
    """From local rotations (hips at the origin): the hips' height, foot contact and the root travel.
    Returns hipsY (n,), hips_xz (n,2) (hips over the root), root (n,3), contact {L: spans, R: spans}, speed."""
    n = len(q)
    zero = np.zeros((n, 3))
    rootyaw = np.zeros((n, 3))
    if yaw is not None:
        rootyaw[:, 2] = yaw  # feet in a fixed frame while he turns
    P, _ = skel.fk(q, zero, rootyaw)
    g = foot_points(P)  # (n, 2) foot bottoms with the hips at height 0
    lowest = g.min(1)
    if ground == 'body':
        lowest = np.minimum(lowest, body_low(P))
    # feet relative to the hips, horizontal (x, z)
    F = np.stack([P[:, JI['footL'], [0, 2]], P[:, JI['footR'], [0, 2]]], 1)  # (n, 2, 2)
    def deriv(x):
        if loop:
            return (np.roll(x, -1, 0) - np.roll(x, 1, 0)) / 2 * fps
        return np.gradient(x, axis=0) * fps
    vF = np.stack([deriv(F[:, 0]), deriv(F[:, 1])], 1)  # (n, 2, 2) foot velocity relative to the hips, m/s
    # each foot's own floor: its low envelope over the clip (the two feet's heights differ a little from
    # the pelvis' measured roll, so a foot is compared with itself, not with the other foot)
    lowf = np.percentile(g, 15, axis=0)
    if loop:
        # a loop travels at one velocity: a planted foot moves at exactly minus that relative to the hips.
        # The stance velocity is the commonest one (a planted foot moves steadily; a swinging one does
        # not): the densest point of all the feet's velocity samples, then the mean round it.
        smp = vF.reshape(-1, 2)
        sp_ = np.linalg.norm(smp, axis=1)
        rad = 0.12 + 0.12 * np.median(sp_)
        dens = np.array([(np.linalg.norm(smp - c, axis=1) < rad).sum() + 1e-3 * np.linalg.norm(c) for c in smp])
        m = smp[np.argmax(dens)]
        for _ in range(3):
            m = smp[np.linalg.norm(smp - m, axis=1) < rad].mean(0)
        # planted = from the foot's most forward point along the travel (the strike) to its most backward
        # one (the push-off): the stance of a gait cycle, symmetric by construction and robust to the
        # tool's wobbly foot speeds. A loop that hardly travels (an idle) uses the height only.
        # the direction a planted foot moves (backward under him): the mean velocity of the feet while low
        lowmask = (g - lowf) < 0.03
        mlow = vF[lowmask].mean(0) if lowmask.any() else m
        if np.linalg.norm(mlow) > 0.3:
            m = mlow / np.linalg.norm(mlow) * max(np.linalg.norm(m), np.linalg.norm(mlow))
        if v_given is not None:
            # spec "speed": the travel is given (m/s, his frame x, z): a planted foot moves at minus it
            m = -np.asarray(v_given, float)
        sp0 = max(np.linalg.norm(m), 1e-6)
        d = m / sp0
        contact = np.zeros((n, 2), bool)
        if sp0 > 0.3:
            for f in (0, 1):
                z = -(F[:, f] * d).sum(1)  # forward position along the travel
                z = smooth_time(z[:, None], 1.0, True)[:, 0]
                a0, b0 = int(np.argmax(z)), int(np.argmin(z))
                k = a0
                while True:
                    contact[k, f] = True
                    if k == b0:
                        break
                    k = (k + 1) % n
            # stance speed from the stance: the forward range covered while planted
            # the middle 60 % of each stance, where a planted foot moves steadily under him
            vs = []
            for f in (0, 1):
                idx = np.where(contact[:, f])[0]
                z = -(F[:, f] * d).sum(1)
                a0 = int(np.argmax(smooth_time(z[:, None], 1.0, True)[:, 0]))
                order = np.array(sorted(idx, key=lambda k: (k - a0) % n))
                L = len(order)
                mid = order[int(0.2 * L):max(int(0.8 * L), int(0.2 * L) + 1)]
                vs += list((vF[mid, f] * d).sum(1))
            v_st = float(np.median(vs))
            if v_given is None:
                m = d * v_st
            # ... and only while the foot is down (a run's stance is short: the rest is flight)
            contact &= (g - lowf) < float(clip_opts.get('contact_h', 0.04))
        else:
            contact = (g - lowf) < 0.03
            m = np.zeros(2)
        vel = np.broadcast_to(-m / fps, (n, 2)).copy()
    else:
        # a one-shot: start from "the lower foot is planted", then planted = low and still over the ground
        contact = (g - g.min(1, keepdims=True)) < 0.03
        for it in range(3):
            vel = np.zeros((n, 2))
            for i in range(n):
                ds = [-vF[i, f] / fps for f in (0, 1) if contact[i, f]]
                vel[i] = np.mean(ds, 0) if ds else (vel[i - 1] if i else 0)
            vroot = smooth_time(vel, 2.0) * fps
            vg = np.linalg.norm(vF + vroot[:, None], axis=2)
            sp = np.linalg.norm(vroot, axis=1)
            tol = 0.25 + 0.3 * sp
            newc = (((g - lowf) < 0.05) | ((g - g.min(1, keepdims=True)) < 0.02)) & (vg < tol[:, None])
            if ground != 'body':
                none = ~newc.any(1)
                k = np.argmin(g[none], 1)
                newc[np.where(none)[0], k] = vg[np.where(none)[0], k] < 2 * tol[none]
            contact = newc
        if air is not None:
            # spec "air_marks": the clip's `air` / `land` events are hard marks: no foot is planted from
            # `air` to `land` - 1; outside, the lower foot is planted wherever no foot is
            f0, f1 = air
            contact[f0:f1] = False
            for a_, b_ in ((0, f0), (f1, n)):  # on the ground before and after the flight
                for i in range(a_, b_):
                    if not contact[i].any():
                        contact[i, int(np.argmin(g[i]))] = True
    # the hips' travel: integrate the planted feet (their mean step), coast through flight
    vel_i = np.zeros((n, 2))
    for i in range(n):
        ds = [-vF[i, f] / fps for f in (0, 1) if contact[i, f]]
        vel_i[i] = np.mean(ds, 0) if ds else (vel_i[i - 1] if i else vel[0])
    if loop:
        vel_i = vel  # constant: the loop's speed; the hips' sway is the residual below
    H = np.cumsum(vel_i, 0) - vel_i[0]
    cs = {}
    cmask = np.zeros((n, 2), bool)
    for f, s in enumerate(('L', 'R')):
        cm, sp = _spans(contact[:, f], fill=4 if loop else 2)
        cmask[:, f] = cm
        cs[s] = sp
    # hips height: a planted foot's bottom on the ground
    hy = np.full(n, np.nan)
    for i in range(n):
        if cmask[i].any():
            hy[i] = -min(g[i, f] for f in (0, 1) if cmask[i, f])
        if ground == 'body' and not (air is not None and air[0] <= i < air[1]):
            # (with "air_marks" the flight takes the arc below; only the no-penetration guard applies)
            hy[i] = -lowest[i] if np.isnan(hy[i]) else max(hy[i], -lowest[i])
    ok = ~np.isnan(hy)
    if ok.sum() == 0:
        hy[:] = -lowest
    elif not ok.all():
        idx = np.arange(n)
        if loop:
            ii = np.concatenate([idx[ok] - n, idx[ok], idx[ok] + n])
            vv = np.concatenate([hy[ok]] * 3)
            hy = np.interp(idx, ii, vv)
        else:
            hy = np.interp(idx, idx[ok], hy[ok])
        # a flight phase rises on a ballistic arc
        i = 0
        while i < n:
            if not ok[i]:
                j = i
                while j < n and not ok[j]:
                    j += 1
                T = (j - i + 1) / fps
                tt = (np.arange(i, j) - i + 1) / fps
                pk = clip_opts.get('air_peak_m') if air is not None and i <= air[0] + 2 and j >= air[1] - 2 else None
                if pk is not None:
                    # spec "air_peak_m": a parabola whose top is that far above the take-off hips
                    u = tt / T
                    base = hy[i:j].copy()
                    top = hy[max(i - 1, 0)] + float(pk)
                    A = top - base[int(np.argmax(u * (1 - u)))]
                    hy[i:j] = base + 4 * A * u * (1 - u)
                else:
                    hy[i:j] += 0.5 * 9.8 * tt * (T - tt)
                i = j
            else:
                i += 1
    hy = smooth_time(hy[:, None], 1.5, loop)[:, 0]
    # never a foot (or, for tumbles, the body) below the ground
    hy = np.maximum(hy, -lowest)
    # root travel
    if loop:
        T = n / fps
        v = -m.copy()
        total = v * T
        if travel == 'forward':
            v = np.array([0.0, np.linalg.norm(v) * np.sign(v[1] if abs(v[1]) > 1e-6 else 1)])
        elif isinstance(travel, (int, float)) and not isinstance(travel, bool):
            # a direction in degrees (0 forward, 90 his left, -90 his right, 180 backward): strafes
            a = np.radians(float(travel))
            v = np.linalg.norm(v) * np.array([np.sin(a), np.cos(a)])
        t = np.arange(n) / fps
        root_xz = t[:, None] * v[None]
        # the hips sway over the planted feet: the hips' position against the root follows the planted
        # foot's measured spot (a small periodic wobble); kept at zero mean
        hips_xz = np.zeros((n, 2))
        speed = float(np.linalg.norm(v))
    else:
        # spec "root": {"smooth": s, "max_off": m}: the root is the ground point under his hips smoothed
        # over s seconds (default 0.25), and never more than m metres from it (default: no limit)
        ro = clip_opts.get('root', {}) if isinstance(clip_opts.get('root'), dict) else {}
        root_xz = smooth_time(H, float(ro.get('smooth', 0.25)) * fps, False)
        if ro.get('max_off') is not None:
            mo = float(ro['max_off'])
            for _ in range(3):
                d = H - root_xz
                ln = np.linalg.norm(d, axis=1, keepdims=True)
                root_xz = root_xz + d * np.clip(1 - mo / np.maximum(ln, 1e-9), 0, None)
                root_xz = smooth_time(root_xz, 2.0, False)
        root_xz -= root_xz[0]
        off = H - H[0] - root_xz  # hips over the root, fixed frame -> the root's own (turning) frame
        if yaw is not None:
            c, s_ = np.cos(-yaw), np.sin(-yaw)
            hips_xz = np.stack([c * off[:, 0] + s_ * off[:, 1], -s_ * off[:, 0] + c * off[:, 1]], 1)
        else:
            hips_xz = off
        speed = None
    root = np.zeros((n, 3))
    root[:, 0] = root_xz[:, 0]
    root[:, 1] = root_xz[:, 1]
    if yaw is not None:
        root[:, 2] = yaw
    return dict(hipsY=hy, hips_xz=hips_xz, root=root, contact=cs, cmask=cmask, speed=speed, g=g)


# ---------- foot cleaning: two-bone IK onto the planted spot ----------

def _two_bone(a, b_len, c_len, target, hinge):
    """hip position a, lengths, ankle target, the knee hinge axis -> thigh and shin directions"""
    d = target - a
    L = np.linalg.norm(d)
    L = np.clip(L, abs(b_len - c_len) + 1e-4, b_len + c_len - 1e-4)
    dn = d / np.linalg.norm(d)
    cosA = (b_len ** 2 + L ** 2 - c_len ** 2) / (2 * b_len * L)
    A = np.arccos(np.clip(cosA, -1, 1))
    # bend in the plane perpendicular to the hinge: the knee goes forward of the hip->ankle line
    fwd = np.cross(hinge, dn)
    fwd /= max(np.linalg.norm(fwd), 1e-9)
    thigh = np.cos(A) * dn - np.sin(A) * fwd
    knee = a + thigh * b_len
    shin = (a + dn * L - knee)
    shin /= np.linalg.norm(shin)
    return thigh, shin


def _span_lists(m, loop):
    """contact spans of a mask as lists of frame indices; a loop's span that runs over the end continues
    at frame 0 (returned with a flag per index: 1 = the next cycle)"""
    n = len(m)
    out = []
    i = 0
    while i < n:
        if not m[i]:
            i += 1
            continue
        j = i
        while j < n and m[j]:
            j += 1
        out.append([(k, 0) for k in range(i, j)])
        i = j
    if loop and len(out) > 1 and m[0] and m[-1]:
        first = out.pop(0)
        out[-1] += [(k, 1) for k, _ in first]
    return out


def soft_reach(hip, target, lo=0.9, span=0.07):
    """the target pulled in softly past lo of the leg's length (at most lo + span): no knee snapping straight"""
    Lmax = HDIM['thigh'] + HDIM['shin']
    dv = target - hip
    L = np.linalg.norm(dv)
    u = L / Lmax
    if u <= lo:
        return target
    return hip + dv / L * Lmax * (lo + span * np.tanh((u - lo) / span))


def pin_feet(q, hips, root, cmask, blend=3, loop=False, flat=None, soft=False):
    """Make planted feet stand still: within each contact span the ankle is held at its mean ground
    position (each frame keeps its own height: a heel may rise) by re-solving thigh + shin; the edges blend
    over `blend` frames. A loop's span that runs over the end is one span (the next cycle is one cycle's
    travel further on). Returns new q and the worst slide before / after (cm)."""
    n = len(q)
    q = q.copy()
    P, R = skel.fk(q, hips, root)
    cyc = np.zeros(3)
    if loop:
        cyc[[0, 2]] = (root[-1, :2] - root[0, :2]) * n / max(n - 1, 1)
    before, after = [], []
    jobs = []
    for f, s in enumerate(('L', 'R')):
        for span in _span_lists(cmask[:, f], loop):
            idx = np.array([k for k, _ in span])
            wrap = np.array([w for _, w in span])
            an = P[idx, JI['foot' + s]] + wrap[:, None] * cyc
            before.append(np.linalg.norm(an[:, [0, 2]] - an[:, [0, 2]].mean(0), axis=1).max() * 100)
            tgt = an.mean(0)
            # the frames to touch: the span plus `blend` frames either side (wrapping in a loop)
            ext = []
            for e in range(1, blend + 1):
                ext.append((idx[0] - e, wrap[0], 1 - e / (blend + 1)))
                ext.append((idx[-1] + e, wrap[-1], 1 - e / (blend + 1)))
            frames = [(k, w, 1.0) for k, w in zip(idx, wrap)] + ext
            jobs.append((s, tgt, frames))
    done = {}
    for s, tgt, frames in jobs:
        for k, w, wgt in frames:
            if loop:
                w = w + (1 if k >= n else 0) - (1 if k < 0 else 0)
                k = k % n
            elif k < 0 or k >= n:
                continue
            key = (s, k)
            if key in done and done[key] >= wgt:
                continue
            done[key] = wgt
            cur = P[k, JI['foot' + s]]
            t_here = tgt - w * cyc  # the target in this frame's cycle
            target = cur.copy()
            target[[0, 2]] = cur[[0, 2]] * (1 - wgt) + t_here[[0, 2]] * wgt
            if flat is not None:
                # a flat planted foot: its ankle exactly HDIM.ankle above the ground
                fw = flat[k, 0 if s == 'L' else 1] * wgt
                target[1] = cur[1] * (1 - fw) + HDIM['ankle'] * fw
            hip = P[k, JI['thigh' + s]]
            hinge = skel.qrot(R[k, JI['thigh' + s]], X)
            if soft and wgt < 1:  # spec "speed" with a scaled stride: the blend into a plant reaches softly
                target = soft_reach(hip, target)
            thigh, shin = _two_bone(hip, HDIM['thigh'], HDIM['shin'], target, hinge)
            Rt = skel.frame_q(-Y, X, thigh[None], hinge[None])[0]
            Rs = skel.frame_q(-Y, X, shin[None], hinge[None])[0]
            Rf = R[k, JI['foot' + s]]
            q[k, JI['thigh' + s]] = skel.qmul(skel.qconj(R[k, JI['hips']]), Rt)
            q[k, JI['shin' + s]] = skel.qmul(skel.qconj(Rt), Rs)
            q[k, JI['foot' + s]] = skel.qmul(skel.qconj(Rs), Rf)
    P2, _ = skel.fk(q, hips, root)
    for f, s in enumerate(('L', 'R')):
        for span in _span_lists(cmask[:, f], loop):
            idx = np.array([k for k, _ in span])
            wrap = np.array([w for _, w in span])
            an = P2[idx, JI['foot' + s]] + wrap[:, None] * cyc
            after.append(np.linalg.norm(an[:, [0, 2]] - an[:, [0, 2]].mean(0), axis=1).max() * 100)
    return q, (max(before) if before else 0), (max(after) if after else 0)


def scale_stride(q, k, d):
    """a loop's stride scaled by k (spec "speed" / "stride"): each ankle's excursion along the travel d (his
    frame x, z; unit) about its own cycle mean is multiplied by k, its height and sideways place kept, and
    thigh + shin re-solved by two-bone IK on the knee's own hinge (the foot keeps its world rotation). A
    target out of the leg's reach is clamped to it. Returns new q and the reach shortfall (cm, worst)"""
    n = len(q)
    q = q.copy()
    zero = np.zeros((n, 3))
    P, R = skel.fk(q, zero, zero)
    d3 = np.array([d[0], 0.0, d[1]])
    short = 0.0
    for s in ('L', 'R'):
        an = P[:, JI['foot' + s]]
        a = an @ d3
        tgt = an + np.outer((k - 1) * (a - a.mean()), d3)
        Lmax = HDIM['thigh'] + HDIM['shin']
        for i in range(n):
            hip = P[i, JI['thigh' + s]]
            dv = tgt[i] - hip
            L = np.linalg.norm(dv)
            short = max(short, (L - Lmax) * 100)
            tgt[i] = soft_reach(hip, tgt[i])  # at most 0.97 of the leg: no knee snapping straight
            hinge = skel.qrot(R[i, JI['thigh' + s]], X)
            thigh, shin = _two_bone(hip, HDIM['thigh'], HDIM['shin'], tgt[i], hinge)
            Rt = skel.frame_q(-Y, X, thigh[None], hinge[None])[0]
            Rs = skel.frame_q(-Y, X, shin[None], hinge[None])[0]
            q[i, JI['thigh' + s]] = skel.qmul(skel.qconj(R[i, JI['hips']]), Rt)
            q[i, JI['shin' + s]] = skel.qmul(skel.qconj(Rt), Rs)
            q[i, JI['foot' + s]] = skel.qmul(skel.qconj(Rs), R[i, JI['foot' + s]])
    return skel.continuous(q), max(short, 0.0)


def limit_joint(q, j, max_deg, sig=0.0, loop=False):
    """clamp a joint's local rotation to max_deg away from rest, then smooth it (the tool's heel / toe /
    hand points are the least reliable: an ankle that flips 40 degrees in one frame is the tool, not him)"""
    qj = skel.continuous(q[:, j].copy())
    qj = np.where(qj[:, 3:4] < 0, -qj, qj)
    ang = 2 * np.arccos(np.clip(qj[:, 3], -1, 1))
    lim = np.radians(max_deg)
    k = np.where(ang > lim, lim / np.maximum(ang, 1e-9), 1.0)
    ax = qj[:, :3] / np.maximum(np.linalg.norm(qj[:, :3], axis=1, keepdims=True), 1e-9)
    na = ang * k
    qj = np.concatenate([ax * np.sin(na / 2)[:, None], np.cos(na / 2)[:, None]], 1)
    if sig > 0:
        qj = skel.qnorm(smooth_time(skel.continuous(qj), sig, loop))
    q[:, j] = qj
    return q
