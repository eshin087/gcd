"""Our skeleton in Python: a port of src/entities/hero2/skeleton.js, with HDIM read from dims.js so a
change of the build flows into the tools. Axes are the game's: +Z his front, +Y up, +X his LEFT.
Quaternions are x y z w, numpy arrays with the 4 on the last axis."""
import os, re
import numpy as np
from . import cfg

JOINTS = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'upperArmL', 'foreArmL', 'handL',
          'clavR', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR',
          'footR', 'toeR', 'weaponR', 'weaponL']
J = len(JOINTS)
JI = {n: i for i, n in enumerate(JOINTS)}
_PN = dict(hips='root', spine='hips', chest='spine', neck='chest', head='neck', clavL='chest', upperArmL='clavL',
           foreArmL='upperArmL', handL='foreArmL', clavR='chest', upperArmR='clavR', foreArmR='upperArmR',
           handR='foreArmR', thighL='hips', shinL='thighL', footL='shinL', toeL='footL', thighR='hips',
           shinR='thighR', footR='shinR', toeR='footR', weaponR='handR', weaponL='handL')
PARENT = [-1 if n == 'root' else JI[_PN[n]] for n in JOINTS]


def read_hdim(path=None):
    """HDIM from dims.js (plain `name: number,` lines)."""
    path = path or os.path.join(cfg.REPO, 'src', 'entities', 'hero2', 'dims.js')
    src = open(path, encoding='utf-8').read()
    body = src[src.index('HDIM'):]
    body = body[body.index('{') + 1: body.index('};')]
    d = {}
    for m in re.finditer(r'^\s*(\w+)\s*:\s*(-?[\d.]+(?:e-?\d+)?)', body, re.M):
        d[m.group(1)] = float(m.group(2))
    return d


HDIM = read_hdim()


def rest_offsets(d=None):
    d = d or HDIM
    o = np.zeros((J, 3))

    def s(n, x, y, z):
        o[JI[n]] = (x, y, z)
    s('hips', 0, d['hipsY'], 0)
    s('spine', 0, d['spine'], 0)
    s('chest', 0, d['chest'], 0)
    s('neck', 0, d['neck'], 0)
    s('head', 0, d['head'], 0)
    for side, k in (('L', 1), ('R', -1)):
        s('clav' + side, k * d['clavIn'], d['clavUp'], 0)
        s('upperArm' + side, k * d['clav'], 0, 0)
        s('foreArm' + side, k * d['upperArm'], 0, 0)
        s('hand' + side, k * d['foreArm'], 0, 0)
        s('weapon' + side, k * d['palm'], 0, 0)
        s('thigh' + side, k * d['hipHalf'], -d['hipDrop'], 0)
        s('shin' + side, 0, -d['thigh'], 0)
        s('foot' + side, 0, -d['shin'], 0)
        s('toe' + side, 0, -d['ankle'], d['foot'])
    return o


REST = rest_offsets()


# ---------- quaternions (vectorised; shape (..., 4), x y z w) ----------

def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0)
    bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by,
                     aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw,
                     aw * bw - ax * bx - ay * by - az * bz], -1)


def qconj(a):
    return a * np.array([-1, -1, -1, 1.0])


def qrot(q, v):
    """rotate vectors v (..., 3) by q (..., 4)"""
    u = q[..., :3]
    w = q[..., 3:4]
    t = 2 * np.cross(u, v)
    return v + w * t + np.cross(u, t)


def qnorm(q):
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def qident(shape=()):
    q = np.zeros(tuple(shape) + (4,))
    q[..., 3] = 1
    return q


def qaxis(axis, ang):
    axis = np.asarray(axis, float)
    ang = np.asarray(ang, float)
    s = np.sin(ang / 2)[..., None]
    return np.concatenate([axis * s, np.cos(ang / 2)[..., None]], -1)


