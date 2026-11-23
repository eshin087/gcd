"""Builds the recorded attack sounds and blue / red cues (assets/audio/sfx/) from CC0 clips on OpenGameArt.

    python scripts/audio/build-sfx.py --picks <picks.json> --manifest <manifest.json> [--cand <dir>]

--picks     JSON: { "<slot>": [ <entry>, ... ], ... } in play order. An entry is a manifest `file` (a
            string) or { "file": ..., "gain_db": n } (a nudge on top of the slot's loudness match).
            The picks file is the whole truth: every slot it does not list ends up with no file (its
            synth fallback plays). Slots: see src/audio/sampleList.js SLOTS.
--manifest  the sourcing manifest: a list (or { "entries": [...] }) of { file, slot, source_page,
            source_file, author, licences_listed, licence_check, start_s, dur_s, peak_db, rms_db,
            centroid_hz, note, peak_ms / onset_ms }. `file` is the candidate clip (a WAV), absolute or
            relative to --cand (default: the manifest's folder, then its cand/<slot>/).

Needs ffmpeg on PATH, numpy. For each picked clip: decoded to mono 44.1 kHz, head and tail silence
trimmed, a 6 ms fade at the end, loudness-matched inside its slot (the loudest 100 ms window's RMS to
the slot's target, the peak kept under -1 dBFS), encoded as mono MP3 to assets/audio/sfx/<slot>-<n>.mp3
(n from 1, in pick order). It then writes src/audio/sampleFiles.js (each file and its peak_ms: ms from
the first audible sample to the loudest 5 ms, which the audio lines up with a blow's impact) and the
"Attack sounds" table of assets/audio/CREDITS.md (the music table above it is kept as it is).
A clip whose licences_listed / licence_check do not say CC0 is refused. The manifest may also be
{ "slots": { "<slot>": [entry, ...] } } (each slot's candidates, best first).

A provisional picks file (the first `n` candidates of every slot the game has) for testing:
    python scripts/audio/build-sfx.py --manifest <manifest.json> --first 2 --write-picks <picks.json>
"""
import argparse, glob, json, os, subprocess, sys, tempfile, wave

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'audio', 'sfx')
FILES_JS = os.path.join(ROOT, 'src', 'audio', 'sampleFiles.js')
CREDITS = os.path.join(ROOT, 'assets', 'audio', 'CREDITS.md')
SR = 44100
SLOTS = ['cue-blue', 'cue-red', 'time-blue', 'time-red', 'sword-light', 'sword-heavy', 'sword-thrust',
         'sword-draw', 'fist-light', 'fist-heavy', 'beast-claw', 'beast-tail']
# the loudest 100 ms window's RMS (dBFS) each slot is matched to: cues sit a little over the blows (the
# per-slot gain in sampleList.js does the rest in the game)
TARGET = {'cue-blue': -16, 'cue-red': -16, 'time-blue': -16, 'time-red': -16}
TARGET_DEFAULT = -18
PEAK_MAX = -1.0  # dBFS
HEAD_DB = -50.0  # head / tail silence: under this (dBFS, 5 ms RMS) relative to nothing: absolute
FADE = 0.006
CREDITS_HEAD = '## Attack sounds'
WHAT = {
    'cue-blue': 'Blue warning (a parry blow: its windup starts)', 'cue-red': 'Red warning (a dodge blow: its windup starts)',
    'time-blue': 'Blue timing (just before a parry blow lands)', 'time-red': 'Red timing (just before a dodge blow lands)',
    'sword-light': 'A sword cut through the air', 'sword-heavy': 'A heavy sword cut', 'sword-thrust': 'A sword thrust',
    'sword-draw': 'A draw (the Sheathed)', 'fist-light': 'A fist through the air', 'fist-heavy': 'A heavy fist or a kick',
    'beast-claw': "The wyrm's claws", 'beast-tail': "The wyrm's tail / body sweeps",
}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(' '.join(cmd[:6]) + '...\n' + r.stderr[-1500:])
    return r


