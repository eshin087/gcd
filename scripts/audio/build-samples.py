"""Builds the game's sample files (assets/audio/) from CC0 packs on OpenGameArt (ADR-117).

    python scripts/audio/build-samples.py --src <dir> [--fetch] [--only name,name]

--src   a folder holding one sub-folder per OpenGameArt page (its slug), with the page's files
        extracted in it (archives unpacked). --fetch downloads and unpacks the packs listed in
        SOURCES first (about 0.5 GB; needs the Windows / libarchive `tar` for .7z).
Needs ffmpeg + ffprobe on PATH. Every pick is a recipe of layers cut from those files: trimmed,
varispeed-pitched, filtered, faded, delayed, mixed, peak-normalised, then encoded as MP3 (mono 44.1 kHz
for sounds; music and beds are loudness-normalised stereo). Edit a recipe and run it again to retune;
assets/audio/CREDITS.md lists every source page, author and licence (all CC0).
"""
import argparse, array, json, os, re, subprocess, sys, tempfile, urllib.request, urllib.parse, shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'audio')

# --- sources: the OpenGameArt pages (slugs) the recipes cut from; assets/audio/CREDITS.md names their
# authors and licences (all CC0; regenerate it when a recipe takes a new source).
SOURCES = [
    'rpg-sound-pack',
    '50-rpg-sound-effects',
    'interface-sounds',
    'swish-bamboo-stick-weapon-swhoshes',
    'wind-hit-time-morph',
    '80-cc0-rpg-sfx',
    '75-cc0-breaking-falling-hit-sfx',
    '80-cc0-creture-sfx-2',
    '100-cc0-sfx',
    '25-cc0-bang-firework-sfx',
    'fantasy-sound-effects-tinysized-sfx',
    'fantasy-weapons-and-apparel-sfx-library',
    'medieval-sound-effects-weapon-impacts',
    '37-hitspunches',
    '35-wooden-crackshitsdestructions',
    'deep-bone-crackbreak-sfx',
    'fleshy-bone-breaksnap-sfx',
    'big-scary-troll-sounds',
    'cc0-deep-monster-roar',
    'monster-sound-effects-2',
    'monster-snarls',
    'large-wings-flap',
    'mech-stomp-step-sound',
    'muffled-distant-explosion',
    'earthquake-and-open-sesame',
    'cave-in',
    'chunky-explosion',
    'fireball-1',
    'synthesized-explosion',
    'catching-fire',
    'fantozzis-footsteps-grasssand-stone',
    '15-vocal-male-strainhurtpainjump-sounds',
    'cure-magic',
    '3-dark-magic-spells',
    'bell-dingschimes',
    '4-metal-dingsrings',
    'various-sound-effects-0',
    'crickets-ambient-noise-loopable',
    'wind',
    'loopable-dungeon-ambience',
    'dark-forest-theme',
    'boss-battle-music',
    'determined-pursuit-epic-orchestra-loop',
    'oriented',
    'bosskoto',
    'ninja-theme',
    'dark-shrine-loop',
    'epic-endgame-cinematic',
    'battle-theme-a',
    'victory-fanfare-short',
    'death-of-a-ninja-game-over',
]


def L(path, start=0.0, dur=None, gain=0.0, rate=1.0, hp=None, lp=None, at=0.0, fin=0.002, fout=0.03, on=-24):
    """One layer: `path` under --src, cut [start, start+dur] (source seconds), varispeed `rate`
    (0.8 = a fifth lower-ish and slower), filters, fades, delayed `at` s in the mix, `gain` dB. The layer
    starts at its first moment within `on` dB of its own peak (a punch: -8, to skip the swing before it)."""
    return dict(path=path, start=start, dur=dur, gain=gain, rate=rate, hp=hp, lp=lp, at=at, fin=fin, fout=fout, on=on)


