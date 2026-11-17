# Run by scripts/blender/build-hero-parts.mjs inside a headless Blender:
#   blender --background --factory-startup --python hero_parts.py -- <dims.json> <out heroParts.js>
#
# Models the hero's sculpted parts with bmesh / mathutils and writes them as packed vertex data
# (src/entities/player/heroParts.js) that model.js hangs on the rig's joints (ADR-037).
#
# Everything here is in GAME coordinates: x = the hero's LEFT, y = up, z = the way he faces, metres.
# Each part is modelled in the space of the joint it hangs on (see the `yXx` helpers). Per vertex:
#   position, normal, aGUV (roughly metric: x across, y along / up) and aPart, the ink-line sub-id:
#   the art pass draws a line where it changes; 0 / 1 = plain sub-pieces, a smooth 0..0.9 field
#   prints its 0.5 contour as a drawn crease (model.js foldLines).
# Front faces are counter-clockwise seen from outside, as in three.js.
import base64
import json
import math
import random
import struct
import sys

import bmesh
import bpy
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index('--') + 1:]
with open(argv[0], encoding='utf-8') as fh:
    D = json.load(fh)
OUT = argv[1]
DIM, BODY, REST, HAIR_CLUSTERS = D['DIM'], D['BODY'], D['REST'], D['HAIR_CLUSTERS']

TAU = math.pi * 2


def lerp(a, b, t):
    return a + (b - a) * t


def clamp01(t):
    return 0.0 if t < 0 else 1.0 if t > 1 else t


