"""The viewer: our skeleton (FK of the built clip) drawn from a take's camera, under the reference frames
of the same moments ("pair sheets"), and over them ("overlay"). No game engine needed.

  row 1  the reference frame round him (the tool's landmarks drawn thin, if asked)
  row 2  OUR skeleton from the same camera direction, same scale, on a dark ground (his left green,
         right red, spine yellow, the blade cyan, a planted foot marked with a white dot)
  row 3  our skeleton drawn over the reference frame

Our joints are placed in the picture by the take's camera rotation (measured) plus a per-frame scale
and shift fitted on the hips, shoulders and ankles (weak perspective)."""
import numpy as np
from PIL import Image, ImageDraw
from . import cfg, skel, draw
from .skel import JI, J, PARENT, HDIM

# our joint -> the tool's landmark (for the fit)
FIT = [('thighL', 23), ('thighR', 24), ('upperArmL', 11), ('upperArmR', 12), ('footL', 27), ('footR', 28)]


def our_points(B, blade_len=None):
    """FK of the built clip in its root frame with the root's travel removed (n, J, 3), plus the blade
    tip (n, 3) when the clip holds a sword"""
    root = np.zeros_like(B.root)
    root[:, 2] = B.root[:, 2]  # his turn, without the travel
    P, R = skel.fk(B.q, B.hips, root)
    tip = P[:, JI['weaponR']] + skel.qrot(R[:, JI['weaponR']], np.array([0, 0, blade_len or HDIM['blade']]))
    tipL = P[:, JI['weaponL']] + skel.qrot(R[:, JI['weaponL']], np.array([0, 0, blade_len or HDIM['blade']]))
    fr = float(getattr(B, 'face_rot', 0.0) or 0.0)
    if fr:  # spec "face" turned the clip: turn it back into the takes' body frame
        from .post import rotate_y
        P = rotate_y(P, np.full(len(P), -fr))
        tip = rotate_y(tip[:, None], np.full(len(P), -fr))[:, 0]
        tipL = rotate_y(tipL[:, None], np.full(len(P), -fr))[:, 0]
    return P, R, tip, tipL


def _side(i):
    n = skel.JOINTS[i]
    return draw.GREEN if n.endswith('L') else (draw.RED if n.endswith('R') else draw.YEL)


def project(P, Rcam):
    cam = P @ Rcam.T
    return cam[..., :2] * np.array([1, -1.0])


def fit_to(img_pts, l2):
    """scale + shift so our projected fit joints land on the tool's landmarks"""
    a = np.array([img_pts[JI[n]] for n, _ in FIT])
    b = np.array([l2[k, :2] for _, k in FIT])
    am, bm = a.mean(0), b.mean(0)
    s = ((a - am) * (b - bm)).sum() / max(((a - am) ** 2).sum(), 1e-9)
    return s, bm - s * am


def draw_ours(dr, pts, tip=None, planted=(False, False), width=3, off=(0, 0), sc=1.0, tipL=None):
    def xy(p):
        return ((p[0] - off[0]) * sc, (p[1] - off[1]) * sc)
    for i in range(1, J):
        p = PARENT[i]
        if p <= 0 or skel.JOINTS[i].startswith('weapon'):
            continue
        dr.line([xy(pts[p]), xy(pts[i])], fill=_side(i), width=width)
    if tip is not None:
        dr.line([xy(pts[JI['weaponR']]), xy(tip)], fill=draw.CYAN, width=max(2, width - 1))
    if tipL is not None:
        dr.line([xy(pts[JI['weaponL']]), xy(tipL)], fill=(255, 140, 255), width=max(2, width - 1))
    for f, s in enumerate(('L', 'R')):
        if planted[f]:
            x, y = xy(pts[JI['foot' + s]])
            dr.ellipse([x - 4, y - 4, x + 4, y + 4], fill=draw.WHITE)
    hx, hy = xy(pts[JI['head']])
    dr.ellipse([hx - 5 * sc ** 0, hy - 5, hx + 5, hy + 5], outline=draw.YEL, width=2)