MED = 'medieval-sound-effects-weapon-impacts/'
RPG = 'rpg-sound-pack/RPG Sound Pack/'
KEN = '50-rpg-sound-effects/OGG/'
UI = 'interface-sounds/Audio/'
BAM = 'swish-bamboo-stick-weapon-swhoshes/'
HIT = '37-hitspunches/hits/'
BRK = '75-cc0-breaking-falling-hit-sfx/'
TINY = 'fantasy-sound-effects-tinysized-sfx/sfx-cc0/'
SKC = 'fantasy-weapons-and-apparel-sfx-library/sfx/'
FAN = 'fantozzis-footsteps-grasssand-stone/Fantozzi-footsteps/flac/'
TROLL = 'big-scary-troll-sounds/troll-roars_0.ogg'
DEEP = 'cc0-deep-monster-roar/monster_roar.wav'
SNARL = 'monster-snarls/monster-snarl-attack.ogg'

# --- one-shot sounds: output name -> layers (mixed, then peak-normalised to -1 dBFS) ------------
SFX = {
    # the hero's blade through the air
    'swing-l-1': [L(RPG + 'battle/swing.wav', hp=180), L(BAM + 'swosh-26.flac', rate=1.25, hp=260, gain=-4, fout=0.08)],
    'swing-l-2': [L(RPG + 'battle/swing2.wav', hp=180), L(BAM + 'swosh-11.flac', rate=1.3, hp=260, gain=-4, fout=0.08)],
    'swing-l-3': [L(RPG + 'battle/swing3.wav', hp=180), L(BAM + 'swosh-19.flac', rate=1.25, hp=260, gain=-4, fout=0.08)],
    'swing-l-4': [L(BAM + 'swosh-26.flac', rate=1.15, hp=260, fout=0.08)],
    'swing-h-1': [L(BAM + 'swosh-15.flac', rate=0.88, hp=90, fout=0.1)],
    'swing-h-2': [L(BAM + 'swosh-11.flac', rate=0.85, hp=90, fout=0.1)],
    'swing-h-3': [L(BAM + 'swosh-39.flac', rate=0.9, hp=90, fout=0.12)],
    'thrust-1': [L('wind-hit-time-morph/60009__qubodup__swosh_22.flac', hp=200, fout=0.06)],
    'thrust-2': [L(BAM + 'swosh-04.flac', rate=1.1, hp=200)],
    # the blade biting (the 'cut' layer over every landed hit)
    'cut-l-1': [L(KEN + 'knifeSlice.ogg', dur=0.4, hp=400, fout=0.1)],
    'cut-l-2': [L(KEN + 'knifeSlice2.ogg', dur=0.4, hp=400, fout=0.1)],
    'cut-l-3': [L('80-cc0-rpg-sfx/blade_01.ogg', hp=400)],
    'cut-l-4': [L('80-cc0-rpg-sfx/blade_02.ogg', hp=400)],
    'cut-h-1': [L(TINY + 'apple-cut-01.wav', rate=0.8, hp=150), L(on=-8, path=HIT + 'hit07.mp3.flac', gain=-6, dur=0.5)],
    'cut-h-2': [L(TINY + 'apple-cut-02.wav', rate=0.8, hp=150), L(on=-8, path=HIT + 'hit22.mp3.flac', gain=-6, dur=0.5)],
    'cut-h-3': [L(TINY + 'apple-cut-03.wav', rate=0.8, hp=150), L(on=-8, path=HIT + 'hit27.mp3.flac', gain=-6, dur=0.5)],
    # a blow landing on a body: scales (the wyrm) or cloth (the duelists)
    'hit-s-1': [L(on=-8, path=HIT + 'hit07.mp3.flac', dur=0.6, fout=0.15)],
    'hit-s-2': [L(on=-8, path=HIT + 'hit22.mp3.flac', dur=0.6, fout=0.15)],
    'hit-s-3': [L(on=-8, path=HIT + 'hit27.mp3.flac', dur=0.6, fout=0.15)],
    'hit-c-1': [L(on=-8, path=HIT + 'hit12.mp3.flac', dur=0.5, fout=0.12)],
    'hit-c-2': [L(on=-8, path=HIT + 'hit17.mp3.flac', dur=0.5, fout=0.12)],
    'hit-c-3': [L(on=-8, path=HIT + 'hit18.mp3.flac', dur=0.5, fout=0.12)],
    # the hero is hurt: a body blow and a strained breath
    'hurt-1': [L(on=-8, path=HIT + 'hit20.mp3.flac', dur=0.5, fout=0.1), L('15-vocal-male-strainhurtpainjump-sounds/slightscream-03.flac', gain=-7, at=0.02)],
    'hurt-2': [L(on=-8, path=HIT + 'hit21.mp3.flac', dur=0.5, fout=0.1), L('15-vocal-male-strainhurtpainjump-sounds/slightscream-08.flac', gain=-7, at=0.02)],
    'hurt-3': [L(on=-8, path=HIT + 'hit28.mp3.flac', dur=0.5, fout=0.1), L('15-vocal-male-strainhurtpainjump-sounds/slightscream-14.flac', gain=-7, at=0.02)],
    'sizzle-1': [L(TINY + 'compressed-air-spray-01.wav', dur=0.4, hp=2000, fout=0.2), L('catching-fire/flame_0.ogg', gain=-8)],
    'roll-1': [L(KEN + 'cloth1.ogg', hp=120), L(FAN + 'Fantozzi-SandL1.flac', at=0.22, gain=-4)],
    'roll-2': [L(KEN + 'cloth3.ogg', hp=120), L(FAN + 'Fantozzi-SandR2.flac', at=0.22, gain=-4)],
    'dodge-1': [L('wind-hit-time-morph/qubodup-megaswosh1.wav', hp=200, fout=0.1)],
    'dodge-2': [L('wind-hit-time-morph/qubodup-megaswosh2.wav', hp=200, fout=0.1)],
    'step-g-1': [L(FAN + 'Fantozzi-SandL1.flac', hp=80)],
    'step-g-2': [L(FAN + 'Fantozzi-SandL2.flac', hp=80)],
    'step-g-3': [L(FAN + 'Fantozzi-SandL3.flac', hp=80)],
    'step-g-4': [L(FAN + 'Fantozzi-SandR1.flac', hp=80)],
    'step-g-5': [L(FAN + 'Fantozzi-SandR2.flac', hp=80)],
    'step-g-6': [L(FAN + 'Fantozzi-SandR3.flac', hp=80)],
    'step-s-1': [L(FAN + 'Fantozzi-StoneL1.flac', hp=80)],
    'step-s-2': [L(FAN + 'Fantozzi-StoneL2.flac', hp=80)],
    'step-s-3': [L(FAN + 'Fantozzi-StoneL3.flac', hp=80)],
    'step-s-4': [L(FAN + 'Fantozzi-StoneR1.flac', hp=80)],
    'step-s-5': [L(FAN + 'Fantozzi-StoneR2.flac', hp=80)],
    'step-s-6': [L(FAN + 'Fantozzi-StoneR3.flac', hp=80)],
    'heal-1': [L(TINY + 'vial-glass-uncork-01.wav'), L('various-sound-effects-0/glug.wav', at=0.25, dur=0.9, gain=-5, fout=0.3),
               L('cure-magic/Cure3.wav', at=0.55, gain=-6, fout=0.4)],
    'noflask-1': [L(TINY + 'vial-glass-close-01.wav', rate=0.8)],
    'lock-1': [L(KEN + 'metalClick.ogg', hp=300)],
    # timing cues: layered UNDER the synthesized cue (the synth keeps the readable shape)
    'tell-blue-1': [L('4-metal-dingsrings/ding.4.ogg', hp=600, fout=0.2)],
    'tell-red-1': [L('100-cc0-sfx/gong_02.ogg', rate=0.8, fout=0.3)],
    'tell-tick-1': [L('100-cc0-sfx/metal_11.ogg', hp=1500, dur=0.25, fout=0.1)],
    'flash-1': [L(BRK + 'bfh1_metal_hit_01.ogg', hp=1200)],
    # steel on steel
    'parry-1': [L(MED + 'Sabre Katana Blade on Blade.wav', start=12.25, dur=0.75, fout=0.2)],
    'parry-2': [L(MED + 'Norse Sword Katana Blade on Blade.wav', start=13.82, dur=0.75, fout=0.2)],
    'parry-3': [L(MED + 'Sabre Norse Sword Blade on Blade.wav', start=12.42, dur=0.75, fout=0.2)],
    'parry-4': [L(MED + 'Axe Katana Blade on Blade.wav', start=6.94, dur=0.75, fout=0.2)],
    'parry-p-1': [L(SKC + 'sword-knife-clash-04.wav', dur=1.8, fout=0.6)],
    'parry-p-2': [L(SKC + 'sword-knife-clash-05.wav', dur=1.8, fout=0.6)],
    'parry-p-3': [L(SKC + 'sword-knife-clash-11.wav', dur=1.8, fout=0.6)],
    'block-1': [L(MED + 'Axe Sabre Blade on Hilt.wav', start=0.53, dur=0.45, fout=0.15), L(on=-8, path=HIT + 'hit20.mp3.flac', gain=-8, dur=0.4)],
    'block-2': [L(MED + 'Axe Sabre Blade on Hilt.wav', start=1.04, dur=0.45, fout=0.15), L(on=-8, path=HIT + 'hit21.mp3.flac', gain=-8, dur=0.4)],
    'block-3': [L(MED + 'Axe Sabre Blade on Hilt.wav', start=2.62, dur=0.45, fout=0.15), L(on=-8, path=HIT + 'hit28.mp3.flac', gain=-8, dur=0.4)],
    'guard-1': [L(MED + 'Sabre Katana Hilt on Blade.wav', start=4.23, dur=0.45, fout=0.15)],
    'guard-2': [L(MED + 'Sabre Katana Hilt on Blade.wav', start=4.81, dur=0.45, fout=0.15)],
    'deflect-1': [L(MED + 'Dagger Katana Blade on Blade.wav', start=0.09, dur=0.4, fout=0.12)],
    'deflect-2': [L(MED + 'Dagger Katana Blade on Blade.wav', start=2.04, dur=0.4, fout=0.12)],
    'trade-1': [L(MED + 'Axe Katana Blade on Blade.wav', start=1.14, dur=0.75, fout=0.2)],
    'trade-2': [L(MED + 'Axe Katana Blade on Blade.wav', start=5.91, dur=0.75, fout=0.2)],
    'gbreak-1': [L(MED + 'Mace Norse Sword Blade.wav', start=5.29, dur=0.45, fout=0.1), L(on=-8, path=HIT + 'hit02.mp3.flac', gain=-3),
                 L(BRK + 'bfh1_metal_falling_01.ogg', at=0.1, gain=-5)],
    'ghost-1': [L('wind-hit-time-morph/qubodup-slomo1.wav', hp=150, fout=0.2)],
    'plunge-dive-1': [L('wind-hit-time-morph/qubodup-megaswosh2.wav', rate=0.75, hp=120, fout=0.1)],
    'plunge-hit-1': [L(on=-8, path=HIT + 'hit02.mp3.flac'), L('synthesized-explosion/synthetic_explosion_1.flac', gain=-4), L(BRK + 'bfh1_rock_breaking_02.ogg', gain=-6, at=0.03)],
    'burst-1': [L('80-cc0-rpg-sfx/spell_fire_07.ogg'), L(on=-8, path=HIT + 'hit07.mp3.flac', gain=-5, dur=0.5)],
    'gong-1': [L('100-cc0-sfx/gong_01.ogg', rate=0.7, fout=0.6)],
    'gong-2': [L('100-cc0-sfx/gong_02.ogg', rate=0.7, fout=0.6)],
    # the wyrm
    'roar-1': [L(TROLL, start=0.05, dur=1.6, rate=0.78, hp=40, fout=0.4), L(DEEP, dur=2.2, gain=-5, fout=0.6)],
    'roar-2': [L(TROLL, start=1.82, dur=1.7, rate=0.78, hp=40, fout=0.4), L(DEEP, dur=2.2, gain=-5, fout=0.6)],
    'roar-3': [L(TROLL, start=9.38, dur=1.5, rate=0.76, hp=40, fout=0.4), L(DEEP, dur=2.2, gain=-5, fout=0.6)],
    'wake-1': [L(SNARL, start=3.39, dur=1.78, rate=0.6, hp=40, fout=0.5), L(DEEP, dur=2.0, rate=1.1, gain=-6, fout=0.8)],
    'phase2-1': [L(TROLL, start=7.05, dur=2.3, rate=0.72, hp=40, fout=0.5), L(DEEP, dur=3.5, gain=-3, fout=1.0),
                 L('earthquake-and-open-sesame/shake.flac', dur=3, gain=-8, fout=1.0)],
    'pain-1': [L('monster-sound-effects-2/monster_sfx_pack_2/monster-1.wav', rate=0.75, fout=0.2)],
    'pain-2': [L('monster-snarls/monsters-snarls-3_0.ogg', start=3.09, dur=0.5, rate=0.72, fout=0.15)],
    'pain-3': [L('monster-snarls/monster-snarl-attack.ogg', start=2.14, dur=0.45, rate=0.7, fout=0.15)],
    'recoil-1': [L(SNARL, start=1.61, dur=0.53, rate=0.75, fout=0.15)],
    'recoil-2': [L(SNARL, start=2.56, dur=0.83, rate=0.75, fout=0.2)],
    'death-1': [L(DEEP, rate=0.85, fout=1.5), L(TROLL, start=5.32, dur=1.7, rate=0.65, gain=-4, fout=0.6),
                L('muffled-distant-explosion/NenadSimic - Muffled Distant Explosion.wav', at=2.4, gain=-2)],
    'stagger-1': [L('deep-bone-crackbreak-sfx/Deep Break 1.wav'), L(on=-8, path=HIT + 'hit02.mp3.flac', gain=-3),
                  L(SNARL, start=7.22, dur=0.2, rate=0.7, gain=-6, at=0.08, fout=0.08)],
    'pbreak-1': [L(MED + 'Mace Norse Sword Blade.wav', start=0.56, dur=0.5, fout=0.2), L('deep-bone-crackbreak-sfx/Deep Break 6.wav'),
                 L('muffled-distant-explosion/NenadSimic - Muffled Distant Explosion.wav', dur=1.8, gain=-3, fout=0.6)],
    'dstep-1': [L('mech-stomp-step-sound/stomp.flac', gain=-3), L('muffled-distant-explosion/NenadSimic - Muffled Distant Explosion.wav', dur=0.9, fout=0.4)],
    'dstep-2': [L('mech-stomp-step-sound/stomp.flac', rate=0.85, gain=-3), L(on=-8, path=HIT + 'hit35.mp3.flac', gain=-3, dur=0.8, fout=0.3)],
    'land-1': [L('muffled-distant-explosion/NenadSimic - Muffled Distant Explosion.wav', dur=2.2, fout=0.8),
               L('earthquake-and-open-sesame/shake.flac', dur=1.6, gain=-6, fout=0.8), L('mech-stomp-step-sound/stomp.flac', rate=0.8)],
    'flap-1': [L('large-wings-flap/wings_flap_large.flac', start=0.0, dur=1.0, rate=0.8, fout=0.3)],
    'flap-2': [L('large-wings-flap/wings_flap_large.flac', start=1.02, dur=1.0, rate=0.8, fout=0.3)],
    'flap-3': [L('large-wings-flap/wings_flap_large.flac', start=2.06, dur=0.56, rate=0.8, fout=0.2)],
    'takeoff-1': [L('large-wings-flap/wings_flap_large.flac', rate=0.85, fout=0.4), L(BAM + 'swosh-23.flac', dur=2, rate=0.6, hp=60, gain=-8, fout=0.6)],
    'bite-1': [L(RPG + 'NPC/beetle/bite-small.wav', rate=0.55), L('deep-bone-crackbreak-sfx/Deep Break 5.wav', gain=-4, at=0.04)],
    'swipe-1': [L(BAM + 'swosh-24.flac', start=0.15, dur=0.45, rate=0.6, hp=60, fout=0.15)],
    'swipe-2': [L(BAM + 'swosh-30.flac', start=0.2, dur=0.5, rate=0.6, hp=60, fout=0.15)],
    'fireball-1': [L('fireball-1/105016__julien-matthey__jm-fx-fireball-01.wav', fout=0.4)],
    'boom-1': [L('25-cc0-bang-firework-sfx/cannon_02.ogg', fout=0.5), L('synthesized-explosion/synthetic_explosion_1.flac', gain=-3)],
    'boom-2': [L('25-cc0-bang-firework-sfx/bang_03.ogg', fout=0.5), L('synthesized-explosion/synthetic_explosion_1.flac', gain=-3, rate=0.9)],
    'boom-big-1': [L('25-cc0-bang-firework-sfx/cannon_02.ogg', rate=0.8, fout=0.6), L('chunky-explosion/Chunky Explosion.mp3', dur=3, gain=-2, fout=1.2),
                   L('synthesized-explosion/synthetic_explosion_1.flac', rate=0.8)],
    'hiss-1': [L(TINY + 'compressed-air-spray-02.wav', dur=1.6, hp=1500, fin=0.2, fout=0.8)],
    # the world breaks (ADR-107): chip = a blow meets it; crash = something comes down
    'chip-stone-1': [L(BRK + 'bfh1_rock_falling_08.ogg')],
    'chip-stone-2': [L(BRK + 'bfh1_rock_breaking_03.ogg')],
    'chip-stone-3': [L('80-cc0-rpg-sfx/stones_04.ogg')],
    'chip-wood-1': [L(BRK + 'bfh1_wood_breaking_04.ogg')],
    'chip-wood-2': [L(BRK + 'bfh1_wood_hit_03.ogg')],
    'chip-metal-1': [L(BRK + 'bfh1_metal_hit_02.ogg')],
    'chip-metal-2': [L(BRK + 'bfh1_metal_hit_06.ogg')],
    'chip-bone-1': [L('deep-bone-crackbreak-sfx/Deep Break 9.wav')],
    'crash-stone-1': [L(BRK + 'bfh1_rock_breaking_02.ogg'), L('cave-in/cave_in_-_starninjas_0.ogg', dur=2.2, gain=-4, fout=0.8)],
    'crash-stone-2': [L(BRK + 'bfh1_rock_breaking_01.ogg'), L('80-cc0-rpg-sfx/stones_03.ogg', at=0.1, gain=-4)],
    'crash-wood-1': [L('35-wooden-crackshitsdestructions/wood_impact/crack04.mp3.flac', fout=0.6)],
    'crash-wood-2': [L('35-wooden-crackshitsdestructions/wood_impact/crack08.mp3.flac', fout=0.6)],
    # spells and fire (fire.js)
    'bolt-1': [L('80-cc0-rpg-sfx/spell_fire_06.ogg', fout=0.3)],
    'pillar-1': [L('80-cc0-rpg-sfx/spell_fire_05.ogg', fout=0.4), L('catching-fire/flame_0.ogg', gain=-4)],
    'ignite-1': [L('80-cc0-rpg-sfx/spell_fire_01.ogg', fout=0.4)],
    'ignite-2': [L('80-cc0-rpg-sfx/spell_fire_02.ogg', fout=0.4)],
    'scream-1': [L(TROLL, start=3.57, dur=1.6, rate=0.95, hp=80, fout=0.4)],
    'cast-1': [L('3-dark-magic-spells/dark_magic/fout-02.flac', fout=0.4)],
    'rumble-1': [L('earthquake-and-open-sesame/shake.flac', dur=3.2, fin=0.2, fout=1.0)],
    'nova-charge-1': [L('3-dark-magic-spells/dark_magic/fout-01.flac', fout=0.4)],
    # world / ui
    'bonfire-1': [L(TINY + 'match-light-01.wav'), L('catching-fire/flame_0.ogg', at=0.25, rate=0.85)],
    'victory-1': [L('100-cc0-sfx/gong_01.ogg', rate=0.9, fout=0.6), L('bell-dingschimes/bell_ding1.wav', at=0.3, gain=-6, fout=0.8)],
    'area-1': [L('bell-dingschimes/bell_ding3.wav', rate=0.8, fout=0.8)],
    'retry-1': [L(UI + 'maximize_006.ogg')],
    'ui-select': [L(UI + 'select_002.ogg')],
    'ui-start': [L(UI + 'confirmation_002.ogg')],
    'ui-pause': [L(UI + 'minimize_006.ogg')],
    'ui-resume': [L(UI + 'maximize_006.ogg')],
    'ui-error': [L(UI + 'error_004.ogg')],
}

