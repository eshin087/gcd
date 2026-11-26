"""Building one clip from its spec entry: takes -> (fold | align) -> fuse -> retarget -> ground / contact /
root -> clean -> a Built result (saved under <WORK>/built/<set>/<clip>.npz)."""
import json, os
import numpy as np
from . import cfg, skel, takes, fuse, retarget, post, keys
from .skel import JI, J, HDIM


class Built:
    pass


def _take(spec, clip, tk, pad=0.0, log=print):
    film = tk.get('film', clip.get('film', spec.get('film')))
    t0 = cfg.parse_time(tk['t0']) - pad
    t1 = cfg.parse_time(tk['t1']) + pad
    T = takes.Take(film, t0, t1, tk.get('view'), tk.get('name', '%s@%.2f' % (tk.get('view'), t0 + pad)),
                   flip=tk.get('flip'), pitch=tk.get('pitch'), yaw=tk.get('yaw'), log=log,
                   calm=tk.get('calm', clip.get('calm', 0.35 if clip.get('kind', 'oneshot') == 'oneshot' else None)),
                   swing=tk.get('swing', clip.get('swing', False)), yaw2d=tk.get('yaw2d', clip.get('yaw2d', False)),
                   facing_prior=tk.get('facing', clip.get('facing')))
    T.spec = tk
    T.spec_yaw = tk.get('yaw')
    if tk.get('drop') or tk.get('keys'):
        keys.apply_take_keys(T, tk, log)
        T.solve_camera(tk.get('pitch'), tk.get('yaw'), lambda s: None)
    if clip.get('sword') and not clip.get('swordL') and not clip.get('grip') and not tk.get('no_arm_check'):
        from . import sword
        sword.fix_sword_arm(T, log, whole=tk.get('arm_fix', clip.get('arm_fix')) == 'whole')
    log('  take ' + T.summary())
    return T


def leave_one_out(parts, takes_, mapping):
    """re-project, onto every take, (a) the fusion of the OTHER takes and (b) each other take alone; and
    (c) the full fusion. Returns lines of numbers (median / 90th percentile error, % of torso)."""
    out = []
    for i, T in enumerate(takes_):
        others = [p for j, p in enumerate(parts) if j != i]
        if not others:
            continue
        rows = []
        bi = mapping(i)  # function: fused-cycle array (n,33,3) -> array on take i's time grid
        for j, p in enumerate(parts):
            if j == i:
                continue
            _, m, p90 = fuse.reproject(bi(p[0]), T)
            rows.append('%s alone %.1f/%.1f' % (takes_[j].name, m, p90))
        _, m, p90 = fuse.reproject(bi(fuse.fuse(others)), T)
        rows.append('fused others %.1f/%.1f' % (m, p90))
        _, m, p90 = fuse.reproject(bi(fuse.fuse(parts)), T)
        rows.append('all fused %.1f/%.1f' % (m, p90))
        _, m, p90 = fuse.reproject(bi(parts[i][0]), T)
        rows.append('itself %.1f/%.1f' % (m, p90))
        out.append('on %s: ' % T.name + ', '.join(rows))
    return out


