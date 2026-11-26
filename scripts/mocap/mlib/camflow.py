"""The camera's own motion, from the BACKGROUND of the picture (not from him).

The reference's follow camera swings round him during attacks, rolls and jumps. One camera direction per
take then reads the swing as his body turning (the rough attacks of round 2). Here every frame pair's
background motion is measured: corner features outside his box (the tool's landmarks, padded) tracked
from one frame to the next (pyramidal Lucas-Kanade), a similarity transform fitted with RANSAC (shift,
zoom, roll). A camera that yaws by a small angle a moves the far background sideways by about f * a
pixels (f: the focal length in pixels); one that pitches moves it up / down. Summed over a take this
gives the camera's yaw and pitch at every frame relative to the take's first frame.

  shift(film, times)  -> dx, dy (px per frame step, full-frame pixels), inlier share, zoom per frame pair
  F_PX                 the focal length used (px at 1280 x 720); calibrated by `camcal.py` (see README)

Cache: <WORK>/cache/<film>_flow/s<second>.npz, keyed by the frame's time (the shift FROM the previous
frame in the film's frame list). Light work (about 3 ms a frame)."""
import os
import numpy as np
from PIL import Image
from . import cfg, track

# horizontal focal length in pixels at 1280 wide: calibrated on the SWORD film's idle and equip chapters
# (camcal.py on six orbits round him standing, 0:02-0:21: 640-900 px, all together 769)
F_PX = float(os.environ.get("MOCAP_FPX", 760.0))
SC = 0.5  # work at half size (640 x 360)


def _gray(path):
    import cv2
    im = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    return cv2.resize(im, None, fx=SC, fy=SC, interpolation=cv2.INTER_AREA)


def _mask(shape, box_pts):
    """255 outside his box (padded), 0 on him; also the lowest band (the near floor shifts with parallax)"""
    h, w = shape
    m = np.full((h, w), 255, np.uint8)
    if box_pts is not None and len(box_pts):
        x0, y0 = box_pts.min(0) * SC
        x1, y1 = box_pts.max(0) * SC
        pw, ph = (x1 - x0) * 0.45 + 12, (y1 - y0) * 0.25 + 12
        m[max(0, int(y0 - ph)):int(y1 + ph), max(0, int(x0 - pw)):int(x1 + pw)] = 0
    m[int(h * 0.78):] = 0
    return m


def _pair(g0, g1, mask):
    import cv2
    p0 = cv2.goodFeaturesToTrack(g0, 300, 0.01, 7, mask=mask, blockSize=7)
    if p0 is None or len(p0) < 12:
        return np.nan, np.nan, 0.0, 1.0
    p1, st, _ = cv2.calcOpticalFlowPyrLK(g0, g1, p0, None, winSize=(21, 21), maxLevel=3)
    ok = st[:, 0] == 1
    if ok.sum() < 10:
        return np.nan, np.nan, 0.0, 1.0
    a, b = p0[ok, 0], p1[ok, 0]
    M, inl = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=1.5)
    if M is None:
        return np.nan, np.nan, 0.0, 1.0
    zoom = float(np.hypot(M[0, 0], M[1, 0]))
    # the shift of the picture's centre (so a zoom about the centre is not a shift)
    c = np.array([g0.shape[1] / 2, g0.shape[0] / 2])
    cc = M[:, :2] @ c + M[:, 2]
    d = (cc - c) / SC
    return float(d[0]), float(d[1]), float(inl.mean()), zoom


def _cpath(film, sec):
    return os.path.join(cfg.workdir('cache', film + '_flow'), 's%04d.npz' % sec)


def _load(film, sec):
    p = _cpath(film, sec)
    if not os.path.exists(p):
        return {}
    z = np.load(p)
    return {round(float(t), 3): tuple(v) for t, v in zip(z['t'], z['v'])}


def shift(film, t0, t1):
    """per frame of the film in [t0, t1]: (times, dx, dy, inlier share, zoom) of the background against
    the PREVIOUS frame of the film's list (the first one against its own predecessor)"""
    ts, fs = cfg.frames(film)
    import bisect
    a = max(bisect.bisect_left(ts, t0 - 1e-4), 1)
    b = bisect.bisect_right(ts, t1 + 1e-4)
    out = {}
    secs = sorted(set(int(np.floor(ts[i])) for i in range(a, b)))
    for s in secs:
        out.update(_load(film, s))
    todo = [i for i in range(a, b) if round(ts[i], 3) not in out]
    if todo:
        lm = track.load_cache(film, ts[todo[0] - 1], ts[todo[-1]])
        new = {}
        g_prev, i_prev = None, None
        for i in todo:
            g0 = g_prev if i_prev == i - 1 else _gray(fs[i - 1])
            g1 = _gray(fs[i])
            e = lm.get(round(ts[i - 1], 3))
            pts = e[1][:, :2] if e is not None and e[3] else None
            if pts is not None:
                e1 = lm.get(round(ts[i], 3))
                if e1 is not None and e1[3]:
                    pts = np.concatenate([pts, e1[1][:, :2]])
            v = _pair(g0, g1, _mask(g0.shape, pts))
            new[round(ts[i], 3)] = v
            g_prev, i_prev = g1, i
        out.update(new)
        by = {}
        for t, v in new.items():
            by.setdefault(int(np.floor(t)), {})[t] = v
        for s, add in by.items():
            cur = _load(film, s)
            cur.update(add)
            kk = sorted(cur)
            np.savez_compressed(_cpath(film, s), t=np.array(kk), v=np.array([cur[k] for k in kk], np.float64))
    tt = np.array([ts[i] for i in range(a, b)])
    v = np.array([out[round(ts[i], 3)] for i in range(a, b)], float)
    return tt, v[:, 0], v[:, 1], v[:, 2], v[:, 3]