# --- music (loudness-normalised stereo) and ambience beds --------------------------------------
# lufs: integrated loudness target; start/dur trim the source (seconds)
MUSIC = {
    'cinder-ambient': dict(path='dark-forest-theme/GameMusic_ForestTheme_24_0.mp3', lufs=-20),
    'cinder-boss': dict(path='boss-battle-music/Juhani Junkala - Epic Boss Battle [Seamlessly Looping].wav', lufs=-16),
    'cinder-boss2': dict(path='determined-pursuit-epic-orchestra-loop/determined_pursuit_loop.wav', lufs=-16),
    'ash-ambient': dict(path='oriented/Oriented_0.ogg', lufs=-20),
    'ash-boss': dict(path='bosskoto/boss_koto.mp3', lufs=-16),
    'ash-boss2': dict(path='ninja-theme/ninja theme_0.ogg', lufs=-16),
    'starless-ambient': dict(path='dark-shrine-loop/qubodup-yd-DarkShrineLoop-OpenGameArt.ogg', lufs=-20),
    'starless-boss': dict(path='epic-endgame-cinematic/ChoirChordsBassMaster.wav', lufs=-16),
    'starless-boss2': dict(path='battle-theme-a/battleThemeA.mp3', lufs=-16),
    'victory': dict(path='victory-fanfare-short/Heavy_ConceptB.wav', lufs=-16),
    'death': dict(path='death-of-a-ninja-game-over/Death of a Ninja (Game Over).mp3', lufs=-18),
}
BEDS = {
    'bed-cinder': dict(path='crickets-ambient-noise-loopable/crickets_1.mp3', lufs=-30, mono=True),
    'bed-ash': dict(path='wind/wind/Wind2.ogg', lufs=-30),
    'bed-starless': dict(path='loopable-dungeon-ambience/dungeon_ambient_1_0.ogg', dur=60, lufs=-28),
}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(' '.join(cmd[:6]) + '...\n' + r.stderr[-1500:])
    return r