def build_clip(spec, clip, log=print):
    kind = clip.get('kind', 'oneshot')
    fps = float(clip.get('fps', 30))
    loop = kind == 'loop'
    B = Built()
    B.name = clip['name']
    B.loop = loop
    B.fps = fps
    B.notes = []
    if kind == 'hold':
        # a held pose (an idle stance): each take's median pose, fused; the clip repeats it (`n` frames,
        # a loop). The tool's frame-to-frame noise is larger than his breathing, so none is kept.
        Ts = [_take(spec, clip, tk, log=log) for tk in clip['takes']]
        n = int(clip.get('n', 30))
        parts = [(np.repeat(np.median(T.b, 0)[None], n, 0), T.wax) for T in Ts]
        B.loop = loop = True
        B.period = n / fps
        B.shift = [0] * len(Ts)
        b = fuse.fuse(parts)

        def mapping(i):
            T = Ts[i]
            return lambda arr: np.repeat(arr[:1], len(T.t), 0)
        B.loo = leave_one_out(parts, Ts, mapping)
    elif loop:
        Ts = [_take(spec, clip, tk, log=log) for tk in clip['takes']]
        # the period: from each take, then one value for all (the animation is the same)
        pers = []
        for T in Ts:
            p, ac = fuse.period(T.b, T.wax, lo=clip.get('period_lo', 0.4), hi=clip.get('period_hi', 2.5))
            pers.append(p)
            log('  %s: period %.3f s (autocorrelation %.2f)' % (T.name, p, ac))
        P = float(clip['period']) if 'period' in clip else float(np.median(pers))
        n = int(round(P * fps))
        B.period = P
        folded = []
        for T in Ts:
            sig = retarget.adaptive_sigma(T.b, fps=takes.FPS)
            bs = retarget.smooth_time(T.b, sig * 0.5)
            folded.append(fuse.fold(bs, P, 0.0, n, takes.FPS))
        # align every fold to the first (circular), then fuse
        parts = [(folded[0], Ts[0].wax)]
        B.shift = [0]
        for T, F in zip(Ts[1:], folded[1:]):
            s = fuse.circ_align(folded[0], Ts[0].wax, F, T.wax)
            parts.append((np.roll(F, -s, 0), T.wax))
            B.shift.append(s)
        fused = fuse.fuse(parts)
        # where each clip frame sits in each take: the phase origin of take i is shift_i frames
        B.take_phase = [(T.t[0], P, s) for T, s in zip(Ts, B.shift)]

        def mapping(i):
            T = Ts[i]
            s = B.shift[i]
            ph = ((T.t - T.t[0]) / P) % 1.0  # the take's phase on its own fold
            k = ph * n  # fractional index into its fold; its fold frame f = fused frame (f - s)

            def f(arr):
                idx = (k - s) % n
                i0 = np.floor(idx).astype(int) % n
                i1 = (i0 + 1) % n
                a = (idx - np.floor(idx))[:, None, None]
                return arr[i0] * (1 - a) + arr[i1] * a
            return f
        B.loo = leave_one_out(parts, Ts, mapping)
        b = fused
        if clip.get('symmetric'):
            b = fuse.symmetrize(b, float(clip.get('symmetric')))
        sig = 1.0
        b = retarget.smooth_time(b, sig, loop=True)
    else:
        search = float(clip.get('search', 0.5))
        Ts = [_take(spec, clip, clip['takes'][0], log=log)]
        ref = Ts[0]
        parts = [(ref.b, ref.wax, fuse.validity(ref.gap))]
        B.offsets = [0]
        for tk in clip['takes'][1:]:
            T = _take(spec, clip, tk, pad=search + 0.05, log=log)
            s, cost = fuse.align(ref, T, search)
            n = len(ref.b)
            # a take may cover only part of the move (a camera cut ends it): the rest gets no weight
            idx = np.arange(n) + s
            inside = (idx >= 0) & (idx < len(T.b))
            if inside.sum() < 0.25 * n:
                log('  ! take %s: aligned offset %d leaves it too short; dropped' % (T.name, s))
                continue
            ic = np.clip(idx, 0, len(T.b) - 1)
            seg = T.b[ic]
            val = fuse.validity(T.gap[ic]) * inside
            Ts.append(T)
            parts.append((seg, T.wax, val))
            B.offsets.append(s)
            log('  %s: aligned %+.3f s from its given start (cost %.4f)' % (T.name, T.t[s] - cfg.parse_time(tk['t0']), cost))

        def mapping(i):
            T = Ts[i]
            s = B.offsets[i]
            m = len(T.t) - s if i else len(T.t)

            def f(arr):
                out = np.zeros((len(T.t),) + arr.shape[1:])
                k = np.arange(len(T.t)) - s
                k = np.clip(k, 0, len(arr) - 1)
                return arr[k]
            return f
        B.loo = leave_one_out(parts, Ts, mapping) if len(parts) > 1 else []
        fused = fuse.fuse(parts)
        sig = retarget.adaptive_sigma(fused, fps=takes.FPS)
        b = retarget.smooth_time(fused, sig)
        # decimate to the clip's rate
        step = int(round(takes.FPS / fps))
        b = b[::step]
        B.t_ref = ref.t[::step]
    for line in B.loo:
        log('  reprojection ' + line)
    B.takes = [dict(T.spec, film=T.film, name=T.name, yaw=T.yaw, pitch=T.pitch, t_lo=T.t0, t_hi=T.t1) for T in Ts]
    B.b = b
    # ---- retarget
    blade = None
    if clip.get('sword'):
        from . import sword
        blade = sword.blade_dirs(spec, clip, B, Ts, log=log)
        B.blade = blade
    B.bladeL = None
    if clip.get('swordL'):
        from . import sword
        B.bladeL = sword.blade_dirs(spec, clip, B, Ts, log=log, side='L')
    # spec "face": put the way he faces (or aims) on the clip's +Z at its start, so the game can aim the
    # clip: "start" = his facing over the first 0.2 s (hips, shoulders, feet, nose), "hit" = the blade's
    # horizontal direction at the first `hit` event (attacks: the way the cut is aimed), or a number (deg)
    face = clip.get('face')
    if face is not None and face != 'travel':
        if face == 'hit' and blade is not None and clip.get('events'):
            t0r = B.t_ref[0] if hasattr(B, 't_ref') else 0
            ev = [e for e in clip['events'] if e['name'] == 'hit'] or clip['events']
            fh = int(np.clip(round((cfg.parse_time(ev[0]['t']) - t0r) * fps), 0, len(b) - 1))
            d = blade[max(0, fh - 2):fh + 3].mean(0)
            a0 = float(np.arctan2(d[0], d[2]))
        elif isinstance(face, (int, float)) and not isinstance(face, bool):
            a0 = float(np.radians(face))
        else:
            ya = post.facing_yaw(b, fps, absolute=True)
            k = max(1, int(0.2 * fps))
            a0 = float(np.arctan2(np.sin(ya[:k]).mean(), np.cos(ya[:k]).mean()))
        rot = np.full(len(b), a0)
        B.face_rot = a0  # the sheets turn our skeleton back into the takes' cameras
        b = post.rotate_y(b, rot)
        B.b = b
        if blade is not None:
            blade = post.rotate_y(blade[:, None], rot)[:, 0]
            B.blade = blade
        if getattr(B, 'bladeL', None) is not None:
            B.bladeL = post.rotate_y(B.bladeL[:, None], rot)[:, 0]
        log('  face %s: turned %.0f degrees so the clip starts facing +Z' % (face, np.degrees(a0)))
    # his facing: the root's yaw when he turns (pivots, turns, turning in place); the body is then
    # retargeted in the frame that faces with him and his hips / spine keep their own twist on top
    yaw = None
    yaw_all = post.facing_yaw(b, fps)
    if clip.get('turn'):
        yaw = yaw_all
        if not isinstance(clip['turn'], bool):
            # the author knows the turn (a pivot is 180, a turn +-90): scale the measured curve to it
            want = np.radians(float(clip['turn']))
            if abs(yaw[-1]) > 1e-3:
                yaw = yaw * (want / yaw[-1])
        b = post.rotate_y(b, yaw)
        if blade is not None:
            blade = post.rotate_y(blade[:, None], yaw)[:, 0]
        if getattr(B, 'bladeL', None) is not None:
            B.bladeL = post.rotate_y(B.bladeL[:, None], yaw)[:, 0]
        log('  turn: he turns %.0f degrees (root yaw follows his facing)' % np.degrees(yaw[-1]))
    elif abs(np.degrees(yaw_all[-1])) > 45 and not loop:
        log('  ! he ends facing %.0f degrees from his start: set "turn": true if this is a turn' % np.degrees(yaw_all[-1]))
    Rw = retarget.world_rotations(b, blade, tumble=clip.get('ground') == 'body', clip=clip, bladeL=getattr(B, 'bladeL', None))
    q = skel.world_to_local(Rw)
    q = skel.continuous(q)
    # light quaternion smoothing (positions were smoothed already)
    q = skel.qnorm(retarget.smooth_time(q, 0.8 if fps <= 30 else 1.0, loop))
    q = skel.continuous(q)
    # the tool's least reliable joints: the ankles, the free hands, the head; limits and extra smoothing
    k = fps / 30.0
    for nm in ('footL', 'footR'):
        q = retarget.limit_joint(q, JI[nm], 55, 1.5 * k, loop)
    for nm in ('handL', 'handR'):
        held = (nm == 'handR' and blade is not None) or (nm == 'handL' and getattr(B, 'bladeL', None) is not None)
        if not held:
            q = retarget.limit_joint(q, JI[nm], 80, (0.0 if clip.get('free_hand') else 1.0) * k, loop)
    q = retarget.limit_joint(q, JI['head'], 60, 1.0 * k, loop)
    q = retarget.limit_joint(q, JI['neck'], 45, 1.0 * k, loop)
    if clip.get('clavicles', 0.3):
        q = post.clavicles(q, float(clip.get('clavicles', 0.3)), loop)
    if clip.get('despike', True):
        q = post.despike(q, fps, clip.get('qa', {}).get('maxStepDeg'), loop)
    for pk in clip.get('pose_keys', []):
        q = keys.apply_pose_key(q, pk, fps, B)
    q = skel.continuous(q)
    g = retarget.ground_and_contact(q, fps, loop, clip.get('ground', 'feet'), clip.get('travel', 'free'), log, clip, yaw)
    hips = np.zeros((len(q), 3))
    hips[:, 0] = g['hips_xz'][:, 0]
    hips[:, 1] = g['hipsY']
    hips[:, 2] = g['hips_xz'][:, 1]
    root = g['root']
    if not loop:
        root[:, :2] -= root[0, :2]
        if clip.get('flight') == 'picture' and not clip.get('turn'):
            root = flight_from_picture(B, Ts, root, g['cmask'], fps, log)
        root = root_overrides(clip, B, root, fps, log)
    # planted feet: flat soles, toes bending at push-off, the ankle at exactly HDIM.ankle
    q, Wflat = post.flatten_feet(q, hips, root, g['cmask'], loop)
    if clip.get('foot_ease'):
        # spec "foot_ease": degrees a frame (e.g. 12 at 60 fps): the feet and toes turn no faster
        q = post.ease_joints(q, ('footL', 'footR', 'toeL', 'toeR'), float(clip['foot_ease']), loop)
    lb = None
    if clip.get('ground') == 'body':
        h0 = hips.copy()
        h0[:, 1] = 0
        lb = retarget.body_low(skel.fk(q, h0, root)[0])
    hips = post.hips_from_flat(q, hips, root, g['cmask'], Wflat, lb)
    # in the air: the hips' height from a fixed side camera's picture (jumps, falls)
    if clip.get('air') and not loop:
        hips = air_hips(clip, B, Ts, hips, g['cmask'], log)
    q, before, after = retarget.pin_feet(q, hips, root, g['cmask'], loop=loop, flat=Wflat)
    q = skel.continuous(q)
    # last guard: nothing through the ground after the feet were pinned
    h0 = hips.copy()
    h0[:, 1] = 0
    Pf = skel.fk(q, h0, root)[0]
    lowf = np.minimum.reduce([Pf[:, JI['footL'], 1] - HDIM['ankle'], Pf[:, JI['toeL'], 1], Pf[:, JI['footR'], 1] - HDIM['ankle'], Pf[:, JI['toeR'], 1]])
    hips[:, 1] = np.maximum(hips[:, 1], -lowf)
    if clip.get('grip') and blade is not None:
        gr = clip['grip']
        t0r = B.t_ref[0] if hasattr(B, 't_ref') else 0
        free = [(int(round((cfg.parse_time(a) - t0r) * fps)), int(round((cfg.parse_time(b_) - t0r) * fps)))
                for a, b_ in gr.get('free', [])]
        q = post.two_hand(q, hips, root, fps, gap=float(gr.get('gap', 0.11)), free=free)
        log('  grip: the left hand on the grip %.2f m below the right%s' % (gr.get('gap', 0.11), ', off in %s' % free if free else ''))
    log('  feet: planted slide %.1f cm before cleaning, %.1f cm after; contact L %s R %s' % (before, after, g['contact']['L'], g['contact']['R']))
    if g['speed'] is not None:
        log('  speed %.2f m/s, period %.3f s, %d frames' % (g['speed'], B.period, len(q)))
        sp_px = speed_from_picture(clip, Ts, B)
        if sp_px is not None:
            log('  speed from the picture (fixed camera, his pixel height): %.2f m/s' % sp_px)
    if clip.get('breath'):
        br = clip['breath'] if isinstance(clip['breath'], dict) else {}
        q = post.breathe(q, fps, br.get('period', 3.6), br.get('chest_deg', 1.2), br.get('shoulder_deg', 1.0))
        log('  breath: SYNTHESIZED (period %.1f s), not measured' % br.get('period', 3.6))
    if clip.get('despike', True):  # again after the feet were pinned (not the legs: they hold the plants)
        q = post.despike(q, fps, clip.get('qa', {}).get('maxStepDeg'), loop,
                         skip=('thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'))
    ws, wj, wf = post.worst_step(q, fps)
    lim = clip.get('qa', {}).get('maxStepDeg', post.step_limit(fps))
    B.qa = dict(maxStepDeg=round(ws, 1), at='%s@%d' % (wj, wf), limit=round(lim, 1), reason=clip.get('qa', {}).get('reason'))
    log('  step check: worst %.1f deg (%s frame %d), limit %.1f%s' % (ws, wj, wf, lim, '' if ws <= lim else '  ** OVER **'))
    B.q, B.hips, B.root, B.contact, B.speed, B.cmask = q, hips, root, g['contact'], g['speed'], g['cmask']
    if blade is not None and not loop:
        # a hint for the marks: the blade tip's speed (our skeleton, root travel removed)
        P, R = skel.fk(q, hips, np.zeros_like(root))
        tip = P[:, JI['weaponR']] + skel.qrot(R[:, JI['weaponR']], np.array([0, 0, HDIM['blade']]))
        sp = np.linalg.norm(np.gradient(tip, axis=0), axis=1) * fps
        k = int(np.argmax(sp))
        fast = np.where(sp > 0.5 * sp.max())[0]
        log('  blade tip: fastest %.1f m/s at frame %d (video %s); above half speed frames %d-%d (video %s-%s)'
            % (sp.max(), k, cfg.fmt_time(B.t_ref[0] + k / fps), fast[0], fast[-1],
               cfg.fmt_time(B.t_ref[0] + fast[0] / fps), cfg.fmt_time(B.t_ref[0] + fast[-1] / fps)))
    if face == 'travel' and not loop and not clip.get('turn'):
        # "face": "travel": his travel from the start to the active phase (a lunge's direction) is +Z
        fa = int(round((cfg.parse_time(clip['phases']['active']) - B.t_ref[0]) * fps)) if clip.get('phases', {}).get('active') else len(q) - 1
        fa = int(np.clip(fa, 1, len(q) - 1))
        P0, _ = skel.fk(B.q[[0, fa]], B.hips[[0, fa]], B.root[[0, fa]])
        d = P0[1, JI['hips']] - P0[0, JI['hips']]
        a0 = float(np.arctan2(d[0], d[2]))
        rq = skel.qaxis([0, 1, 0], np.full(len(q), -a0))
        B.q = q = q.copy()
        q[:, JI['hips']] = skel.qmul(rq, q[:, JI['hips']])
        c_, s_ = np.cos(-a0), np.sin(-a0)
        for arr, ix, iz in ((B.hips, 0, 2), (B.root, 0, 1)):
            x, z = arr[:, ix].copy(), arr[:, iz].copy()
            arr[:, ix] = c_ * x + s_ * z
            arr[:, iz] = -s_ * x + c_ * z
        B.face_rot = getattr(B, 'face_rot', 0.0) + a0
        for nm in ('blade', 'bladeL'):
            if getattr(B, nm, None) is not None:
                setattr(B, nm, post.rotate_y(getattr(B, nm)[:, None], np.full(len(q), a0))[:, 0])
        log('  face travel: turned %.0f degrees so his travel to the active frame (%.2f m) is +Z' % (np.degrees(a0), np.hypot(d[0], d[2])))
    # marks: video times on the first take -> clip frames
    B.events, B.phases = [], {}
    if not loop:
        t0 = B.t_ref[0]
        for nm, tv in clip.get('phases', {}).items():
            B.phases[nm] = int(round((cfg.parse_time(tv) - t0) * fps))
        for ev in clip.get('events', []):
            B.events.append({'f': int(round((cfg.parse_time(ev['t']) - t0) * fps)), 'name': ev['name']})
    return B, Ts


