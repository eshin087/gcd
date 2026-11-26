"""One TAKE = one camera's view of one performance of a move: a time span of one shot. This module turns a
take's cached landmarks into clean, regularly sampled data in HIS frame:

  1. load the cache, drop missed frames and capture freezes, resample to a regular 60 fps grid by time
  2. fix left / right label swaps per limb pair (a constant-velocity Viterbi over {kept, swapped})
  3. find where the camera sees him from: its pitch (from his standing axis) and its yaw relative to
     his facing (hips, shoulders, feet, nose), checked against the spec's hint; a whole-body mirror
     (the tool labelling a back view as a front view) is caught here and undone
  4. rotate the 3D landmarks into his body frame (+X his left, +Y up, +Z his front) and keep, per body
     axis, how well this camera sees it (1 - the axis' share along the camera ray)

Tool landmark indices: 0 nose, 7/8 ears, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 17/18 pinkies,
19/20 index, 21/22 thumbs, 23/24 hips, 25/26 knees, 27/28 ankles, 29/30 heels, 31/32 toes
(odd = his left, even = his right)."""
import numpy as np
from PIL import Image
from . import cfg, track

FPS = 60.0
LEG_L = [23, 25, 27, 29, 31]
LEG_R = [24, 26, 28, 30, 32]
ARM_L = [11, 13, 15, 17, 19, 21]
ARM_R = [12, 14, 16, 18, 20, 22]
HEAD_L = [1, 2, 3, 7, 9]
HEAD_R = [4, 5, 6, 8, 10]
MIRROR = np.arange(33)
for a, b in zip(LEG_L + ARM_L + HEAD_L, LEG_R + ARM_R + HEAD_R):
    MIRROR[a], MIRROR[b] = b, a

# hint -> his facing yaw in the camera frame (camera frame: x image right, y up, z toward the camera).
# 'front' = he faces the camera; 'right' = he faces image-right (the camera sees his left side) ...
HINT_YAW = {'front': 0.0, 'right': 90.0, 'back': 180.0, 'left': -90.0,
            'front-right': 45.0, 'back-right': 135.0, 'back-left': -135.0, 'front-left': -45.0}


def _thumb(path):
    im = Image.open(path)
    im.draft('L', (160, 90))
    return np.asarray(im.convert('L').resize((64, 36)), np.float32)


def load(film, t0, t1, log=print):
    """Raw cached frames of a span, missed frames and capture freezes removed.
    Returns times (k,), l2 (k,33,4), w (k,33,3) and a note."""
    c = track.load_cache(film, t0, t1)
    ts_all, fs_all = cfg.frames_in(film, t0, t1)
    miss = [t for t in ts_all if round(t, 3) not in c]
    if miss:
        raise RuntimeError('%d frames of %s %.2f-%.2f are not tracked: run track.py first (under the lock)'
                           % (len(miss), film, t0, t1))
    ts = [t for t in ts_all if c[round(t, 3)][3]]
    fs = {t: f for t, f in zip(ts_all, fs_all)}
    # capture freezes: the same picture repeated while the video stalled. In a take with motion, runs of
    # near-identical frames are dropped (an idle can be this still, so only when the take moves)
    th = [_thumb(fs[t]) for t in ts]
    d = np.array([0.0] + [np.abs(th[i] - th[i - 1]).mean() for i in range(1, len(th))])
    frozen = np.zeros(len(ts), bool)
    if np.median(d) > 0.6:
        low = d < 0.15
        i = 0
        while i < len(low):
            if low[i]:
                j = i
                while j < len(low) and low[j]:
                    j += 1
                if j - i >= 3:
                    frozen[i:j] = True
                i = j
            else:
                i += 1
    # a sudden change of his size in the picture (a glitched, zoomed frame) or a bad fit: his torso's
    # length in pixels far from the take's running median
    L2 = np.array([c[round(t, 3)][1] for t in ts])
    tor = np.linalg.norm((L2[:, 11, :2] + L2[:, 12, :2]) / 2 - (L2[:, 23, :2] + L2[:, 24, :2]) / 2, axis=1)
    med = np.array([np.median(tor[max(0, k - 30):k + 31]) for k in range(len(tor))])
    odd = np.abs(tor / np.maximum(med, 1) - 1) > 0.3
    # his feet or hands out of the picture: the tool guesses them
    Hpx, Wpx = 720, 1280
    try:
        Wpx, Hpx = Image.open(fs[ts[0]]).size
    except Exception:
        pass
    ends = L2[:, [27, 28, 31, 32, 15, 16], :2]
    odd |= ((ends[..., 1] > Hpx - 2) | (ends[..., 0] < 1) | (ends[..., 0] > Wpx - 2)).any(1)
    keep = [k for k in range(len(ts)) if not frozen[k] and not odd[k]]
    note = 'frames %d, missed %d, frozen %d, odd size %d' % (len(ts_all), len(ts_all) - len(ts), int(frozen.sum()), int(odd.sum()))
    tk = np.array([ts[k] for k in keep])
    l2 = np.array([c[round(ts[k], 3)][1] for k in keep])
    w = np.array([c[round(ts[k], 3)][2] for k in keep])
    return tk, l2, w, note