def probe_sr(path):
    r = run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', path])
    return int(r.stdout.strip().split('\n')[0])


def onset(src, start, dur, db=-24):
    """Seconds from `start` to the layer's first sound: the first moment within 24 dB of its peak, less
    5 ms (a source may open with silence, a breath or a punch's swing before the blow)."""
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(start)] + (['-t', str(dur)] if dur else [])
    cmd += ['-i', src, '-ac', '1', '-ar', '22050', '-f', 'f32le', '-']
    a = array.array('f')
    a.frombytes(subprocess.run(cmd, capture_output=True).stdout)
    if not a:
        return 0.0
    peak = max(abs(v) for v in a)
    th = peak * 10 ** (db / 20)
    for i, v in enumerate(a):
        if abs(v) >= th:
            return max(0.0, i / 22050 - 0.005)
    return 0.0


def layer_filter(i, lay, src):
    sr = probe_sr(src)
    f = []
    skip = onset(src, lay['start'], lay['dur'], lay['on'])
    if lay['start'] or lay['dur'] or skip:
        st = lay['start'] + skip
        du = (lay['dur'] - skip) if lay['dur'] else None
        f.append(f"atrim=start={st:.4f}" + (f":duration={du:.4f}" if du else ''))
        f.append('asetpts=PTS-STARTPTS')
    f.append('aformat=channel_layouts=mono')
    if lay['rate'] != 1:
        f.append(f"asetrate={int(sr * lay['rate'])}")
    f.append('aresample=44100')
    if lay['hp']:
        f.append(f"highpass=f={lay['hp']}")
    if lay['lp']:
        f.append(f"lowpass=f={lay['lp']}")
    f.append(f"afade=t=in:d={lay['fin']}")
    if lay['dur']:
        d = (lay['dur'] - skip) / lay['rate']
        f.append(f"afade=t=out:st={max(0, d - lay['fout']):.3f}:d={lay['fout']}")
    if lay['at']:
        f.append(f"adelay={int(lay['at'] * 1000)}")
    if lay['gain']:
        f.append(f"volume={lay['gain']}dB")
    return f"[{i}:a]" + ','.join(f) + f"[l{i}]"