def save(B, set_id):
    p = os.path.join(cfg.workdir('built', set_id), B.name + '.npz')
    meta = dict(name=B.name, loop=B.loop, fps=B.fps, contact=B.contact, speed=B.speed, events=B.events,
                phases=B.phases, takes=B.takes, loo=B.loo, period=getattr(B, 'period', None),
                shift=getattr(B, 'shift', None), offsets=getattr(B, 'offsets', None),
                t_ref0=float(B.t_ref[0]) if hasattr(B, 't_ref') else None, face_rot=getattr(B, 'face_rot', 0.0))
    meta['qa'] = getattr(B, 'qa', None)
    extra = {}
    if getattr(B, 'bladeL', None) is not None:
        extra['bladeL'] = B.bladeL
    if getattr(B, 'blade', None) is not None:
        extra['blade'] = B.blade
    np.savez_compressed(p, q=B.q, hips=B.hips, root=B.root, b=B.b, meta=json.dumps(meta), **extra)
    return p


def load(set_id, name):
    p = os.path.join(cfg.WORK, 'built', set_id, name + '.npz')
    z = np.load(p)
    B = Built()
    meta = json.loads(str(z['meta']))
    for k, v in meta.items():
        setattr(B, k, v)
    B.q, B.hips, B.root, B.b = z['q'], z['hips'], z['root'], z['b']
    B.blade = z['blade'] if 'blade' in z else None
    B.bladeL = z['bladeL'] if 'bladeL' in z else None
    return B


