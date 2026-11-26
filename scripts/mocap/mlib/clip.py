"""Building one clip from its spec entry: takes -> (fold | align) -> fuse -> retarget -> ground / contact /
root -> clean -> a Built result (saved under <WORK>/built/<set>/<clip>.npz)."""
import json, os
import numpy as np
from . import cfg, skel, takes, fuse, retarget
from .skel import JI, J, HDIM


class Built:
    pass


def _take(spec, clip, tk, pad=0.0, log=print):
    film = tk.get('film', clip.get('film', spec.get('film')))
    t0 = cfg.parse_time(tk['t0']) - pad
    t1 = cfg.parse_time(tk['t1']) + pad
    T = takes.Take(film, t0, t1, tk.get('view'), tk.get('name', '%s@%.2f' % (tk.get('view'), t0 + pad)),
                   flip=tk.get('flip'), pitch=tk.get('pitch'), yaw=tk.get('yaw'), log=log,
                   calm=tk.get('calm', clip.get('calm', 0.35 if clip.get('kind', 'oneshot') == 'oneshot' else None)))
    T.spec = tk
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
        parts = [(ref.b, ref.wax)]
        B.offsets = [0]
        for tk in clip['takes'][1:]:
            T = _take(spec, clip, tk, pad=search + 0.05, log=log)
            s, cost = fuse.align(ref, T, search)
            n = len(ref.b)
            seg = T.b[s:s + n] if s >= 0 else None
            if seg is None or len(seg) < n:
                log('  ! take %s: aligned offset %d leaves it short; dropped' % (T.name, s))
                continue
            Ts.append(T)
            parts.append((seg, T.wax))
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
    Rw = retarget.world_rotations(b, blade, tumble=clip.get('ground') == 'body')
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
        if not (nm == 'handR' and blade is not None):
            q = retarget.limit_joint(q, JI[nm], 70, 1.2 * k, loop)
    q = retarget.limit_joint(q, JI['head'], 60, 1.0 * k, loop)
    q = retarget.limit_joint(q, JI['neck'], 45, 1.0 * k, loop)
    q = skel.continuous(q)
    g = retarget.ground_and_contact(q, fps, loop, clip.get('ground', 'feet'), clip.get('travel', 'free'), log, clip)
    hips = np.zeros((len(q), 3))
    hips[:, 0] = g['hips_xz'][:, 0]
    hips[:, 1] = g['hipsY']
    hips[:, 2] = g['hips_xz'][:, 1]
    root = g['root']
    if not loop:
        root[:, :2] -= root[0, :2]
    q, before, after = retarget.pin_feet(q, hips, root, g['cmask'], loop=loop)
    q = skel.continuous(q)
    log('  feet: planted slide %.1f cm before cleaning, %.1f cm after; contact L %s R %s' % (before, after, g['contact']['L'], g['contact']['R']))
    if g['speed'] is not None:
        log('  speed %.2f m/s, period %.3f s, %d frames' % (g['speed'], B.period, len(q)))
    B.q, B.hips, B.root, B.contact, B.speed, B.cmask = q, hips, root, g['contact'], g['speed'], g['cmask']
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
                t_ref0=float(B.t_ref[0]) if hasattr(B, 't_ref') else None)
    extra = {}
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
    return B