def build_sfx(name, layers, src):
    ins = []
    for lay in layers:
        p = os.path.join(src, lay['path'])
        if not os.path.exists(p):
            raise FileNotFoundError(p)
        ins += ['-i', p]
    chains = [layer_filter(i, lay, os.path.join(src, lay['path'])) for i, lay in enumerate(layers)]
    mix = ''.join(f'[l{i}]' for i in range(len(layers)))
    # mix, cut leading silence (the sound must start on the frame it is played), tail fade + trim
    graph = ';'.join(chains) + f";{mix}amix=inputs={len(layers)}:normalize=0:duration=longest," \
        "silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.004," \
        "areverse,silenceremove=start_periods=1:start_threshold=-62dB,afade=t=in:d=0.02,areverse[m]"
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 'm.wav')
        run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', graph, '-map', '[m]', '-ar', '44100', '-ac', '1', '-c:a', 'pcm_f32le', wav])
        peak = float(re.search(r'max_volume: ([-\d.]+) dB',
                               run(['ffmpeg', '-i', wav, '-af', 'volumedetect', '-f', 'null', '-']).stderr).group(1))
        out = os.path.join(OUT, 'sfx', name + '.mp3')
        run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', f'volume={-1 - peak:.2f}dB', '-ac', '1', '-ar', '44100',
             '-c:a', 'libmp3lame', '-q:a', '4', out])
    return out