def air_hips(clip, B, Ts, hips, cmask, log):
    """frames with no planted foot take the pelvis' height from a fixed side take's picture, offset so it
    meets the contact heights at take-off and landing (spec "air": {"take": i, "stand": ["t0", "t1"]}: the
    stand span is a moment in that take where he stands on both feet, for the ground line and the scale)"""
    a = clip['air']
    ti = int(a.get('take', 0))
    T = Ts[ti]
    step = int(round(60.0 / B.fps))
    s = B.offsets[ti] if getattr(B, 'offsets', None) else 0
    n = len(hips)
    idx = np.clip(np.arange(n) * step + s, 0, len(T.t) - 1)
    st0, st1 = cfg.parse_time(a['stand'][0]), cfg.parse_time(a['stand'][1])
    stand = np.where((T.t >= st0) & (T.t <= st1))[0]
    if not len(stand):
        log('  ! air: the stand span is not in take %d' % ti)
        return hips
    h = post.air_height(T, idx, stand)
    out = hips.copy()
    air = ~cmask.any(1)
    if not air.any():
        log('  air: no frame without a planted foot')
        return out
    i = 0
    while i < n:
        if not air[i]:
            i += 1
            continue
        j = i
        while j < n and air[j]:
            j += 1
        a0 = max(i - 1, 0)
        a1 = min(j, n - 1)
        d0 = hips[a0, 1] - h[a0]
        d1 = hips[a1, 1] - h[a1]
        for k in range(i, j):
            u = (k - a0) / max(a1 - a0, 1)
            out[k, 1] = h[k] + d0 * (1 - u) + d1 * u
        log('  air: frames %d-%d from the picture, peak %.2f m above take-off' % (i, j - 1, out[i:j, 1].max() - hips[a0, 1]))
        i = j
    return out


