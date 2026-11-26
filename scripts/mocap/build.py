"""Build the clips of a spec, write the clip-set module and the pair sheets. Light work once the takes are
tracked (track.py, under the lock); it says so when a take is not.

  python -I build.py specs/<set>.json [clip ...] [--no-sheets] [--no-export]

For every clip (or only the named ones): build it (takes -> fuse -> retarget -> clean), save the result
under <WORK>/built/<set>/, draw its pair sheet <WORK>/sheets/<set>/<clip>.jpg, then write the set module
(spec "out") from every built clip of the set, in the spec's order, and run the checker on it."""
import os, sys, subprocess, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mlib import cfg, clip as C, view, export  # noqa: E402


def main(a):
    sheets = '--no-sheets' not in a
    do_export = '--no-export' not in a
    a = [x for x in a if not x.startswith('--')]
    spec = cfg.load_spec(a[0])
    want = set(a[1:])
    sid = spec['set']
    logp = os.path.join(cfg.workdir('built', sid), 'build.log')
    logf = open(logp, 'a', encoding='utf-8')

    def log(s):
        print(s)
        logf.write(s + '\n')
    log('== %s %s' % (sid, time.strftime('%Y-%m-%d %H:%M:%S')))
    for c in spec['clips']:
        if want and c['name'] not in want:
            continue
        t = time.time()
        log('clip %s (%s)' % (c['name'], c.get('kind', 'oneshot')))
        B, Ts = C.build_clip(spec, c, log)
        C.save(B, sid)
        if sheets:
            out = os.path.join(cfg.workdir('sheets', sid), c['name'] + '.jpg')
            view.pair_sheet(B, Ts, out, frames=c.get('sheet_frames'), k=c.get('sheet_k', 8),
                            title='%s  %s  (%d frames @ %d fps%s)' % (c['name'], c.get('src', ''), len(B.q), B.fps,
                                                                     ', loop' if B.loop else ''))
            log('  sheet ' + out)
        log('  built in %.1f s' % (time.time() - t))
    if do_export:
        path = export.write_set(spec, log)
        node = 'node'
        r = subprocess.run([node, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'check.mjs'), path],
                           capture_output=True, text=True)
        log(r.stdout.strip())
        if r.returncode:
            log(r.stderr.strip())
            log('CHECK FAILED')
            sys.exit(1)


if __name__ == '__main__':
    main(sys.argv[1:])
