"""The KEY sheet for attacks: both arms and the blade over a span of one take, big enough to read the fist
and the blade, with what the build will use printed on it, so you correct instead of starting blind.
Light work.

  python -I armsheet.py specs/<set>.json <clip> [take=0] --from t --to t [--every 3] [--cell 440] [--cols 4] [--emit]

Each tile is one frame round his upper body and the blade's reach:
  - a pixel GRID in full-frame coordinates (lines every 20 px, labelled every 100 on the edges; the
    50-px lines a little brighter), so a point in the middle of the tile reads directly;
  - the TRACKER's arm points thin (his left green, right red; sR eR wR sL eL wL) and its blade (cyan;
    grey when the detector found nothing);
  - the current ARM KEYS (spec take "arm_keys") thick: the right arm orange, the left arm lime, the blade
    white; on a key frame the points are circled and named, between keys the spline the build will use
    is drawn thinner. The header says KEY on a keyed frame.
--emit writes `<clip>_armkeys_take<k>.json` beside the sheet: one key per tile, the existing keys as they
are, every other tile PRE-FILLED with the tracker's points and the detected blade (hilt = the fist, tip
along the detected ray). Paste it into the take's "arm_keys", then fix only the points that are wrong
(compare each with the picture), drop the tiles you do not need (a key every 3-5 frames through the cut;
fewer where the arm is calm) and rebuild."""
import os, sys, json, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from mlib import cfg, clip as C, sword, draw, armkeys  # noqa: E402
from mlib.skel import HDIM  # noqa: E402

ORANGE, LIME, BWHITE = (255, 150, 30), (170, 255, 60), (255, 255, 210)
SHORT = {11: 'sL', 12: 'sR', 13: 'eL', 14: 'eR', 15: 'wL', 16: 'wR'}
KN = {'shoulderL': 11, 'shoulderR': 12, 'elbowL': 13, 'elbowR': 14, 'wristL': 15, 'wristR': 16}


def opts(a, spec):
    o = dict(spec)
    for k in list(o):
        if k in a:
            i = a.index(k)
            if isinstance(o[k], bool):
                o[k] = True
                del a[i]
            else:
                o[k] = a[i + 1]
                del a[i:i + 2]
    return o