def speed_from_picture(clip, Ts, B):
    """a loop's speed from a FIXED-camera take (take key "fixed": true) that sees him cross the frame:
    his pelvis' pixel speed over his pixel height, times his height, corrected for the view's angle"""
    for T in Ts:
        if not T.spec.get('fixed'):
            continue
        pel = (T.l2[:, 23, :2] + T.l2[:, 24, :2]) / 2
        tall = np.median(np.maximum(T.l2[:, [29, 30, 31, 32], 1].max(1), T.l2[:, [27, 28], 1].max(1)) - T.l2[:, 0, 1])
        px_h = tall / 0.9105  # nose height / height (proportions.py)
        v = np.polyfit(T.t, pel[:, 0], 1)[0]
        return abs(v) / px_h * HDIM['height'] / max(abs(np.sin(np.radians(T.yaw))), 0.3)
    return None


def _smoothstep(u):
    u = np.clip(u, 0, 1)
    return u * u * (3 - 2 * u)


def root_overrides(clip, B, root, fps, log):
    """spec overrides of a one-shot's root travel (when it cannot be measured):
      "travel_m": 1.4, "travel_dir": 180, ["travel_span": ["t0", "t1"]]  the root travels this far in this
          direction (deg in his frame: 0 forward, 90 his left, 180 back), eased over the span (default the
          whole clip); replaces the measured travel
      "root_keys": [["t" or frame, x, z], ...]  the root's ground position (m, his start frame: +x his left,
          +z his front) at those moments, eased between them (before the first: the start, 0, 0)"""
    n = len(root)
    t0r = B.t_ref[0] if hasattr(B, 't_ref') else 0

    def fr(v):
        return int(np.clip(v if isinstance(v, int) else round((cfg.parse_time(v) - t0r) * fps), 0, n - 1))
    if clip.get('travel_m') is not None:
        a = np.radians(float(clip.get('travel_dir', 0)))
        d = float(clip['travel_m']) * np.array([np.sin(a), np.cos(a)])
        f0, f1 = (fr(clip['travel_span'][0]), fr(clip['travel_span'][1])) if clip.get('travel_span') else (0, n - 1)
        u = _smoothstep((np.arange(n) - f0) / max(f1 - f0, 1))
        root[:, :2] = u[:, None] * d[None]
        log('  travel: %.2f m at %.0f degrees (given in the spec), frames %d-%d' % (clip['travel_m'], np.degrees(a), f0, f1))
    if clip.get('root_keys'):
        ks = sorted([(fr(k[0]), float(k[1]), float(k[2])) for k in clip['root_keys']])
        ks = [(0, 0.0, 0.0)] + [k for k in ks if k[0] > 0]
        out = np.zeros((n, 2))
        for (fa, xa, za), (fb, xb, zb) in zip(ks[:-1], ks[1:]):
            u = _smoothstep((np.arange(n) - fa) / max(fb - fa, 1))[:, None]
            seg = (np.arange(n) >= fa) & (np.arange(n) <= fb)
            out[seg] = (np.array([xa, za]) * (1 - u) + np.array([xb, zb]) * u)[seg]
        out[np.arange(n) > ks[-1][0]] = ks[-1][1:]
        root[:, :2] = out
        log('  root keys: %d given' % (len(ks) - 1))
    return root