def smooth(a, b, x):
    t = clamp01((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def poly(pts, x):
    """Piecewise-linear y(x) through pts = [(x, y), ...] (x ascending)."""
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return lerp(y0, y1, (x - x0) / (x1 - x0)) if x1 > x0 else y1
    return pts[-1][1]


# ------------------------------------------------------------------ mesh builder
class Geo:
    """A bmesh with the per-vertex layers the game needs."""

    def __init__(self):
        self.bm = bmesh.new()
        self.k = self.bm.verts.layers.float.new('k')
        self.gu = self.bm.verts.layers.float.new('gu')
        self.gv = self.bm.verts.layers.float.new('gv')

    def vert(self, co, gu=0.0, gv=0.0, k=0.0):
        v = self.bm.verts.new(co)
        v[self.gu], v[self.gv], v[self.k] = gu, gv, k
        return v

    def face(self, vs):
        try:
            return self.bm.faces.new(vs)
        except ValueError:
            return None

    def grid(self, cols, rows, fn, k=0.0, flip=False, closed=False, ss=None, ts=None, keep=None):
        """fn(s, t) -> (co, gu, gv[, k]); s across (cols), t along (rows). The front face is the
        side Ps x Pt points to (flip reverses it). closed = s wraps round. ss / ts = explicit
        sample lists instead of even steps."""
        ss = ss or [i / cols for i in range(cols + 1)]
        ts = ts or [j / rows for j in range(rows + 1)]
        nc = len(ss) - 1 if closed else len(ss)
        vs = []
        for t in ts:
            row = []
            for i in range(nc):
                r = fn(ss[i], t)
                row.append(self.vert(r[0], r[1], r[2], r[3] if len(r) > 3 else k))
            vs.append(row)
        for j in range(len(ts) - 1):
            for i in range(len(ss) - 1):
                i1 = (i + 1) % nc
                if keep and not keep((ss[i] + ss[i + 1]) / 2, (ts[j] + ts[j + 1]) / 2):
                    continue
                a, b, c, d = vs[j][i], vs[j][i1], vs[j + 1][i], vs[j + 1][i1]
                self.face([a, c, d, b] if flip else [a, b, d, c])
        return vs

    def tube(self, pts, r, k=0.0, radial=4, ref=Vector((0, 1, 0))):
        """A thin round bar along a polyline (piping, rims)."""
        n = len(pts)

        def fn(s, t):
            i = max(0, min(n - 1, round(t * (n - 1))))
            p = pts[i]
            T = pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]
            if T.length < 1e-9:
                T = Vector((0, 1, 0))
            T.normalize()
            S = T.cross(ref)
            if S.length < 0.05:
                S = T.cross(Vector((1, 0, 0)))
            S.normalize()
            N = S.cross(T)
            a = s * TAU
            return (p + S * (math.cos(a) * r) + N * (math.sin(a) * r), s * r * 6, t * (n - 1) * 0.01)

        self.grid(radial, n - 1, fn, k=k, flip=True, closed=True)

    def translate(self, v):
        bmesh.ops.translate(self.bm, verts=self.bm.verts[:], vec=Vector(v))
        return self

    def bake(self, sharp=50.0):
        """→ (positions, normals, guv, k, indices): triangles, normals smoothed across edges
        flatter than `sharp` degrees."""
        bm = self.bm
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.normal_update()
        bm.verts.index_update()
        cs = math.cos(math.radians(sharp))
        area = {f: f.calc_area() for f in bm.faces}
        seen, P, N, UV, K, I = {}, [], [], [], [], []
        for f in bm.faces:
            if area[f] < 1e-11:
                continue
            for lp in f.loops:
                v = lp.vert
                n = Vector((0, 0, 0))
                for g in v.link_faces:
                    if area[g] >= 1e-11 and g.normal.dot(f.normal) >= cs:
                        n += g.normal * area[g]
                if n.length < 1e-12:
                    n = f.normal.copy()
                n.normalize()
                key = (v.index, round(n.x, 2), round(n.y, 2), round(n.z, 2))
                idx = seen.get(key)
                if idx is None:
                    idx = seen[key] = len(K)
                    P.extend(v.co)
                    N.extend(n)
                    UV.extend((v[self.gu], v[self.gv]))
                    K.append(v[self.k])
                I.append(idx)
        bm.free()
        return P, N, UV, K, I


PARTS = {}


def emit(name, geo, sharp=50.0):
    P, N, UV, K, I = geo.bake(sharp)
    n = len(K)
    if n == 0 or n > 65535:
        raise RuntimeError(f'part {name}: {n} vertices')

    def q16(a):
        return struct.pack(f'<{len(a)}h', *(max(-32767, min(32767, round(x * 8192))) for x in a))

    b64 = lambda b: base64.b64encode(b).decode('ascii')
    PARTS[name] = {
        'n': n,
        'p': b64(q16(P)),
        'nrm': b64(struct.pack(f'<{len(N)}b', *(max(-127, min(127, round(x * 127))) for x in N))),
        'uv': b64(q16(UV)),
        'k': b64(struct.pack(f'<{n}B', *(max(0, min(200, round(x * 200))) for x in K))),
        'i': b64(struct.pack(f'<{len(I)}H', *I)),
        'tris': len(I) // 3,
    }


# ------------------------------------------------------------------ the body the parts are fitted to
SHELL = BODY['shell']


def shell_at(h):
    """The torso shell's ring at world idle height h (model.js shellAt)."""
    k = 0
    while k < len(SHELL) - 2 and SHELL[k + 1]['y'] < h:
        k += 1
    A, B = SHELL[k], SHELL[k + 1]
    u = clamp01((h - A['y']) / (B['y'] - A['y']))
    g = lambda key: lerp(A.get(key, 0.0), B.get(key, 0.0), u)
    return {'rx': g('rx'), 'rz': g('rz'), 'cz': g('cz'), 'gap': g('gap')}


def shell_z(h, x, side=1):
    R = shell_at(h)
    return side * math.sqrt(max(0.0, 1 - (x / R['rx']) ** 2)) * R['rz'] + R['cz']


y_sp = lambda h: h - REST['spine']  # world idle height → spine-joint local y
y_ch = lambda h: h - REST['chest']
y_pe = lambda h: h - REST['pelvis']


# ------------------------------------------------------------------ hair (head space)
# A big rounded messy mop (the single-figure reference: ~0.30 m across, ~0.25 m tall): a lumpy
# under-volume on the head joint and chunky pointed locks in layers on the five spring clusters:
# crown spikes radiating from a whorl, side and nape locks flicking out at the tips, a fringe down
# over the eyes, and thin stray wisps on the outline.
SK = Vector(DIM['skull'])  # skull centre in head space
CAP_C = SK + Vector((0, 0.02, -0.013))
CAP_R = Vector((0.108, 0.104, 0.116))


def cap_point(az, el, f=1.0):
    """Point on the hair volume: az from the front toward his left, el up from level (radians)."""
    ce = math.cos(el)
    return CAP_C + Vector((math.sin(az) * ce * CAP_R.x, math.sin(el) * CAP_R.y, math.cos(az) * ce * CAP_R.z)) * f


def cap_out(p):
    """Outward normal of the hair volume through p."""
    q = p - CAP_C
    n = Vector((q.x / CAP_R.x ** 2, q.y / CAP_R.y ** 2, q.z / CAP_R.z ** 2))
    return n.normalized() if n.length > 1e-9 else Vector((0, 1, 0))


def cap_push(p, m):
    """Keep p at least (1 + m) x the hair volume's radius out from its centre."""
    q = p - CAP_C
    s = math.sqrt((q.x / CAP_R.x) ** 2 + (q.y / CAP_R.y) ** 2 + (q.z / CAP_R.z) ** 2)
    if s < 1e-6:
        return p
    return CAP_C + q * ((1 + m) / s) if s < 1 + m else p


def hair_cap():
    g = Geo()
    bmesh.ops.create_icosphere(g.bm, subdivisions=3, radius=1.0)
    for v in g.bm.verts:
        d = v.co.normalized()
        lump = 1 + 0.05 * noise.noise(d * 2.3 + Vector((3.1, 1.7, 0.4)))
        p = CAP_C + Vector((d.x * CAP_R.x, d.y * CAP_R.y, d.z * CAP_R.z)) * lump
        # open under the brow in front (the face), lower over the ears, down to the nape behind
        cut = SK.y + lerp(0.03, -0.085, smooth(0.07, -0.07, p.z))
        if p.y < cut:
            p.y = cut - (cut - p.y) * 0.12
            p.x *= 0.9
            p.z = CAP_C.z + (p.z - CAP_C.z) * 0.9
        v.co = p
        v[g.gu], v[g.gv], v[g.k] = math.atan2(d.x, d.z) * 0.11, p.y, 0.0
    return g


def hair_lock(gm, gt, p0, d0, L, w, th, bend, k, margin, split=0.62, radial=6):
    """One pointed lock: an ellipse swept from p0 along d0, bending by `bend`, lying on the hair
    volume (never closer than `margin`), widest a quarter of the way down. Its root stretch goes to
    gm (the dark mass), the tip stretch to gt (the lighter tips)."""
    d0 = d0.normalized()

    def path(t):
        p = p0 + d0 * (L * t) + bend * (L * t * t)
        return cap_push(p, lerp(-0.06, margin, clamp01(t / 0.22)))

    state = {'S': None}

    def ring(s, t):
        p = path(t)
        T = path(min(1.0, t + 0.04)) - path(max(0.0, t - 0.04))
        T.normalize()
        S = T.cross(cap_out(p))
        if S.length < 0.25 and state['S'] is not None:
            S = state['S'] - T * state['S'].dot(T)
        if S.length < 1e-6:
            S = T.cross(Vector((0, 1, 0)))
        S.normalize()
        state['S'] = S
        N = S.cross(T)
        f = min(1.0, 0.45 + 2.2 * t) * (max(0.0, 1 - t) ** 0.75)
        a = s * TAU
        co = p + S * (math.cos(a) * w * f) + N * (math.sin(a) * max(th * f, 0.0))
        return (co, (a - math.pi) * max(w, 0.02), t * L)

    gm.grid(radial, 4, ring, k=k, flip=True, closed=True, ts=[split * j / 4 for j in range(5)])
    gt.grid(radial, 3, ring, k=k, flip=True, closed=True, ts=[lerp(split, 1.0, j / 3) for j in range(4)])


def build_hair():
    rnd = random.Random(7)
    R = lambda a, b: rnd.uniform(a, b)
    geos = {c['name']: (Geo(), Geo()) for c in HAIR_CLUSTERS}
    count = {c['name']: 0 for c in HAIR_CLUSTERS}
    Y = Vector((0, 1, 0))

    def add(cluster, az, el, side, lift, L, w, th, flick, margin, up=0.0, lines=None):
        """A lock rooted at (az, el) on the hair volume, flowing DOWN the head (away from the whorl),
        swept `side` round it, lifting off by `lift`; the tip flicks outward by `flick` (and up)."""
        p0 = cap_point(az, el)
        O = cap_out(p0)
        H = Vector((math.sin(az), 0, math.cos(az)))  # level, away from the head's axis
        Sd = Vector((math.cos(az), 0, -math.sin(az)))  # level, round the head (toward +az)
        Td = Vector((math.sin(az) * math.sin(el) * CAP_R.x, -math.cos(el) * CAP_R.y, math.cos(az) * math.sin(el) * CAP_R.z))
        Td.normalize()
        d0 = Td + Sd * side + O * lift
        bend = H * flick + Y * up
        n = count[cluster]
        count[cluster] += 1
        gm, gt = geos[cluster]
        k = (1 if n % 4 == 1 else 0) if lines is None else (1 if lines else 0)
        hair_lock(gm, gt, p0, d0, L, w, th, bend, k, margin)

    def side_of(az):
        a = (az + math.pi) % TAU - math.pi
        if abs(a) > 1.95:
            return 'nape'
        return 'left' if a > 0 else 'right'

    front = lambda az: abs((az + math.pi) % TAU - math.pi)

    # crown: short chunky locks radiating from the whorl, their tips kicking up: the spiky top outline
    n = 9
    for i in range(n):
        az = TAU * (i + R(-0.3, 0.3)) / n
        add('crown', az, R(1.0, 1.3), R(-0.5, 0.5), 0.1, R(0.07, 0.095), R(0.034, 0.044), 0.014, R(0.0, 0.15), R(0.03, 0.07), up=R(0.0, 0.2))
    # the layer below: bigger locks over the sides and the back, the tips flicking out
    n = 11
    for i in range(n):
        az = TAU * (i + 0.5 + R(-0.3, 0.3)) / n
        if front(az) < 0.6:
            continue  # the fringe's place
        add(side_of(az) if rnd.random() < 0.6 else 'crown', az, R(0.55, 0.85), R(-0.45, 0.45), 0.04, R(0.085, 0.11), R(0.036, 0.048), 0.015,
            R(0.1, 0.3), R(0.03, 0.07), up=R(0.0, 0.1))
    # sides and nape: locks over the ears and down to the collar, the tips flicking out
    n = 13
    for i in range(n):
        az = lerp(0.8, TAU - 0.8, (i + R(-0.25, 0.25) + 0.5) / n)
        back = front(az) > 1.95
        add(side_of(az), az, R(0.15, 0.45), R(-0.35, 0.35), 0.05, R(0.1, 0.13) if back else R(0.085, 0.11), R(0.034, 0.046), 0.015,
            R(0.15, 0.35), R(0.0, 0.05), up=R(0.0, 0.08))
    # fringe: locks down over the forehead to the brow, the middle ones to the eyes; the face shows below
    n = 8
    for i in range(n):
        u = (i + R(-0.2, 0.2)) / (n - 1) * 2 - 1
        mid = 1 - abs(u)
        add('fringe', u * 1.0, R(0.6, 0.78), -u * 0.3 + R(-0.2, 0.2), 0.0, lerp(0.075, 0.1, mid) + R(-0.008, 0.01),
            R(0.03, 0.04), 0.012, R(-0.45, -0.3), R(0.06, 0.09), lines=(i % 3 == 1))
    # wisps: thin stray locks breaking the outline
    for i in range(14):
        az = R(0, TAU)
        el = R(0.0, 1.25)
        if front(az) < 0.75 and el < 0.7:
            continue
        add('crown' if el > 0.8 else side_of(az), az, el, R(-0.7, 0.7), 0.4, R(0.04, 0.07), R(0.011, 0.016), 0.007, R(0.3, 0.6), 0.0,
            up=R(0.1, 0.5), lines=False)

    emit('hair.cap', hair_cap(), sharp=80)
    for c in HAIR_CLUSTERS:
        gm, gt = geos[c['name']]
        piv = Vector(c['pivot'])
        emit(f"hair.{c['name']}.mass", gm.translate(-piv), sharp=70)
        emit(f"hair.{c['name']}.tip", gt.translate(-piv), sharp=70)


# (the collar, the lapels, the blades, the half-cape and the pauldron were the old hero outfits'
# parts; they went with those outfits on 2026-11-17. The hair stays.)


# ------------------------------------------------------------------ run
build_hair()

lines = [
    '// GENERATED by scripts/blender/build-hero-parts.mjs (scripts/blender/hero_parts.py, Blender '
    + bpy.app.version_string + '). Do not edit.',
    '// The hero\'s sculpted parts as packed vertex data: n vertices; base64 little-endian p = Int16',
    '// positions / 8192 m, nrm = Int8 normals / 127, uv = Int16 aGUV / 8192, k = Uint8 aPart / 200,',
    '// i = Uint16 triangle indices. Decoded by model.js partGeometry().',
    'export const HERO_PARTS = {',
]
tv = tt = 0
for name in sorted(PARTS):
    P = PARTS[name]
    tv += P['n']
    tt += P['tris']
    lines.append(f"  '{name}': {{ n: {P['n']}, p: '{P['p']}', nrm: '{P['nrm']}', uv: '{P['uv']}', k: '{P['k']}', i: '{P['i']}' }},")
lines.append('};')
with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write('\n'.join(lines) + '\n')
print(f'HERO_PARTS: {len(PARTS)} parts, {tv} vertices, {tt} triangles -> {OUT}')
for name in sorted(PARTS):
    print(f"  {name}: {PARTS[name]['n']} v, {PARTS[name]['tris']} t")
