"""Pose tracking with the cache. The heavy part of the pipeline: run it under the shared lock.

Per frame we keep the pose landmarker's 33 landmarks twice:
  l2  (33, 4): image x, y in FULL-FRAME pixels, the tool's relative depth z, visibility
  w   (33, 3): the tool's metric 3D ("world") landmarks, hip-centred, camera axes (x right, y down, z away)
and the crop box it ran on. The crop follows him: each frame is cropped round the last frame's landmarks
(a square 1.8x his size), so he fills the tool's input; a miss retries on the whole frame.

Cache: <WORK>/cache/<film>/s<second>.npz, one file per second of video, merged on write. A frame is
tracked once; `forget` drops a span (after changing how a take is cropped)."""
import os, time
import numpy as np
from PIL import Image
from . import cfg

_lm = None


def _landmarker():
    global _lm
    if _lm is None:
        import mediapipe as mp  # noqa
        from mediapipe.tasks import python as mpp
        from mediapipe.tasks.python import vision
        opt = vision.PoseLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path=cfg.MODEL),
                                           running_mode=vision.RunningMode.IMAGE, num_poses=1,
                                           min_pose_detection_confidence=0.3, min_pose_presence_confidence=0.3)
        _lm = vision.PoseLandmarker.create_from_options(opt)
    return _lm


def _cache_path(film, sec):
    return os.path.join(cfg.workdir('cache', film), 's%04d.npz' % sec)


def load_cache(film, t0, t1):
    """dict time -> (box, l2, w, ok) for every cached frame in [t0, t1]"""
    out = {}
    for sec in range(int(np.floor(t0)), int(np.floor(t1)) + 1):
        p = _cache_path(film, sec)
        if not os.path.exists(p):
            continue
        z = np.load(p)
        for k, t in enumerate(z['t']):
            if t0 - 1e-4 <= t <= t1 + 1e-4:
                out[round(float(t), 3)] = (z['box'][k], z['l2'][k], z['w'][k], bool(z['ok'][k]))
    return out


def _save(film, rows):
    by = {}
    for t, v in rows.items():
        by.setdefault(int(np.floor(t)), {})[t] = v
    for sec, add in by.items():
        p = _cache_path(film, sec)
        cur = {}
        if os.path.exists(p):
            z = np.load(p)
            for k, t in enumerate(z['t']):
                cur[round(float(t), 3)] = (z['box'][k], z['l2'][k], z['w'][k], bool(z['ok'][k]))
        cur.update(add)
        ts = sorted(cur)
        np.savez_compressed(p, t=np.array(ts), box=np.array([cur[t][0] for t in ts], np.float32),
                            l2=np.array([cur[t][1] for t in ts], np.float32),
                            w=np.array([cur[t][2] for t in ts], np.float32),
                            ok=np.array([cur[t][3] for t in ts], bool))


def forget(film, t0, t1):
    for sec in range(int(np.floor(t0)), int(np.floor(t1)) + 1):
        p = _cache_path(film, sec)
        if not os.path.exists(p):
            continue
        z = dict(np.load(p))
        keep = (z['t'] < t0 - 1e-4) | (z['t'] > t1 + 1e-4)
        np.savez_compressed(p, **{k: v[keep] for k, v in z.items()})


def _detect(im, box):
    """run the tool on the crop `box` (x, y, side) of the PIL image; landmarks back in frame pixels"""
    import mediapipe as mp
    x, y, s = box
    crop = im.crop((int(x), int(y), int(x + s), int(y + s))).resize((512, 512), Image.BILINEAR)
    r = _landmarker().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(crop)))
    if not r.pose_landmarks:
        return None
    p = r.pose_landmarks[0]
    sc = int(s) / 512.0
    l2 = np.array([[int(x) + a.x * 512 * sc, int(y) + a.y * 512 * sc, a.z, a.visibility] for a in p], np.float32)
    w = np.array([[a.x, a.y, a.z] for a in r.pose_world_landmarks[0]], np.float32)
    return l2, w


def _box_round(l2, W, H, grow=1.8, lo=160):
    v = l2[:, 3] > 0.3
    pts = l2[v if v.sum() > 8 else slice(None), :2]
    x0, y0 = pts.min(0)
    x1, y1 = pts.max(0)
    s = max(lo, min(max(x1 - x0, y1 - y0) * grow, H))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return np.array([cx - s / 2, cy - s / 2, s], np.float32)