def resample(tk, arr, t0, t1, fps=FPS):
    """linear resample of arr (k, ...) at times tk onto a regular grid; returns grid, values, gap (s)"""
    n = int(round((t1 - t0) * fps)) + 1
    g = t0 + np.arange(n) / fps
    flat = arr.reshape(len(arr), -1)
    out = np.stack([np.interp(g, tk, flat[:, j]) for j in range(flat.shape[1])], 1).reshape((n,) + arr.shape[1:])
    idx = np.searchsorted(tk, g)
    lo = tk[np.clip(idx - 1, 0, len(tk) - 1)]
    hi = tk[np.clip(idx, 0, len(tk) - 1)]
    gap = np.where((idx > 0) & (idx < len(tk)), hi - lo, 1.0)
    return g, out, gap


def to_cam(w):
    """the tool's world landmarks (x right, y down, z away) -> camera frame (x right, y up, z toward us)"""
    return w * np.array([1, -1, -1.0])


def fix_swaps(l2, w, groups=((LEG_L, LEG_R), (ARM_L, ARM_R)), switch_cost=0.15):
    """Per limb pair: choose kept / swapped labels per frame so the limbs move smoothly (constant velocity
    in the image, normalised by his torso size), with a small cost for disagreeing with the tool's own label.
    Returns fixed copies and the number of frames swapped per pair."""
    l2 = l2.copy()
    w = w.copy()
    n = len(l2)
    torso = np.median(np.linalg.norm((l2[:, 11, :2] + l2[:, 12, :2]) / 2 - (l2[:, 23, :2] + l2[:, 24, :2]) / 2, axis=1))
    torso = max(torso, 1.0)
    counts = []
    for A, B in groups:
        A = np.array(A)
        B = np.array(B)
        # candidate positions per frame and state: state 0 kept, 1 swapped; (n, 2, k, 2) image + 3D
        p = np.zeros((n, 2, 2 * len(A), 5))
        for s in (0, 1):
            a, b = (A, B) if s == 0 else (B, A)
            p[:, s, :len(A), :2] = l2[:, a, :2] / torso
            p[:, s, len(A):, :2] = l2[:, b, :2] / torso
            p[:, s, :len(A), 2:] = w[:, a] * 2
            p[:, s, len(A):, 2:] = w[:, b] * 2
        # 2nd-order Viterbi: state = (s_prev, s_cur)
        INF = 1e18
        cost = np.full((2, 2), INF)
        for s0 in (0, 1):
            for s1 in (0, 1):
                cost[s0, s1] = switch_cost * (s0 + s1) + np.abs(p[1, s1] - p[0, s0]).sum() * 0.2
        back = np.zeros((n, 2, 2), int)
        for t in range(2, n):
            new = np.full((2, 2), INF)
            for s1 in (0, 1):
                for s2 in (0, 1):
                    best, arg = INF, 0
                    for s0 in (0, 1):
                        pred = 2 * p[t - 1, s1] - p[t - 2, s0]
                        c = cost[s0, s1] + np.abs(p[t, s2] - pred).sum() + switch_cost * s2
                        if c < best:
                            best, arg = c, s0
                    new[s1, s2] = best
                    back[t, s1, s2] = arg
            cost = new
        s1, s2 = np.unravel_index(np.argmin(cost), cost.shape)
        states = np.zeros(n, int)
        states[-1] = s2
        if n > 1:
            states[-2] = s1
        for t in range(n - 1, 1, -1):
            s0 = back[t, states[t - 1], states[t]]
            states[t - 2] = s0
        sw = states == 1
        for a, b in zip(A, B):
            l2[sw, a], l2[sw, b] = l2[sw, b].copy(), l2[sw, a].copy()
            w[sw, a], w[sw, b] = w[sw, b].copy(), w[sw, a].copy()
        counts.append(int(sw.sum()))
    return l2, w, counts