def camera_angles(film, t0, t1, grid, f_px=None, cut_px=60.0, log=print):
    """the camera's yaw and pitch (degrees) on the take's 60 fps grid `grid`, relative to the grid's first
    frame, from the summed background shift. A pair whose shift is not found (blur, a bare floor) is
    filled from its neighbours; a jump bigger than `cut_px` (a cut inside the span) is treated as zero and
    reported. Sign: a positive yaw is the camera swinging round to HIS LEFT (+X of his body frame) as he
    faces it, i.e. the background sliding to the picture's right."""
    f = f_px or F_PX
    tt, dx, dy, inl, zoom = shift(film, t0, t1)
    bad = ~np.isfinite(dx) | (inl < 0.35)
    jump = np.isfinite(dx) & (np.hypot(np.nan_to_num(dx), np.nan_to_num(dy)) > cut_px)
    if jump.any():
        log('  ! camera: %d frame pair(s) jump more than %d px (a cut?) at %s: counted as still'
            % (jump.sum(), cut_px, ', '.join(cfg.fmt_time(t) for t in tt[jump][:4])))
    use = ~bad & ~jump
    idx = np.arange(len(tt))
    if use.sum() >= 2:
        dx = np.interp(idx, idx[use], dx[use])
        dy = np.interp(idx, idx[use], dy[use])
    else:
        dx = np.zeros(len(tt))
        dy = np.zeros(len(tt))
    dx[jump] = 0
    dy[jump] = 0
    yaw = np.degrees(np.cumsum(dx) / f)
    pitch = np.degrees(np.cumsum(dy) / f)
    gy = np.interp(grid, tt, yaw)
    gp = np.interp(grid, tt, pitch)
    return gy - gy[0], gp - gp[0], float(use.mean())


def floor_travel(T, log=print):
    """his travel ACROSS THE PICTURE against the floor at his own depth, per frame of take T (60 fps
    grid): the pelvis' picture x minus the floor's own shift (a band of floor round his feet, his box
    left out, so a camera that pans or dollies with him is taken out), in metres from his torso's picture
    length (0.49 m). Returns (n,) metres along the camera's sideways axis (+ = picture right), or None."""
    import cv2
    ts, fs = cfg.frames(T.film)
    import bisect
    n = len(T.t)
    l2 = T.l2
    tor = np.linalg.norm((l2[:, 11, :2] + l2[:, 12, :2]) / 2 - (l2[:, 23, :2] + l2[:, 24, :2]) / 2, axis=1)
    mpp = 0.49 / np.maximum(np.median(tor), 1)
    pel = (l2[:, 23, 0] + l2[:, 24, 0]) / 2
    # the floor's shift between consecutive real frames, on the take's span
    a = max(bisect.bisect_left(ts, T.t[0] - 1e-3), 1)
    b = bisect.bisect_right(ts, T.t[-1] + 1e-3)
    sh = [0.0]
    tt = [ts[a - 1]]
    g0 = _gray(fs[a - 1])
    for i in range(a, b):
        g1 = _gray(fs[i])
        k = int(np.clip(np.searchsorted(T.t, ts[i]), 0, n - 1))
        h, w = g0.shape
        m = np.zeros((h, w), np.uint8)
        fy = l2[k, [27, 28], 1].max() * SC
        H = tor[k] * SC * 3
        m[int(max(0, fy - 0.25 * H)):int(min(h, fy + 0.35 * H))] = 255
        x0, x1 = l2[k, :, 0].min() * SC, l2[k, :, 0].max() * SC
        m[:, max(0, int(x0 - 0.3 * H)):int(x1 + 0.3 * H)] = 0
        d = _pair(g0, g1, m)
        sh.append(d[0] if np.isfinite(d[0]) and d[2] > 0.3 else np.nan)
        tt.append(ts[i])
        g0 = g1
    sh = np.array(sh)
    ok = np.isfinite(sh)
    if ok.sum() < 0.5 * len(sh):
        log('  ! floor travel: the floor was not found in most frames of %s' % T.name)
        return None
    sh[~ok] = np.interp(np.where(~ok)[0], np.where(ok)[0], sh[ok])
    floor = np.interp(T.t, np.array(tt), np.cumsum(sh))
    return (pel - pel[0] - (floor - floor[0])) * mpp
