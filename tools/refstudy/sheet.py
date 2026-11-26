# sheet.py <dir> <out.jpg> <cols> [tileW]: contact sheet of every tNNN.NNN.jpg in dir, labelled with its time (s)
# run: python -I sheet.py ...  (needs Pillow)
import sys, os
from PIL import Image, ImageDraw
d, out, cols = sys.argv[1], sys.argv[2], int(sys.argv[3])
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 320
fs = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
ims = [Image.open(os.path.join(d, f)) for f in fs]
th = int(ims[0].height * tw / ims[0].width)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * tw, rows * th), 'black')
dr = ImageDraw.Draw(S)
for i, (f, im) in enumerate(zip(fs, ims)):
    x, y = (i % cols) * tw, (i // cols) * th
    S.paste(im.resize((tw, th)), (x, y))
    dr.rectangle([x, y, x + 70, y + 14], fill='black')
    dr.text((x + 2, y + 1), f[1:-4].lstrip('0') or '0', fill='yellow')
S.save(out, quality=80)
print(out, S.size)