def _mid(x, a, b):
    return (x[..., a, :] + x[..., b, :]) / 2


def facing(c):
    """per-frame facing direction (unit, camera frame, horizontal-ish) from hips, shoulders, feet and nose"""
    up = _mid(c, 11, 12) - _mid(c, 23, 24)
    up /= np.linalg.norm(up, axis=-1, keepdims=True)
    side = (c[:, 23] - c[:, 24]) + (c[:, 11] - c[:, 12])  # his left
    f1 = np.cross(side, up)  # X x Y = Z (his front)
    f1 /= np.maximum(np.linalg.norm(f1, axis=-1, keepdims=True), 1e-9)
    feet = (c[:, 31] - c[:, 29]) + (c[:, 32] - c[:, 30])
    feet -= up * np.sum(feet * up, -1, keepdims=True)
    feet /= np.maximum(np.linalg.norm(feet, axis=-1, keepdims=True), 1e-9)
    nose = c[:, 0] - _mid(c, 7, 8)
    nose -= up * np.sum(nose * up, -1, keepdims=True)
    nose /= np.maximum(np.linalg.norm(nose, axis=-1, keepdims=True), 1e-9)
    return f1, feet, nose


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def circ_median_deg(a):
    a = np.radians(a)
    m = np.arctan2(np.median(np.sin(a)), np.median(np.cos(a)))
    return np.degrees(m)


