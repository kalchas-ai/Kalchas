"""The Milky Way's glow as NASA's Scientific Visualization Studio made it from Gaia (milkyway_2020_4k_gal.exr, in
galactic coordinates, linear light) turned into an ordinary picture the page can load: argv = raw float planes
(gbrpf32le, from ffmpeg), width, height, out jpg."""
import sys
import numpy as np
from PIL import Image
raw, W, H, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
a = np.fromfile(raw, dtype='<f4').reshape(3, H, W)          # planes: G, B, R
rgb = np.stack([a[2], a[0], a[1]], axis=-1)
rgb = np.nan_to_num(np.maximum(rgb, 0.0))
lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
print('linear: mean %.5f  p50 %.5f  p99 %.5f  p99.9 %.5f  max %.4f' % (lum.mean(), np.percentile(lum, 50), np.percentile(lum, 99), np.percentile(lum, 99.9), lum.max()))
k = 2.6 / max(np.percentile(lum, 99.9), 1e-9)                 # the brightest of it just short of white
t = 1.0 - np.exp(-rgb * k)
img = (np.clip(t, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)
Image.fromarray(img, 'RGB').save(out, quality=74, optimize=True, progressive=True)
print('wrote', out, img.shape, 'k', k)