def qslerp(a, b, t):
    """slerp, t scalar or (...,) broadcastable"""
    t = np.asarray(t, float)[..., None] if np.ndim(t) else float(t)
    d = np.sum(a * b, -1, keepdims=True)
    b = np.where(d < 0, -b, b)
    d = np.abs(d)
    th = np.arccos(np.clip(d, -1, 1))
    s = np.sin(th)
    small = s < 1e-6
    wa = np.where(small, 1 - t, np.sin((1 - t) * th) / np.where(small, 1, s))
    wb = np.where(small, t, np.sin(t * th) / np.where(small, 1, s))
    return qnorm(wa * a + wb * b)


def mat_to_q(m):
    """rotation matrices (..., 3, 3) -> quaternions (..., 4)"""
    m = np.asarray(m, float)
    sh = m.shape[:-2]
    m = m.reshape(-1, 3, 3)
    q = np.zeros((len(m), 4))
    for i, r in enumerate(m):
        tr = r[0, 0] + r[1, 1] + r[2, 2]
        if tr > 0:
            s = np.sqrt(tr + 1) * 2
            q[i] = [(r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s, s / 4]
        elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
            s = np.sqrt(1 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
            q[i] = [s / 4, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s, (r[2, 1] - r[1, 2]) / s]
        elif r[1, 1] > r[2, 2]:
            s = np.sqrt(1 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
            q[i] = [(r[0, 1] + r[1, 0]) / s, s / 4, (r[1, 2] + r[2, 1]) / s, (r[0, 2] - r[2, 0]) / s]
        else:
            s = np.sqrt(1 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
            q[i] = [(r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, s / 4, (r[1, 0] - r[0, 1]) / s]
    return qnorm(q).reshape(sh + (4,))


def q_to_mat(q):
    x, y, z, w = np.moveaxis(q, -1, 0)
    return np.stack([np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], -1),
                     np.stack([2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], -1),
                     np.stack([2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)], -1)], -2)


def frame_q(a_rest, b_rest, a_now, b_now):
    """The rotation that takes the rest axes (a_rest primary, b_rest secondary) onto the measured ones
    (a_now exactly, b_now as near as it can while staying perpendicular). Vectorised over frames."""
    def basis(a, b):
        a = a / np.linalg.norm(a, axis=-1, keepdims=True)
        c = np.cross(a, b)
        c = c / np.maximum(np.linalg.norm(c, axis=-1, keepdims=True), 1e-9)
        b2 = np.cross(c, a)
        return np.stack([a, b2, c], -1)  # columns
    A = basis(np.broadcast_to(a_rest, np.shape(a_now)), np.broadcast_to(b_rest, np.shape(a_now)))
    B = basis(a_now, b_now)
    return mat_to_q(B @ np.swapaxes(A, -1, -2))


def continuous(q):
    """flip signs so each frame is in the same hemisphere as the last (q: (n, ..., 4))"""
    q = q.copy()
    for i in range(1, len(q)):
        d = np.sum(q[i] * q[i - 1], -1, keepdims=True)
        q[i] = np.where(d < 0, -q[i], q[i])
    return q


# ---------- forward kinematics ----------

def fk(q, hips, root=None, rest=REST):
    """q: (n, J, 4) local rotations, hips: (n, 3), root: (n, 3) [x, z, yaw] or None.
    Returns world positions (n, J, 3) and world rotations (n, J, 4), as solveFK does."""
    n = len(q)
    P = np.zeros((n, J, 3))
    R = np.zeros((n, J, 4))
    if root is None:
        root = np.zeros((n, 3))
    R[:, 0] = qaxis([0, 1, 0], root[:, 2])
    P[:, 0, 0] = root[:, 0]
    P[:, 0, 2] = root[:, 1]
    for i in range(1, J):
        p = PARENT[i]
        off = hips if i == 1 else np.broadcast_to(rest[i], (n, 3))
        P[:, i] = P[:, p] + qrot(R[:, p], off)
        R[:, i] = qmul(R[:, p], q[:, i])
    return P, R


def world_to_local(Rw):
    """world rotations (n, J, 4) -> local (n, J, 4); Rw[:, 0] is the root's."""
    q = np.zeros_like(Rw)
    q[:, 0] = qident((len(Rw),))
    for i in range(1, J):
        q[:, i] = qmul(qconj(Rw[:, PARENT[i]]), Rw[:, i])
    return qnorm(q)
