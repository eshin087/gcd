# armkeys.py <spec> <clip> <npz> <json keys>: arm directions read off the footage in HIS CHEST frame -> `pose_keys` on every frame (blend 1)
# (run from scripts/mocap with "$PY" -I; the npz is the clip's built result under $MOCAP_WORK/built/<set>/; rerun after changing `face` or the body)
# keys: {"upperArmR": [[f, [left, up, fwd]], ...], "foreArmR": [...]} ; frames between keys: normalized lerp
import sys, os, json, numpy as np
sys.path.insert(0, os.getcwd())
from mlib import skel
spec, name, npz, kj = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
q = np.load(npz)['q']; P, _ = skel.fk(q, np.zeros((len(q), 3)))
ix = {n: i for i, n in enumerate(skel.JOINTS)}
def axes(f):
    L = P[f, ix['upperArmL']] - P[f, ix['upperArmR']]; L /= np.linalg.norm(L)
    U = P[f, ix['neck']] - P[f, ix['hips']]; U -= L * (U @ L); U /= np.linalg.norm(U)
    F = np.cross(L, U)
    return L, U, F
pk = []
for joint in ('upperArmR', 'foreArmR'):
    ks = sorted(kj.get(joint, []), key=lambda k: k[0])
    for a, b in zip(ks, ks[1:] + [None]):
        f0, d0 = a[0], np.array(a[1], float)
        rng = [f0] if b is None else range(f0, b[0])
        for f in rng:
            d = d0 if b is None else d0 + (np.array(b[1], float) - d0) * (f - f0) / (b[0] - f0)
            d = d / np.linalg.norm(d); L, U, F = axes(f)
            w = d[0] * L + d[1] * U + d[2] * F
            pk.append({"f": int(f), "joint": joint, "dir": [round(float(x), 3) for x in w], "blend": 1})
pk.sort(key=lambda k: (k['f'], 0 if k['joint'] == 'upperArmR' else 1))
s = json.load(open(spec)); c = [c for c in s['clips'] if c['name'] == name][0]
c['pose_keys'] = pk; open(spec, 'w').write(json.dumps(s, indent=1)); print(len(pk), 'pose keys')