def track_span(film, t0, t1, box0=None, budget=420.0, log=print):
    """Track every untracked frame of [t0, t1] in time order. box0: (x, y, w, h) as 0-1 fractions of the
    frame round him at t0 (else the whole frame). Stops after `budget` seconds (saving what it did);
    returns the number of frames still untracked."""
    ts, fs = cfg.frames_in(film, t0, t1)
    have = load_cache(film, t0, t1)
    todo = [(t, f) for t, f in zip(ts, fs) if round(t, 3) not in have]
    if not todo:
        return 0
    start = time.time()
    rows = {}
    prev = None
    # seed the crop from the nearest tracked frame before the first missing one
    before = [t for t in have if t < todo[0][0] and have[t][3]]
    if before:
        tb = max(before)
        if todo[0][0] - tb < 0.2:
            prev = have[tb][1]
    W = H = None
    done = 0
    last_t = None
    for t, f in todo:
        if time.time() - start > budget:
            break
        im = Image.open(f).convert('RGB')
        W, H = im.size
        if last_t is not None and t - last_t > 0.2:
            prev = None
        if prev is not None:
            box = _box_round(prev, W, H)
        elif box0 is not None:
            bx, by, bw, bh = box0
            s = max(bw * W, bh * H) * 1.15
            box = np.array([(bx + bw / 2) * W - s / 2, (by + bh / 2) * H - s / 2, s], np.float32)
        else:
            box = None
        res = _detect(im, box) if box is not None else None
        # a follow crop can latch onto a phantom (a statue, the building) when he moves fast: a size jump
        # or a jump away from his last place sends it back to the whole frame, keeping the nearer answer
        if res is not None and prev is not None:
            def tor(l):
                return np.linalg.norm((l[11, :2] + l[12, :2]) / 2 - (l[23, :2] + l[24, :2]) / 2) + 1e-3
            ratio = tor(res[0]) / tor(prev)
            jump = np.linalg.norm(res[0][[11, 12, 23, 24], :2].mean(0) - prev[[11, 12, 23, 24], :2].mean(0)) / tor(prev)
            # a zoom keeps him where he was (size changes, centre stays): only a size change WITH a jump
            # away, or a big jump, is a phantom
            if (ratio > 1.6 or ratio < 0.6) and jump > 0.8 or jump > 1.5:
                # search round where he was (a wide square, not the whole frame: a statue or a dome far
                # from him can look more like a person than he does mid-blur)
                pb = _box_round(prev, W, H)
                side = min(pb[2] * 2.2, W)
                cx, cy = pb[0] + pb[2] / 2, pb[1] + pb[2] / 2
                wide = np.array([cx - side / 2, cy - side / 2, side], np.float32)
                alt = _detect(im, wide)
                if alt is not None:
                    b2 = _box_round(alt[0], W, H)
                    alt = _detect(im, b2) or alt
                    r2 = tor(alt[0]) / tor(prev)
                    if abs(np.log(r2)) < abs(np.log(ratio)):
                        res, box = alt, b2
                # still a phantom: record a miss (it is interpolated later) and keep following his last place
                r3 = tor(res[0]) / tor(prev)
                j3 = np.linalg.norm(res[0][[11, 12, 23, 24], :2].mean(0) - prev[[11, 12, 23, 24], :2].mean(0)) / tor(prev)
                if (r3 > 1.8 or r3 < 0.5) and j3 > 0.8:
                    rows[round(t, 3)] = (np.array([0, 0, 0, 0], np.float32), np.zeros((33, 4), np.float32),
                                         np.zeros((33, 3), np.float32), False)
                    last_t = t
                    done += 1
                    continue
        if res is None:
            # whole frame (padded square), then a crop round that result
            full = np.array([0, (H - W) / 2, W], np.float32)
            res = _detect(im, full)
            if res is not None:
                box = _box_round(res[0], W, H)
                res2 = _detect(im, box)
                res = res2 or res
        if res is None:
            rows[round(t, 3)] = (np.array([0, 0, 0, 0], np.float32), np.zeros((33, 4), np.float32),
                                 np.zeros((33, 3), np.float32), False)
            prev = None
        else:
            rows[round(t, 3)] = (np.array([box[0], box[1], box[2], box[2]], np.float32), res[0], res[1], True)
            prev = res[0]
        last_t = t
        done += 1
        if done % 200 == 0:
            _save(film, rows)
            rows = {}
            log('  %s %.2f: %d / %d frames, %.0f s' % (film, t, done, len(todo), time.time() - start))
    _save(film, rows)
    left = len(todo) - done
    log('tracked %s %.2f-%.2f: %d frames in %.0f s (%.2f s/frame), %d left' %
        (film, t0, t1, done, time.time() - start, (time.time() - start) / max(done, 1), left))
    return left