def load_manifest(path):
    with open(path, encoding='utf-8') as f:
        m = json.load(f)
    if isinstance(m, dict) and isinstance(m.get('slots'), dict):
        # { slots: { <slot>: [entry, ...] } } (each slot's candidates, best first)
        items = [dict(e, slot=e.get('slot', slot)) for slot, l in m['slots'].items() for e in l if isinstance(e, dict)]
    else:
        items = m.get('entries', m) if isinstance(m, dict) else m
        if isinstance(items, dict):
            items = [dict(v, file=v.get('file', k)) for k, v in items.items()]
    return {e['file']: e for e in items if isinstance(e, dict) and e.get('file')}


def is_cc0(e):
    listed = e.get('licences_listed') or []
    if isinstance(listed, str):
        listed = [listed]
    return any('cc0' in str(x).lower() for x in listed) or 'cc0' in str(e.get('licence_check', '')).lower()


def resolve(entry, cand, slot):
    f = entry['file']
    for p in (f, os.path.join(cand, f), os.path.join(cand, 'cand', slot, f), os.path.join(cand, 'cand', entry.get('slot', slot), f),
              os.path.join(cand, 'cand', slot, os.path.basename(f))):
        if os.path.isfile(p):
            return p
    raise FileNotFoundError(f)


def decode(path):
    """Mono float32 at SR."""
    with tempfile.TemporaryDirectory() as td:
        tmp = os.path.join(td, 'x.wav')
        run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_s16le', tmp])
        with wave.open(tmp, 'rb') as w:
            a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    return a


def env5(a):
    """5 ms RMS envelope, one value per sample (centred)."""
    n = max(1, int(SR * 0.005))
    k = np.ones(n, dtype=np.float32) / n
    return np.sqrt(np.convolve(a * a, k, mode='same') + 1e-12)


def db(x):
    return 20 * np.log10(max(float(x), 1e-9))


def trim(a):
    e = env5(a)
    thr = 10 ** (HEAD_DB / 20)
    on = np.nonzero(e > thr)[0]
    if not len(on):
        raise ValueError('silent clip')
    i0 = max(0, on[0] - int(SR * 0.002))
    i1 = min(len(a), on[-1] + int(SR * 0.02))
    a = a[i0:i1].copy()
    nf = min(len(a), int(SR * FADE))
    if nf > 1:
        a[-nf:] *= np.linspace(1, 0, nf, dtype=np.float32)
    return a


def loud(a):
    """The loudest 100 ms window's RMS (linear)."""
    n = min(len(a), int(SR * 0.1))
    k = np.ones(n, dtype=np.float32) / n
    return float(np.sqrt(np.max(np.convolve(a * a, k, mode='valid')) + 1e-12))


def write_wav(path, a):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes())


def build_slot(slot, picks, man, cand):
    target = TARGET.get(slot, TARGET_DEFAULT)
    clips = []
    for p in picks:
        name = p if isinstance(p, str) else p.get('file')
        nudge = 0.0 if isinstance(p, str) else float(p.get('gain_db', 0) or 0)
        e = man.get(name)
        if e is None:
            raise KeyError(f'{slot}: {name} is not in the manifest')
        if not is_cc0(e):
            raise ValueError(f'{slot}: {name}: neither licences_listed nor licence_check says CC0')
        a = trim(decode(resolve(e, cand, slot)))
        g = 10 ** ((target + nudge - db(loud(a))) / 20)
        pk = float(np.max(np.abs(a))) * g
        if pk > 10 ** (PEAK_MAX / 20):
            g *= 10 ** (PEAK_MAX / 20) / pk
        a = a * g
        clips.append((e, a))
    out = []
    with tempfile.TemporaryDirectory() as td:
        for n, (e, a) in enumerate(clips, 1):
            fn = f'{slot}-{n}.mp3'
            tmp = os.path.join(td, f'{n}.wav')
            write_wav(tmp, a)
            run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-q:a', '4', os.path.join(OUT, fn)])
            peak_ms = int(round(1000 * int(np.argmax(env5(a))) / SR))
            out.append({'file': f'sfx/{fn}', 'peak_ms': peak_ms, 'dur_ms': int(round(1000 * len(a) / SR)), 'src': e})
    return out