def build_music(name, spec, src, sub):
    p = os.path.join(src, spec['path'])
    trim = []
    if spec.get('start'):
        trim += ['-ss', str(spec['start'])]
    if spec.get('dur'):
        trim += ['-t', str(spec['dur'])]
    lufs = spec['lufs']
    m = run(['ffmpeg', '-hide_banner', *trim, '-i', p, '-af', f'loudnorm=I={lufs}:TP=-1.5:LRA=14:print_format=json', '-f', 'null', '-']).stderr
    j = json.loads(m[m.rindex('{'):m.rindex('}') + 1])
    ln = (f"loudnorm=I={lufs}:TP=-1.5:LRA=14:linear=true:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
          f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}")
    af = 'silenceremove=start_periods=1:start_threshold=-60dB,' + ln + ',aresample=44100'
    out = os.path.join(OUT, sub, name + '.mp3')
    run(['ffmpeg', '-v', 'error', '-y', *trim, '-i', p, '-af', af, '-ac', '1' if spec.get('mono') else '2',
         '-c:a', 'libmp3lame', '-q:a', '5', out])
    return out


def fetch(src):
    for slug in SOURCES:
        d = os.path.join(src, slug)
        if os.path.isdir(d) and os.listdir(d):
            continue
        os.makedirs(d, exist_ok=True)
        html = urllib.request.urlopen(urllib.request.Request('https://opengameart.org/content/' + slug,
                                                             headers={'User-Agent': 'Mozilla/5.0'})).read().decode('utf8', 'replace')
        files = re.findall(r'<a href="(https://opengameart.org/sites/default/files/[^"]+)" type="[^"]*length=\d+"', html)
        for u in files:
            name = urllib.parse.unquote(u.rsplit('/', 1)[1])
            dst = os.path.join(d, name)
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})) as r, open(dst, 'wb') as f:
                shutil.copyfileobj(r, f)
            if name.lower().endswith(('.zip', '.7z')):
                tar = r'C:\Windows\System32\tar.exe' if os.name == 'nt' else 'bsdtar'
                run([tar, '-xf', dst, '-C', d])
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
    for sub in ('sfx', 'music', 'amb'):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    jobs = [('sfx', k, v) for k, v in SFX.items()] + [('music', k, v) for k, v in MUSIC.items()] + [('amb', k, v) for k, v in BEDS.items()]
    fails = 0
    for kind, name, spec in jobs:
        if only and name not in only:
            continue
        try:
            out = build_sfx(name, spec, a.src) if kind == 'sfx' else build_music(name, spec, a.src, kind)
            print(f'{kind:5s} {name:16s} {os.path.getsize(out) // 1024:5d} KB')
        except Exception as e:
            fails += 1
            print(f'FAIL {name}: {e}', file=sys.stderr)
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