def take_time(B, ti, f):
    """video time in take ti of clip frame f"""
    tk = B.takes[ti]
    if B.loop:
        n = len(B.q)
        P = B.period
        s = B.shift[ti]
        lo, hi = tk['t_lo'], tk['t_hi']
        # the cycle instance nearest the middle of the take
        base = lo + ((f + s) % n) / n * P
        m = np.round(((lo + hi) / 2 - base) / P)
        m = min(m, np.floor((hi - base) / P))
        return base + max(m, 0) * P
    step = 60.0 / B.fps
    s = B.offsets[ti]
    pad = tk['t_lo'] if ti == 0 else tk['t_lo']
    return pad + (s + f * step) / 60.0


def pair_sheet(B, Ts, out, frames=None, k=8, cell=200, overlay=True, tool=True, takes_idx=None, title=''):
    from . import track
    n = len(B.q)
    if frames is None:
        frames = [int(round(i * (n - 1) / (k - 1))) for i in range(k)] if not B.loop else [int(i * n / k) for i in range(k)]
    frames = [f for f in frames if 0 <= f < n] or [0]  # a sheet_frames list longer than the clip
    P, R, tip, tipLs = our_points(B)
    has_blade = getattr(B, 'blade', None) is not None
    has_bL = getattr(B, 'bladeL', None) is not None
    rows = []
    hdr = Image.new('RGB', (cell * len(frames), 22), (12, 12, 16))
    draw.label(hdr, title or B.name, (4, 3), sz=13, fill=draw.WHITE)
    rows.append(hdr)
    for ti, T in enumerate(Ts):
        if takes_idx is not None and ti not in takes_idx:
            continue
        top, mid, bot = [], [], []
        for f in frames:
            t = take_time(B, ti, f)
            tt, path = cfg.frame_at(T.film, t)
            im = Image.open(path).convert('RGB')
            gi = int(np.clip(np.round((tt - T.t[0]) * 60), 0, len(T.t) - 1))
            l2 = T.l2[gi]
            Rc = T.Rs[gi] if getattr(T, 'Rs', None) is not None else T.R  # that frame's camera
            pts = project(P[f], Rc)
            s, sh = fit_to(pts, l2)
            pts = pts * s + sh
            tp = project(tip[f][None], Rc)[0] * s + sh if has_blade else None
            tpL = project(tipLs[f][None], Rc)[0] * s + sh if has_bL else None
            # crop round both
            allp = np.concatenate([pts, l2[:, :2]] + ([tp[None]] if tp is not None else []))
            x0, y0 = allp.min(0)
            x1, y1 = allp.max(0)
            side = max(x1 - x0, y1 - y0) * 1.15 + 20
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
            sc = cell / (box[2] - box[0])
            ref = im.crop(box).resize((cell, cell), Image.BILINEAR)
            if tool:
                draw.draw_mp(ImageDraw.Draw(ref), l2, off=box[:2], sc=sc, width=1)
            draw.label(ref, '%s f%d %s' % (T.name, f, cfg.fmt_time(tt)), sz=11)
            top.append(ref)
            ours = Image.new('RGB', (cell, cell), (18, 18, 24))
            planted = (bool(B.cmask[f, 0]), bool(B.cmask[f, 1])) if hasattr(B, 'cmask') else (False, False)
            draw_ours(ImageDraw.Draw(ours), pts, tp, planted, 3, box[:2], sc, tpL)
            mid.append(ours)
            if overlay:
                ov = im.crop(box).resize((cell, cell), Image.BILINEAR)
                draw_ours(ImageDraw.Draw(ov), pts, tp, planted, 2, box[:2], sc, tpL)
                bot.append(ov)
        rows += [draw.grid(top, len(top)), draw.grid(mid, len(mid))] + ([draw.grid(bot, len(bot))] if bot else [])
    sheet = draw.stack(rows)
    sheet.save(out, quality=86)
    return out


def cmask_from(B):
    n = len(B.q)
    m = np.zeros((n, 2), bool)
    for f, s in enumerate(('L', 'R')):
        for a, b in B.contact[s]:
            m[a:b + 1, f] = True
    return m
