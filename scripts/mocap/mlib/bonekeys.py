"""3D BONE KEYS (spec "bone_keys"): the author types, per key frame, where his bones point, in the ROOT's frame
(+X his left, +Y up, +Z his front) or the CHEST's; the keys are splined (cubic Hermite through every key, no stop
at a key unless two equal keys are given) and REPLACE the tracked rotations of the keyed bones; every bone not
keyed stays tracked (and follows its keyed parent). The path the authors of the roll, the run's arms, the
crouches and the jumps took by hand with `pose_keys` "dir" and their own helper scripts, made first-class:

  "bone_keys": {"blend": 4, "space": "root",
    "keys": [{"t": "1:15.34",                       (or "f": frame; loops: "f" or "phase": 0..1)
              "upperArmR": [x, y, z], "foreArmR": [x, y, z], "upperArmL": .., "foreArmL": .., "handL": ..,
              "blade": [x, y, z], "flat": [x, y, z],   the sword (weaponR +Z) and its flat's normal (optional)
              "chest": {"lean": 20, "side": 0, "twist": -35},   degrees in the root frame (absent = 0):
              "hips": {"lean": 5, "twist": -20, "dx": 0, "dy": -0.12, "dz": 0.1},   lean + forward,
              "head": {...},                                    side + to his left, twist + toward his left;
              "thighL": [x, y, z], "shinL": .., "footL": .., "thighR": .., "shinR": .., "footR": ..,
              "upperArmL": {"dir": [x, y, z], "space": "chest"}   any bone in the chest's frame
             }, ...]}

Bones: a vector is the bone's direction (from its joint to the next: upperArm shoulder->elbow, foreArm
elbow->wrist, hand wrist->fingers, thigh hip->knee, shin knee->ankle, foot ankle->toe). With both bones of an
arm / leg keyed at a frame the elbow / knee hinge comes from them (cross product), else the tracked hinge is
kept. "blade" sets the right hand so the socket's +Z runs along it ("flat": the blade's flats face it; else the
hand's long axis stays near the forearm). "hips" dx / dy / dz (m) are offsets of the hips' position (in the root
frame, applied before the feet are pinned). Each channel (a bone, or one number of a dict) is splined over the
keys that give it; before its first and after its last key it eases from / to the tracked motion over "blend"
frames (a loop's channels with two or more keys wrap round the cycle instead)."""
import numpy as np
from . import cfg, skel
from .skel import JI, J

X = np.array([1.0, 0, 0])
Y = np.array([0, 1.0, 0])
Z = np.array([0, 0, 1.0])

BONES = {  # bone -> (joint, child joint, rest primary axis)
    'upperArmL': ('upperArmL', 'foreArmL', X), 'foreArmL': ('foreArmL', 'handL', X), 'handL': ('handL', 'weaponL', X),
    'upperArmR': ('upperArmR', 'foreArmR', -X), 'foreArmR': ('foreArmR', 'handR', -X), 'handR': ('handR', 'weaponR', -X),
    'thighL': ('thighL', 'shinL', -Y), 'shinL': ('shinL', 'footL', -Y), 'footL': ('footL', 'toeL', Z),
    'thighR': ('thighR', 'shinR', -Y), 'shinR': ('shinR', 'footR', -Y), 'footR': ('footR', 'toeR', Z),
}
ROTS = ('hips', 'chest', 'head')
NUMS = ('lean', 'side', 'twist', 'dx', 'dy', 'dz')


