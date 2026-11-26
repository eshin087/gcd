"""Measure the reference character's build from standing takes and propose HDIM numbers for our 1.85 m
body. Light work (cached landmarks only).

  python -I proportions.py [specs/proportions.json]

Lengths are measured in the PICTURE (the tool's 2D landmarks), not from its 3D guess (which leans toward an
average human): a front take gives widths and the limbs that hang in the picture plane, a side take gives
the foot and the ankle's height. Every number is a median over all the frames of the takes. His height is
crown to sole; the tool has no crown, so it is the nose's height plus a head-top offset measured by hand
(`crown_px` at `crown_sw_px` shoulder width in one front frame: the helmet's dome, not its crest) and
scaled per frame by his shoulder width. Output: <WORK>/proportions.json and the HDIM block."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from mlib import cfg, takes, skel  # noqa: E402

DEFAULT = {
    'front': [['move', 3.9, 7.2], ['sword', 9.95, 10.1]],
    'side': [['move', 7.3, 10.2], ['move', 0.1, 3.7]],
    'crown_px': 35.0, 'crown_sw_px': None, 'crown_frame': ['move', 4.96],
    'sword_side': [['sword', 0.1, 1.9], ['sword', 26.0, 26.4]],
}


def d2(l2, a, b):
    return np.linalg.norm(l2[:, a, :2] - l2[:, b, :2], axis=1)


def mid(l2, a, b):
    return (l2[:, a, :2] + l2[:, b, :2]) / 2


def main(a):
    cfgp = DEFAULT.copy()
    if a:
        cfgp.update(json.load(open(a[0])))
    # the hand-measured head-top offset, scaled by shoulder width
    ft, fl, _, _ = takes.load(cfgp['crown_frame'][0], cfgp['crown_frame'][1] - 0.03, cfgp['crown_frame'][1] + 0.03)
    sw_ref = d2(fl, 11, 12).mean()
    crown_per_sw = cfgp['crown_px'] / sw_ref
    F = []
    for film, t0, t1 in cfgp['front']:
        try:
            _, l2, _, _ = takes.load(film, t0, t1)
            F.append(l2)
        except RuntimeError as e:
            print('  skip', film, t0, t1, e)
    F = np.concatenate(F)
    sw = d2(F, 11, 12)
    sole = np.maximum(F[:, [29, 30, 31, 32], 1].max(1), F[:, [27, 28], 1].max(1))
    crown = F[:, 0, 1] - crown_per_sw * sw
    H = sole - crown
    r = {}

    def put(k, v):
        r[k] = float(np.median(v / H))
    put('shoulderWidth', sw)
    put('hipWidth', d2(F, 23, 24))
    put('upperArm', (d2(F, 11, 13) + d2(F, 12, 14)) / 2)
    put('foreArm', (d2(F, 13, 15) + d2(F, 14, 16)) / 2)
    put('hand', (np.linalg.norm(F[:, 15, :2] - mid(F, 17, 19), axis=1) + np.linalg.norm(F[:, 16, :2] - mid(F, 18, 20), axis=1)) / 2)
    put('thigh', (d2(F, 23, 25) + d2(F, 24, 26)) / 2)
    put('shin', (d2(F, 25, 27) + d2(F, 26, 28)) / 2)
    put('hipJointHeight', sole - (F[:, 23, 1] + F[:, 24, 1]) / 2)
    put('shoulderHeight', sole - (F[:, 11, 1] + F[:, 12, 1]) / 2)
    put('noseHeight', sole - F[:, 0, 1])
    put('earHeight', sole - (F[:, 7, 1] + F[:, 8, 1]) / 2)
    # side takes: the foot, the ankle's height
    S = []
    for film, t0, t1 in cfgp['side']:
        _, l2, _, _ = takes.load(film, t0, t1)
        S.append(l2)
    S = np.concatenate(S)
    Hs = (np.maximum(S[:, [29, 30, 31, 32], 1].max(1), S[:, [27, 28], 1].max(1)) - S[:, 0, 1]) / r['noseHeight']
    footlen = (d2(S, 29, 31) + d2(S, 30, 32)) / 2
    r['footLength'] = float(np.median(footlen / Hs))
    ank = []
    for an, he, to in ((27, 29, 31), (28, 30, 32)):
        ank.append(np.maximum(S[:, he, 1], S[:, to, 1]) - S[:, an, 1])
    r['ankleHeight'] = float(np.median(np.concatenate(ank) / np.concatenate([Hs, Hs])))
    r['n_front_frames'] = int(len(F))
    r['n_side_frames'] = int(len(S))
    # the sword: hilt to tip in side frames where it is level and in the picture plane (by hand: see README)
    if 'sword_px' in cfgp:
        r['sword'] = cfgp['sword_px'] / cfgp['sword_H_px']
    # ---- HDIM proposal for 1.85 m
    Hm = 1.85
    d = dict(skel.HDIM)
    p = {}
    p['height'] = Hm
    p['ankle'] = round(r['ankleHeight'] * Hm, 3)
    p['shin'] = round(r['shin'] * Hm, 3)
    p['thigh'] = round(r['thigh'] * Hm, 3)
    p['hipHalf'] = round(r['hipWidth'] / 2 * Hm, 3)
    hip_joint = r['hipJointHeight'] * Hm
    # the tool's hip points sit at the pelvis, above the hip joints: their height is our pelvis joint
    # (hipsY), and what the leg chain (thigh + shin + ankle) does not reach is the hip joints' drop
    legs = p['thigh'] + p['shin'] + p['ankle']
    p['hipDrop'] = round(max(hip_joint - legs, 0.03), 3)
    p['hipsY'] = round(p['hipDrop'] + legs, 3)
    sh_y = r['shoulderHeight'] * Hm
    up = sh_y - p['hipsY']  # spine + chest + clavUp
    k = up / (d['spine'] + d['chest'] + d['clavUp'])
    p['spine'] = round(d['spine'] * k, 3)
    p['chest'] = round(d['chest'] * k, 3)
    p['clavUp'] = round(d['clavUp'] * k, 3)
    half = r['shoulderWidth'] / 2 * Hm
    p['clavIn'] = d['clavIn']
    p['clav'] = round(half - d['clavIn'], 3)
    p['upperArm'] = round(r['upperArm'] * Hm, 3)
    p['foreArm'] = round(r['foreArm'] * Hm, 3)
    p['palm'] = round(0.9 * r['hand'] * Hm, 3)  # wrist -> the knuckles' middle is the tool's hand; the grip sits just inside it
    p['foot'] = round(0.6 * r['footLength'] * Hm, 3)
    # neck + head: from the chest joint to the crown, split as today's (neck base, head joint, crown above it)
    chest_y = p['hipsY'] + p['spine'] + p['chest']
    rest_old = d['height'] - (d['hipsY'] + d['spine'] + d['chest'])
    kk = (Hm - chest_y) / rest_old
    p['neck'] = round(d['neck'] * kk, 3)
    p['head'] = round(d['head'] * kk, 3)
    p['blade'] = d['blade']
    p['bladeBase'] = d['bladeBase']
    p['bladeTip'] = d['bladeTip']
    out = {'ratios_to_height': {k: round(v, 4) for k, v in r.items()}, 'HDIM_1_85': p,
           'today': {k: d[k] for k in p if k in d}}
    path = os.path.join(cfg.WORK, 'proportions.json')
    json.dump(out, open(path, 'w'), indent=1)
    print(json.dumps(out, indent=1))
    print(path)


if __name__ == '__main__':
    main(sys.argv[1:])
