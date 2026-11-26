"""Track the takes of a spec (or one span) into the landmark cache. HEAVY: run it under the lock.

  python -I track.py specs/<set>.json [clip ...] [--budget 420]
  python -I track.py <film> <t0> <t1> [--box x y w h] [--budget 420] [--forget]

It tracks only frames not yet in the cache and stops after --budget seconds (default 7 min, under the
lock's 8-minute rule); run it again until it prints `0 frames left`."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mlib import cfg, track  # noqa: E402


def main(a):
    budget = 420.0
    if '--budget' in a:
        i = a.index('--budget')
        budget = float(a[i + 1])
        del a[i:i + 2]
    forget = '--forget' in a
    a = [x for x in a if x != '--forget']
    box = None
    if '--box' in a:
        i = a.index('--box')
        box = [float(v) for v in a[i + 1:i + 5]]
        del a[i:i + 5]
    if a[0].endswith('.json'):
        spec = cfg.load_spec(a[0])
        want = set(a[1:])
        jobs = []
        for c in spec['clips']:
            if want and c['name'] not in want:
                continue
            for tk in c['takes']:
                jobs.append((tk.get('film', c.get('film', spec.get('film'))), cfg.parse_time(tk['t0']) - 0.3,
                             cfg.parse_time(tk['t1']) + 0.3, tk.get('box')))
        for tk in spec.get('extra_tracks', []):
            jobs.append((tk['film'], cfg.parse_time(tk['t0']), cfg.parse_time(tk['t1']), tk.get('box')))
    else:
        jobs = [(a[0], cfg.parse_time(a[1]), cfg.parse_time(a[2]), box)]
        if forget:  # drop the span's cached frames first (after a tracking fix, or a bad crop)
            track.forget(*jobs[0][:3])
    import time
    t_start = time.time()
    left = 0
    for film, t0, t1, bx in jobs:
        rem = budget - (time.time() - t_start)
        if rem < 5:
            left += len(cfg.frames_in(film, t0, t1)[0]) - len(track.load_cache(film, t0, t1))
            continue
        left += track.track_span(film, t0, t1, bx, budget=rem)
    print('%d frames left' % left)


if __name__ == '__main__':
    main(sys.argv[1:])