def flight_from_picture(B, Ts, root, cmask, fps, log):
    """spec "flight": "picture": through frames with no planted foot (a hop back, a roll, a leap) the root
    travels as his pelvis moves against the FLOOR in each take's picture (camflow.floor_travel), along each
    camera's sideways axis; two or more takes from different sides give both ground directions (least
    squares), one take only its sideways one (the other keeps the coasted value)"""
    from . import camflow
    n = len(root)
    step = int(round(60.0 / fps))
    rows = []  # per take: (axis (n, 2), x (n,))
    for ti, T in enumerate(Ts):
        x = camflow.floor_travel(T, log)
        if x is None:
            continue
        s = B.offsets[ti] if getattr(B, 'offsets', None) else 0
        idx = np.clip(np.arange(n) * step + s, 0, len(T.t) - 1)
        ax = np.stack([T.Rs[i][0, [0, 2]] for i in idx])
        rows.append((ax, x[idx]))
    if not rows:
        return root
    air = ~cmask.any(1)
    out = root.copy()
    i = 0
    while i < n:
        if not air[i]:
            i += 1
            continue
        j = i
        while j < n and air[j]:
            j += 1
        a, b = max(i - 1, 0), min(j, n - 1)
        for k in range(a + 1, b + 1):
            A = np.array([r[0][k] for r in rows])
            y = np.array([r[1][k] - r[1][a] for r in rows])
            cur = root[k, :2] - root[a, :2]
            if len(rows) >= 2 and abs(np.linalg.det(A.T @ A)) > 0.05:
                d = np.linalg.lstsq(A, y, rcond=None)[0]
            else:
                u = A[0] / max(np.linalg.norm(A[0]), 1e-6)
                d = cur - u * (cur @ u) + u * (y[0] / max(np.linalg.norm(A[0]), 1e-6))
            out[k, :2] = out[a, :2] + d
        delta = out[b, :2] - root[b, :2]
        out[b + 1:, :2] = root[b + 1:, :2] + delta
        log('  flight frames %d-%d: travel from the picture %.2f m (coasted %.2f m)'
            % (i, j - 1, np.linalg.norm(out[b, :2] - out[a, :2]), np.linalg.norm(root[b, :2] - root[a, :2])))
        root = root.copy()
        root[:, :2] = out[:, :2]
        i = j
    return out