def _n(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def _frame(k, n, fps, B, loop):
    if 'f' in k:
        return int(k['f'])
    if 'phase' in k:
        return int(round(float(k['phase']) * n)) % n
    return int(round((cfg.parse_time(k['t']) - B.t_ref[0]) * fps))


def spline(fr, vals, n, loop):
    """cubic Hermite through (frame, value) keys (value arrays of one shape), evaluated at every frame 0..n-1.
    Tangents: centred differences (no stop at a key), zero where a neighbouring key is equal (a hold) and at the
    ends of a one-shot's span. Returns (n, ...) values and (n,) inside-mask (frames between the first and last
    key; all frames for a loop with two or more keys)."""
    o = np.argsort(fr, kind='stable')
    fr = np.asarray(fr, float)[o]
    V = np.asarray(vals, float)[o]
    m = len(fr)
    out = np.zeros((n,) + V.shape[1:])
    inside = np.zeros(n, bool)
    if m == 1:
        out[:] = V[0]
        inside[int(np.clip(fr[0], 0, n - 1))] = True
        return out, inside
    if loop:
        F = np.concatenate([fr[-1:] - n, fr, fr[:1] + n])
        W = np.concatenate([V[-1:], V, V[:1]])
    else:
        F, W = fr, V
    M = np.zeros_like(W)
    for i in range(len(F)):
        if 0 < i < len(F) - 1:
            if np.allclose(W[i], W[i - 1]) or np.allclose(W[i], W[i + 1]):
                continue
            M[i] = (W[i + 1] - W[i - 1]) / max(F[i + 1] - F[i - 1], 1e-9)
    for f in range(n):
        x = float(f)
        if loop:
            x = F[1] + ((x - F[1]) % n)
        elif x <= F[0]:
            out[f] = W[0]
            continue
        elif x >= F[-1]:
            out[f] = W[-1]
            continue
        i = int(np.searchsorted(F, x, side='right') - 1)
        i = min(max(i, 0), len(F) - 2)
        h = F[i + 1] - F[i]
        u = (x - F[i]) / max(h, 1e-9)
        h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
        out[f] = h00 * W[i] + h10 * h * M[i] + h01 * W[i + 1] + h11 * h * M[i + 1]
        inside[f] = True
    if not loop:
        inside[int(max(fr[0], 0)):int(min(fr[-1], n - 1)) + 1] = True
    return out, inside


def _weights(inside, n, blend, loop):
    """1 inside the keyed span, easing to 0 over `blend` frames outside it"""
    if loop and inside.all():
        return np.ones(n)
    idx = np.where(inside)[0]
    if not len(idx):
        return np.zeros(n)
    d = np.zeros(n)
    f = np.arange(n)
    d = np.where(f < idx[0], idx[0] - f, np.where(f > idx[-1], f - idx[-1], 0))
    u = np.clip(1 - d / (blend + 1), 0, 1)
    return u * u * (3 - 2 * u)


def _euler(lean, side, twist):
    """absolute rotation in the root frame: twist about +Y (outer), lean about +X, side about -Z"""
    return skel.qmul(skel.qaxis(Y, np.radians(twist)), skel.qmul(skel.qaxis(X, np.radians(lean)), skel.qaxis(-Z, np.radians(side))))


def _densify(ks, n, loop):
    """direction keys more than 45 degrees apart get points in between on the GREAT CIRCLE (a spline of the
    components alone cuts the chord: a forearm swinging back to front would point up half way)"""
    out = []
    pairs = list(zip(ks, ks[1:] + ([(ks[0][0] + n, ks[0][1])] if loop else [])))
    for (fa, a), (fb, b) in pairs:
        out.append((fa, a))
        a_, b_ = np.asarray(a), np.asarray(b)
        ang = np.degrees(np.arccos(np.clip(a_ @ b_, -1, 1)))
        m = int(ang // 45)
        if m and fb - fa > m + 1:
            om = np.radians(ang)
            for i in range(1, m + 1):
                u = i / (m + 1)
                v = (np.sin((1 - u) * om) * a_ + np.sin(u * om) * b_) / max(np.sin(om), 1e-6)
                if np.sin(om) < 1e-3:  # opposite: any great circle; through his up
                    v = _n((1 - u) * a_ + u * b_ + np.sin(np.pi * u) * Y)
                f = fa + u * (fb - fa)
                out.append((f % n if loop else f, list(_n(v))))
    if not loop:
        out.append(ks[-1])
    return out


def channels(spec_bk, n, fps, B, loop):
    """{channel: (values (n, ...), weight (n,), space)}"""
    keys = spec_bk.get('keys', [])
    blend = int(spec_bk.get('blend', 4))
    dspace = spec_bk.get('space', 'root')
    raw = {}
    for k in keys:
        f = _frame(k, n, fps, B, loop)
        for nm, v in k.items():
            if nm in ('t', 'f', 'phase', 'note'):
                continue
            if nm in ROTS:
                rot = any(c in v for c in ('lean', 'side', 'twist'))
                for c in NUMS:
                    if c in ('dx', 'dy', 'dz') and (nm != 'hips' or c not in v):
                        continue
                    if c in ('lean', 'side', 'twist') and not rot:
                        continue
                    raw.setdefault((nm + '.' + c, 'root'), []).append((f, [float(v.get(c, 0.0))]))
            elif nm in ('blade', 'flat') or nm in BONES:
                sp = dspace
                if isinstance(v, dict):
                    sp = v.get('space', dspace)
                    v = v['dir']
                raw.setdefault((nm, sp), []).append((f, list(_n(np.asarray(v, float)))))
            else:
                raise ValueError('bone_keys: unknown bone %r (bones: %s, blade, flat, %s)' % (nm, ', '.join(BONES), ', '.join(ROTS)))
    out = {}
    for (nm, sp), ks in list(raw.items()):
        if nm in BONES or nm in ('blade', 'flat'):
            raw[(nm, sp)] = _densify(sorted(ks, key=lambda k_: k_[0]), n, loop and len(ks) > 1)
    for (nm, sp), ks in raw.items():
        val, inside = spline([a for a, _ in ks], [b for _, b in ks], n, loop and len(ks) > 1)
        if nm in BONES or nm in ('blade', 'flat'):
            val = _n(val)
        out[nm] = (val, _weights(inside, n, blend, loop and len(ks) > 1), sp)
    return out


def apply(q, clip, B, fps, loop, log=print):
    """q (n, J, 4) local -> q with the keyed bones; returns (q, hips offset (n, 3) or None, blade (n, 3) or None)"""
    bk = clip.get('bone_keys')
    if not bk or not bk.get('keys'):
        return q, None, None
    n = len(q)
    ch = channels(bk, n, fps, B, loop)
    q = skel.continuous(q.copy())
    zero = np.zeros((n, 3))

    def world():
        return skel.fk(q, zero, zero)[1]

    def put(j, Rnew, w):
        """the joint's world rotation eased toward Rnew by w; its children keep their local rotations"""
        R = world()
        cur = R[:, j]
        tgt = skel.qslerp(skel.continuous(cur), Rnew, w)
        q[:, j] = skel.qnorm(skel.qmul(skel.qconj(R[:, skel.PARENT[j]]), tgt))

    # the torso: hips, chest (the spine takes half the turn between them), head (the neck half)
    for nm in ROTS:
        if not any(c.startswith(nm + '.') and c[len(nm) + 1:] in ('lean', 'side', 'twist') for c in ch):
            continue
        vals = {c: ch.get(nm + '.' + c) for c in ('lean', 'side', 'twist')}
        w = np.max([v[1] for v in vals.values() if v is not None], 0)
        e = [vals[c][0][:, 0] if vals[c] is not None else np.zeros(n) for c in ('lean', 'side', 'twist')]
        Rn = _euler(*e)
        R = world()
        if nm == 'hips':
            put(JI['hips'], Rn, w)
        else:
            par = {'chest': ('hips', 'spine', 'chest'), 'head': ('chest', 'neck', 'head')}[nm]
            base = R[:, JI[par[0]]]
            tgt = skel.qslerp(skel.continuous(R[:, JI[par[2]]]), Rn, w)
            mid = skel.qslerp(skel.continuous(R[:, JI[par[1]]]), skel.qslerp(base, tgt, 0.5), w)
            put(JI[par[1]], mid, np.ones(n))
            put(JI[par[2]], tgt, np.ones(n))
    R = world()
    chest_R = R[:, JI['chest']]

    def want(nm):
        v, w, sp = ch[nm]
        if sp == 'chest':
            v = skel.qrot(chest_R, v)
        return v, w
    # limbs, parent before child; a pair keyed together sets its hinge
    for a, b in (('upperArmL', 'foreArmL'), ('upperArmR', 'foreArmR'), ('thighL', 'shinL'), ('thighR', 'shinR')):
        arm = a.startswith('upper')
        for bone in (a, b):
            if bone not in ch:
                continue
            j, cj, prim = BONES[bone]
            v, w = want(bone)
            R = world()
            # the hinge: from the pair where both are keyed and bent, else the tracked joint's own
            sec_rest = np.cross(prim, Z) if arm else X
            hinge = skel.qrot(R[:, JI[j]], np.broadcast_to(sec_rest, (n, 3)))
            if a in ch and b in ch:
                va, _ = want(a)
                vb, _ = want(b)
                hc = np.cross(va, vb)
                bend = np.linalg.norm(hc, axis=1)
                hc = _n(hc)  # as retarget: an arm's hinge is upper x fore, a leg's thigh x shin
                k_ = np.clip((np.degrees(np.arcsin(np.clip(bend, 0, 1))) - 10) / 15, 0, 1)[:, None]
                hinge = _n(k_ * hc + (1 - k_) * hinge)
            # continuity: where the pair does not set it, the hinge follows the last frame's (projected off
            # the bone), so a straight keyed limb does not inherit a tracked hinge that flips
            hk = hinge.copy()
            setk = k_[:, 0] if a in ch and b in ch else np.zeros(n)
            bd = np.degrees(np.arcsin(np.clip(bend, 0, 1))) if a in ch and b in ch else np.zeros(n)

            def bend_deg(a_, b_, i):
                return bd[i]
            for i in range(1, n):
                if w[i] > 0 and hk[i] @ hk[i - 1] < 0 and setk[i] < 1.0 + 1e-9 and bend_deg(a, b, i) < 45:
                    hk[i] = -hk[i]  # a near-straight pair read bent the impossible way: keep the side
                if w[i] > 0 and setk[i] < 0.99:
                    pv = hk[i - 1] - v[i] * (v[i] @ hk[i - 1])
                    if np.linalg.norm(pv) > 0.2:
                        hk[i] = _n(setk[i] * hk[i] + (1 - setk[i]) * _n(pv))
            hinge = hk
            Rn = skel.frame_q(prim, sec_rest, v, hinge)
            put(JI[j], Rn, w)
    for bone in ('footL', 'footR', 'handL', 'handR'):
        if bone not in ch:
            continue
        j, cj, prim = BONES[bone]
        v, w = want(bone)
        R = world()
        cur = skel.qrot(R[:, JI[j]], np.broadcast_to(prim, (n, 3)))
        ax = np.cross(cur, v)
        ang = np.arctan2(np.linalg.norm(ax, axis=1), (cur * v).sum(1))
        dq = skel.qaxis(_n(ax), ang)
        put(JI[j], skel.qmul(dq, R[:, JI[j]]), w)
    blade = None
    if 'blade' in ch:
        v, w = want('blade')
        R = world()
        if 'flat' in ch:
            fl, _ = want('flat')
            Rn = skel.frame_q(Z, Y, v, fl)
        else:
            fo = skel.qrot(R[:, JI['foreArmR']], np.broadcast_to(-X, (n, 3)))
            # the hand's roll is undefined where the blade runs along the forearm: hold the last frame's
            sec = fo.copy()
            for i in range(1, n):
                p_ = sec[i] - v[i] * (v[i] @ sec[i])
                if np.linalg.norm(p_) < 0.45:
                    q_ = sec[i - 1] - v[i] * (v[i] @ sec[i - 1])
                    sec[i] = q_ / max(np.linalg.norm(q_), 1e-9)
            Rn = skel.frame_q(Z, -X, v, sec)
        put(JI['handR'], Rn, w)
        q[:, JI['weaponR']] = skel.qident((n,))
        blade = skel.qrot(world()[:, JI['weaponR']], np.broadcast_to(Z, (n, 3)))
    off = None
    if any(c in ch for c in ('hips.dx', 'hips.dy', 'hips.dz')):
        off = np.zeros((n, 3))
        for i, c in enumerate(('hips.dx', 'hips.dy', 'hips.dz')):
            if c in ch:
                off[:, i] = ch[c][0][:, 0] * ch[c][1]
    nk = len(bk['keys'])
    log('  bone keys: %d keys, channels %s' % (nk, ', '.join(sorted(ch))))
    return skel.continuous(q), off, blade


def keyed_mask(clip, B, fps, loop, n):
    """(n, J) bool: the joints a bone key drives at more than half weight (despike keeps them)"""
    ch = channels(clip['bone_keys'], n, fps, B, loop)
    m = np.zeros((n, J), bool)
    for nm, (_, w, _) in ch.items():
        on = w > 0.5
        base = nm.split('.')[0]
        js = []
        if base in BONES:
            js = [BONES[base][0]]
        elif base in ('blade', 'flat'):
            js = ['handR', 'weaponR']
        elif base == 'chest':
            js = ['spine', 'chest']
        elif base == 'head':
            js = ['neck', 'head']
        elif base == 'hips' and nm.split('.')[1] in ('lean', 'side', 'twist'):
            js = ['hips']
        for j in js:
            m[:, JI[j]] |= on
    return m