def main(a):
    o = opts(a, {'--from': None, '--to': None, '--every': '3', '--cell': '440', '--cols': '4', '--emit': False,
                 '--box': None})
    spec = cfg.load_spec(a[0])
    c = [x for x in spec['clips'] if x['name'] == a[1]][0]
    ti = int(a[2]) if len(a) > 2 else 0
    tk = c['takes'][ti]
    keys, blend = armkeys._keys(tk)
    keys = keys or []
    plain = copy.deepcopy(tk)
    plain.pop('arm_keys', None)
    T = C._take(spec, c, plain, log=lambda s: None)
    t0 = cfg.parse_time(o['--from'] or tk['t0'])
    t1 = cfg.parse_time(o['--to'] or tk['t1'])
    every, cell, cols = int(o['--every']), int(o['--cell']), int(o['--cols'])
    idx = np.where((T.t >= t0 - 1e-3) & (T.t <= t1 + 1e-3))[0]
    # key frames are always shown
    kidx = [int(np.argmin(np.abs(T.t - cfg.parse_time(k['t'])))) for k in keys]
    show = sorted(set(list(idx[::every]) + [k for k in kidx if t0 - 1e-3 <= T.t[k] <= t1 + 1e-3]))
    show = np.array(show, int)
    ang, conf, best = sword.track_2d(T, show, blur=bool(c.get('blade_blur')), color=c.get('blade_color', 'rust')) \
        if c.get('sword') else (np.zeros(len(show)), np.zeros(len(show)), np.zeros(len(show)))
    kp, _ = armkeys._interp_keys(T, keys, blend) if keys else ({}, {})
    # the blade's length in the picture: our blade on his torso's picture length
    tor = np.median(np.linalg.norm((T.l2[:, 11, :2] + T.l2[:, 12, :2]) / 2 - (T.l2[:, 23, :2] + T.l2[:, 24, :2]) / 2, axis=1))
    Lpx = HDIM['blade'] / armkeys.TORSO_M * tor
    fists = np.array([sword.fist_of(T.l2[i]) for i in show])
    tips = fists + Lpx * np.stack([np.cos(ang), np.sin(ang)], 1)
    # one box for the span: the arms, the blade, the keys
    pts = [T.l2[show][:, [11, 12, 13, 14, 15, 16], :2].reshape(-1, 2), tips, fists]
    for nm, (px, w) in kp.items():
        pts.append(px[show][w[show] > 0])
    pts = np.concatenate(pts)
    lo, hi = np.percentile(pts, 1, axis=0) - 30, np.percentile(pts, 99, axis=0) + 30
    side = max(hi - lo)
    cx, cy = (lo + hi) / 2
    box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
    if o['--box']:
        x, y, sd = [float(v) for v in o['--box'].split(',')]
        box = (int(x), int(y), int(x + sd), int(y + sd))
    sc = cell / (box[2] - box[0])

    def xy(p):
        return ((p[0] - box[0]) * sc, (p[1] - box[1]) * sc)
    fnt = draw.font(13)
    fsm = draw.font(11)
    tiles = []
    emit = []
    kset = {k: kk for k, kk in zip(kidx, keys)}
    for j, i in enumerate(show):
        _, path = cfg.frame_at(T.film, T.t[i])
        im = Image.open(path).convert('RGB').crop(box).resize((cell, cell), Image.BILINEAR)
        dr = ImageDraw.Draw(im)
        for g in range((box[0] // 20 + 1) * 20, box[2], 20):
            X = (g - box[0]) * sc
            dr.line([X, 0, X, cell], fill=(90, 90, 40) if g % 100 == 0 else ((60, 60, 50) if g % 50 == 0 else (38, 38, 34)), width=1)
            if g % 100 == 0:
                dr.text((X + 2, 16), str(g), fill=draw.YEL, font=fsm)
                dr.text((X + 2, cell - 14), str(g), fill=draw.YEL, font=fsm)
        for g in range((box[1] // 20 + 1) * 20, box[3], 20):
            Y = (g - box[1]) * sc
            dr.line([0, Y, cell, Y], fill=(90, 90, 40) if g % 100 == 0 else ((60, 60, 50) if g % 50 == 0 else (38, 38, 34)), width=1)
            if g % 100 == 0:
                dr.text((2, Y + 1), str(g), fill=draw.YEL, font=fsm)
                dr.text((cell - 30, Y + 1), str(g), fill=draw.YEL, font=fsm)
        l2 = T.l2[i]
        # the tracker, thin
        for p_, q_ in ((11, 13), (13, 15), (12, 14), (14, 16), (11, 12)):
            dr.line([xy(l2[p_]), xy(l2[q_])], fill=draw.side_col(p_, q_), width=1)
        for jj, nm in SHORT.items():
            x, y = xy(l2[jj])
            dr.text((x + 3, y - 12), nm, fill=draw.side_col(jj, jj), font=fsm)
        if c.get('sword'):
            col = (draw.CYAN if best[j] >= 0.42 else (255, 80, 255)) if conf[j] > 0 else (120, 120, 120)
            dr.line([xy(fists[j]), xy(tips[j])], fill=col, width=1)
        # the keys / the spline
        on_key = i in kset
        wd = 3 if on_key else 2
        P = {nm: px[i] for nm, (px, w) in kp.items() if w[i] > 0.5}
        for s, col in (('R', ORANGE), ('L', LIME)):
            ch = [P.get(n + s) for n in ('shoulder', 'elbow', 'wrist')]
            for a_, b_ in ((ch[0], ch[1]), (ch[1], ch[2])):
                if a_ is not None and b_ is not None:
                    dr.line([xy(a_), xy(b_)], fill=col, width=wd)
        if 'tip' in P:
            h = P.get('hilt', P.get('wristR'))
            if h is not None:
                dr.line([xy(h), xy(P['tip'])], fill=BWHITE, width=wd)
        if on_key:
            for nm, p in P.items():
                x, y = xy(p)
                col = ORANGE if nm.endswith('R') else LIME if nm.endswith('L') else BWHITE
                dr.ellipse([x - 5, y - 5, x + 5, y + 5], outline=col, width=2)
                dr.text((x + 6, y + 2), nm.replace('shoulder', 's').replace('elbow', 'e').replace('wrist', 'w'), fill=col, font=fsm)
        draw.label(im, '%s  f%d%s' % (cfg.fmt_time(T.t[i]), i, '  KEY' if on_key else ''), sz=13,
                   fill=(255, 255, 255) if on_key else draw.YEL)
        tiles.append(im)
        if on_key:
            emit.append(kset[i])
        else:
            pts_ = {nm: [int(round(l2[jj, 0])), int(round(l2[jj, 1]))] for nm, jj in KN.items()}
            if c.get('sword'):
                pts_['hilt'] = [int(round(fists[j][0])), int(round(fists[j][1]))]
                pts_['tip'] = [int(round(tips[j][0])), int(round(tips[j][1]))]
            emit.append({'t': '%d:%05.2f' % (T.t[i] // 60, T.t[i] % 60), 'pts': pts_})
    out = os.path.join(cfg.workdir('sheets', spec['set']), '%s_arms_take%d.jpg' % (c['name'], ti))
    draw.grid(tiles, cols).save(out, quality=88)
    print('%s  (%d frames, crop %s, %.2f sheet px per frame px)' % (out, len(tiles), box, sc))
    if o['--emit']:
        jp = out[:-4] + '.json'
        with open(jp, 'w', encoding='utf-8') as f:
            f.write('{"blend": %d, "keys": [\n' % blend + ',\n'.join('  ' + json.dumps(k) for k in emit) + '\n]}\n')
        print('pre-filled keys:', jp)


if __name__ == '__main__':
    main(sys.argv[1:])