class Take:
    """A prepared take. Attributes:
      t (n,) video times on a 60 fps grid; l2 (n,33,4) image landmarks; c (n,33,3) camera-frame 3D;
      b (n,33,3) body-frame 3D (pelvis-centred); R (3,3) body -> camera rotation; yaw, pitch (deg);
      wax (3,) how well this camera sees his X / Y / Z axes; gap (n,) seconds since a real frame."""

    def __init__(self, film, t0, t1, view, name='', flip=None, pitch=None, yaw=None, log=print, calm=None):
        self.film, self.t0, self.t1, self.view, self.name = film, t0, t1, view, name
        tk, l2, w, note = load(film, t0, t1)
        self.note = note
        # mirror the whole body if the spec says the tool got this take's sides wrong
        if flip:
            l2 = l2[:, MIRROR]
            w = w[:, MIRROR] * np.array([1, 1, -1.0], np.float32)
        l2, w, counts = fix_swaps(l2, w)
        self.swaps = counts
        self.raw_t = tk
        self.t, self.l2, self.gap = resample(tk, l2, t0, t1)
        _, w, _ = resample(tk, w, t0, t1)
        self.c = to_cam(w)
        # the frames the camera's yaw / pitch are measured on: all, or (one-shots: tumbles, lunges) only
        # the calm ends of the take, `calm` seconds at each end, where he stands
        self.calm = np.ones(len(self.t), bool)
        if calm:
            k = int(calm * FPS)
            self.calm[:] = False
            self.calm[:k] = True
            self.calm[-k:] = True
        self.solve_camera(pitch, yaw, log)

    def solve_camera(self, pitch=None, yaw=None, log=print):
        c = self.c
        # pitch: his standing axis (mid-ankle -> mid-shoulder), median; it should be straight up
        ax = _mid(c, 11, 12) - _mid(c, 27, 28)
        ax /= np.linalg.norm(ax, axis=-1, keepdims=True)
        m = np.median(ax[self.calm], 0)
        self.pitch = float(np.degrees(np.arctan2(m[2], m[1]))) if pitch is None else float(pitch)
        Rp = rot_x(np.radians(self.pitch))  # tilts the camera frame so his axis is up
        cl = c @ Rp  # level camera frame: rows v -> Rp^T v
        f1, feet, nose = facing(cl[self.calm])
        yaws = []
        for f in (f1, feet, nose):
            yaws.append(np.degrees(np.arctan2(f[:, 0], f[:, 2])))
        y_body = circ_median_deg(yaws[0])
        y_feet = circ_median_deg(yaws[1])
        y_nose = circ_median_deg(yaws[2])
        self.yaw_parts = (y_body, y_feet, y_nose)
        hint = HINT_YAW.get(self.view)

        def dd(a, b):
            return abs((a - b + 180) % 360 - 180)
        # the hip / shoulder lines are good when the camera looks along his front (their depth is small)
        # and noise from the side; the feet and the nose are fair everywhere: pool them, weighted by view
        side = abs(np.sin(np.radians(circ_median_deg(np.concatenate(yaws[1:])))))
        pool = np.concatenate([yaws[1], yaws[2]] + ([yaws[0]] * 2 if side < 0.7 else []))
        y = circ_median_deg(pool)
        if hint is not None and dd(y, hint) > 120 and not getattr(self, '_flipped', False):
            # the tool read a back view as a front view (or the reverse): labels and depth mirrored
            log('  ! take %s: measured yaw %.0f vs hint %s (%.0f): the tool mirrored him; flipping depth and sides'
                % (self.name, y, self.view, hint))
            self._flipped = True
            self.mirrored = True
            self.l2 = self.l2[:, MIRROR]
            self.c = self.c[:, MIRROR] * np.array([1, 1, -1.0])
            return self.solve_camera(pitch, yaw, log)
        self.mirrored = getattr(self, '_flipped', False)
        if hint is not None and dd(y, hint) > 50:
            log('  ! take %s: measured yaw %.0f vs hint %s (%.0f): using the hint' % (self.name, y, self.view, hint))
            y = hint
        if yaw is not None:
            y = float(yaw)
        self.yaw = y
        # body -> camera: R = Rp * Ry(yaw); a body vector v is v_cam = R v
        self.R = Rp @ rot_y(np.radians(y))
        pel = _mid(c, 23, 24)
        self.b = (c - pel[:, None]) @ self.R  # rows: R^T v
        depth = self.R.T @ np.array([0, 0, 1.0])  # the camera ray in his frame
        self.wax = np.clip(1 - depth ** 2, 0.02, 1)

    def summary(self):
        return ('%s %s %.2f-%.2f view %s: yaw %.0f (hips %.0f feet %.0f nose %.0f) pitch %.0f, sees X %.2f Y %.2f '
                'Z %.2f, swaps legs %d arms %d, %s%s' % (self.name, self.film, self.t0, self.t1, self.view, self.yaw,
                                                         *self.yaw_parts, self.pitch, *self.wax, *self.swaps, self.note,
                                                         ', MIRRORED by the tool' if self.mirrored else ''))
