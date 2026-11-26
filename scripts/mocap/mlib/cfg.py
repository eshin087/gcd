"""Paths, frame lists and spec loading for the mocap pipeline.

The footage and every working file live OUTSIDE the repository (reference frames are never committed).
Two folders, from the environment or the defaults below:
  MOCAP_REF   the frames: <REF>/<film>/t<seconds>.jpg (film = 'move' | 'sword')
  MOCAP_WORK  the work folder: cache/ (tracked landmarks), built/ (per-clip results), sheets/ ...
"""
import os, glob, json, bisect

_SCRATCH = 'E:/Vibe Coding/.claude-temp/claude/148948b5eaa20cf5/4b3d9810-4084-4115-b2cf-affa2f976f74/scratchpad'
REF = os.environ.get('MOCAP_REF', _SCRATCH + '/ref2')
WORK = os.environ.get('MOCAP_WORK', _SCRATCH + '/h2/mocap')
MODEL = os.environ.get('MOCAP_MODEL', _SCRATCH + '/models/pose_landmarker_heavy.task')
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))

_frames = {}


def frames(film):
    """Sorted (times, paths) of a film's frames. The capture drops frames now and then, so frame times are
    NOT a regular grid: always resample by time."""
    if film not in _frames:
        fs = glob.glob(os.path.join(REF, film, 't*.jpg'))
        ts = sorted((float(os.path.basename(f)[1:-4]), f) for f in fs)
        _frames[film] = ([t for t, _ in ts], [f for _, f in ts])
    return _frames[film]


def frames_in(film, t0, t1):
    ts, fs = frames(film)
    a = bisect.bisect_left(ts, t0 - 1e-4)
    b = bisect.bisect_right(ts, t1 + 1e-4)
    return ts[a:b], fs[a:b]


def frame_at(film, t):
    """The path of the frame nearest time t."""
    ts, fs = frames(film)
    i = bisect.bisect_left(ts, t)
    if i > 0 and (i == len(ts) or abs(ts[i - 1] - t) <= abs(ts[i] - t)):
        i -= 1
    return ts[i], fs[i]


def parse_time(v):
    """'1:41.5' or 101.5 -> seconds."""
    if isinstance(v, (int, float)):
        return float(v)
    v = str(v).strip()
    if ':' in v:
        m, s = v.split(':')
        return int(m) * 60 + float(s)
    return float(v)


def fmt_time(t):
    return '%d:%05.2f' % (t // 60, t % 60)


def load_spec(path):
    with open(path, encoding='utf-8') as f:
        spec = json.load(f)
    spec['_path'] = os.path.abspath(path)
    return spec


def workdir(*parts):
    p = os.path.join(WORK, *parts)
    os.makedirs(p, exist_ok=True)
    return p