def write_files_js(built):
    lines = [
        '// GENERATED by scripts/audio/build-sfx.py: do not edit by hand (rerun the script after a new pick).',
        '// The recorded attack sounds on disk (assets/audio/sfx/<slot>-<n>.mp3): per slot, its files in order,',
        '// and each file\'s peak_ms (ms from the first audible sample to the loudest moment: the audio lines',
        '// that up with the blow\'s impact). A slot with no file plays its synth fallback.',
        '',
        'export const SAMPLE_FILES = {',
    ]
    for slot in SLOTS:
        if slot not in built:
            continue
        items = ', '.join(f"{{ file: '{x['file'][4:]}', peak_ms: {x['peak_ms']} }}" for x in built[slot])
        lines.append(f"  '{slot}': [{items}],")
    lines.append('};')
    with open(FILES_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


def md(s):
    return str(s or '').replace('|', '\\|').replace('\n', ' ').strip()


def write_credits(built):
    with open(CREDITS, encoding='utf-8') as f:
        text = f.read()
    i = text.find(CREDITS_HEAD)
    head = (text[:i] if i >= 0 else text).rstrip() + '\n'
    rows = []
    for slot in SLOTS:
        for x in built.get(slot, []):
            e = x['src']
            page = e.get('source_page', '')
            title = e.get('page_title') or e.get('source_title') or page.rstrip('/').rsplit('/', 1)[-1]
            sound = f'[{md(title)}]({page})' if page else md(title)
            if e.get('source_file'):
                sound += f" ({md(os.path.basename(str(e['source_file'])))})"
            rows.append(f"| {WHAT.get(slot, slot)} | {sound} | {md(e.get('author'))} | CC0 1.0 | `{x['file']}` |")
    body = [
        '',
        CREDITS_HEAD,
        '',
        'The attack sounds and the blue / red cues are recorded one-shots from OpenGameArt.org, used under',
        '**CC0 1.0**. The owner picks them by ear; `scripts/audio/build-sfx.py` trims, loudness-matches and',
        'encodes them into `assets/audio/sfx/` (the game plays its synth sounds for any slot without a file).',
        '',
        '| Plays as | Sound (OpenGameArt) | Posted by | Licence | File |',
        '|---|---|---|---|---|',
        *rows,
    ]
    if not rows:
        body.append('| (none yet: every slot plays its synth sound) | | | | |')
    with open(CREDITS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(head + '\n'.join(body) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--picks')
    ap.add_argument('--first', type=int, default=0, help='no --picks: take the first N candidates of each slot')
    ap.add_argument('--write-picks', default=None, help='with --first: also save those picks as a picks file')
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--cand', default=None)
    a = ap.parse_args()
    man = load_manifest(a.manifest)
    cand = a.cand or os.path.dirname(os.path.abspath(a.manifest))
    if a.picks:
        with open(a.picks, encoding='utf-8') as f:
            picks = json.load(f)
    elif a.first > 0:
        picks = {}
        for e in man.values():
            sl = e.get('slot')
            if sl in SLOTS and len(picks.setdefault(sl, [])) < a.first:
                picks[sl].append(e['file'])
        if a.write_picks:
            with open(a.write_picks, 'w', encoding='utf-8', newline='\n') as f:
                json.dump({sl: picks[sl] for sl in SLOTS if sl in picks}, f, indent=2)
                f.write('\n')
    else:
        sys.exit('--picks or --first N')
    bad = [s for s in picks if s not in SLOTS]
    if bad:
        sys.exit(f'unknown slots: {bad}')
    os.makedirs(OUT, exist_ok=True)
    built, fails = {}, 0
    for slot in SLOTS:
        if not picks.get(slot):
            continue
        try:
            built[slot] = build_slot(slot, picks[slot], man, cand)
        except Exception as e:
            fails += 1
            print(f'FAIL {slot}: {e}', file=sys.stderr)
    if fails:
        sys.exit(1)
    # the picks are the whole truth: files of slots no longer picked go
    keep = {os.path.basename(x['file']) for l in built.values() for x in l}
    for p in glob.glob(os.path.join(OUT, '*.mp3')):
        if os.path.basename(p) not in keep:
            os.remove(p)
    write_files_js(built)
    write_credits(built)
    for slot, l in built.items():
        print(f"{slot:13s} " + '  '.join(f"{os.path.basename(x['file'])} {x['dur_ms']}ms peak {x['peak_ms']}ms" for x in l))


if __name__ == '__main__':
    main()
