"""Builds the game's background music (assets/audio/music/) from CC0 tracks on OpenGameArt (ADR-117).

    python scripts/audio/build-music.py --src <dir> [--fetch] [--only name,name]

--src   a folder holding one sub-folder per OpenGameArt page (its slug) with the page's files in it.
        --fetch downloads the pages listed in SOURCES into it first (~0.4 GB, mostly lossless sources).
Needs ffmpeg on PATH. Each track is trimmed of leading silence, loudness-normalised (two-pass
EBU R128, linear) and encoded as stereo MP3. The picks are the owner's, from the score audition page;
to change one, edit TRACKS (and src/audio/trackList.js), run this again, and regenerate the credits
in assets/audio/CREDITS.md.
"""
import argparse, json, os, re, shutil, subprocess, sys, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'audio', 'music')

# output name -> source file under --src, integrated loudness target (LUFS). Exploring tracks sit
# 3 dB under the fights, as the synthesised score did.
TRACKS = {
    'cinder-explore': ('creepy-forest-f/forest.ogg', -21),
    'cinder-p1': ('dark-intro/Dark Intro_0.ogg', -18),
    'cinder-p2': ('inside-the-overlords-domain/Creepy Dungeon.flac', -18),
    'cinder-p3': ('ancient-grudge/ruskerdax_-_ancient_grudge.mp3', -18),
    'ash-explore': ('ambience-of-a-fallen-age/ruins_of_an_ancient_culture_.wav', -21),
    'ash-p1': ('hunted-by-the-evil/hunted_by_evil.wav', -18),
    'ash-p2': ('bosskoto/boss_koto.mp3', -18),
    'starless-explore': ('ambience-of-a-fallen-age/the_abyss.wav', -21),
    'starless-p1': ('zodik-deep-choir/zodik_-_deep_choir.mp3', -18),
    'starless-p2': ('dramatic-boss-encounter/Heavy Concept A Bass Master.wav', -18),
    'starless-p3': ('final-stand-0/final_stand_phase_3.3.piano__0.ogg', -18),
    'starless-p4': ('fall-of-nightmares-epic-orchestral/Fall of Nightmares [orchestral]_mastered.wav', -18),
    'victory': ('victory-fanfare-short/Heavy_ConceptB.wav', -18),
    'death': ('death-of-a-ninja-game-over/Death of a Ninja (Game Over).mp3', -18),
}
SOURCES = sorted({p.split('/')[0] for p, _ in TRACKS.values()})


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(' '.join(cmd[:6]) + '...\n' + r.stderr[-1500:])
    return r


def build(name, path, lufs, src):
    p = os.path.join(src, path)
    head = 'silenceremove=start_periods=1:start_threshold=-60dB'
    m = run(['ffmpeg', '-hide_banner', '-i', p, '-af', f'{head},loudnorm=I={lufs}:TP=-1.5:LRA=14:print_format=json', '-f', 'null', '-']).stderr
    j = json.loads(m[m.rindex('{'):m.rindex('}') + 1])
    ln = (f"loudnorm=I={lufs}:TP=-1.5:LRA=14:linear=true:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
          f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}")
    out = os.path.join(OUT, name + '.mp3')
    run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-af', f'{head},{ln},aresample=44100', '-ac', '2',
         '-c:a', 'libmp3lame', '-q:a', '6', out])
    return out


def fetch(src):
    for slug in SOURCES:
        d = os.path.join(src, slug)
        if os.path.isdir(d) and os.listdir(d):
            continue
        os.makedirs(d, exist_ok=True)
        req = urllib.request.Request('https://opengameart.org/content/' + slug, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf8', 'replace')
        for u in re.findall(r'<a href="(https://opengameart.org/sites/default/files/[^"]+)" type="[^"]*length=\d+"', html):
            dst = os.path.join(d, urllib.parse.unquote(u.rsplit('/', 1)[1]))
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})) as r, open(dst, 'wb') as f:
                shutil.copyfileobj(r, f)
        print('fetched', slug)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--fetch', action='store_true')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    if a.fetch:
        fetch(a.src)
    only = set(filter(None, a.only.split(',')))
    os.makedirs(OUT, exist_ok=True)
    fails = 0
    for name, (path, lufs) in TRACKS.items():
        if only and name not in only:
            continue
        try:
            out = build(name, path, lufs, a.src)
            print(f'{name:17s} {os.path.getsize(out) // 1024:6d} KB')
        except Exception as e:
            fails += 1
            print(f'FAIL {name}: {e}', file=sys.stderr)
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
