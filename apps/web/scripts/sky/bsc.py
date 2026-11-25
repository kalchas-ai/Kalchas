"""The Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991; CDS V/50), as the page needs it:
every star that has a place and a brightness, as [l, b, V, B-V] (degrees along and across the galaxy), and the
proper names of the brightest by which entry they are. argv = catalog (fixed columns, gz or not), out json."""
import sys, gzip, json, math
src, out = sys.argv[1], sys.argv[2]
op = gzip.open if src.endswith('.gz') else open
stars = []
with op(src, 'rt', encoding='latin-1') as f:
    for line in f:
        try:
            l = float(line[90:96]); b = float(line[96:102]); v = float(line[102:107])
        except ValueError:
            continue                                            # the few entries that are not stars
        bv = line[109:114].strip()
        stars.append([round(l, 2), round(b, 2), round(v, 2), round(float(bv), 2) if bv else 0.6])
NAMED = [(227.2, -8.9, -1.46, 'Sirius'), (261.2, -25.3, -0.74, 'Canopus'), (315.7, -0.7, -0.27, 'α Cen'), (15.1, 69.1, -0.05, 'Arcturus'), (67.4, 19.2, 0.03, 'Vega'),
         (162.6, 4.6, 0.08, 'Capella'), (209.2, -25.2, 0.13, 'Rigel'), (213.7, 13.0, 0.34, 'Procyon'), (290.8, -58.8, 0.46, 'Achernar'), (199.8, -9.0, 0.5, 'Betelgeuse'),
         (311.8, 1.3, 0.61, 'Hadar'), (47.7, -8.9, 0.77, 'Altair'), (300.1, -0.4, 0.76, 'Acrux'), (181.0, -20.2, 0.86, 'Aldebaran'), (351.9, 15.1, 0.96, 'Antares'),
         (316.1, 50.8, 0.97, 'Spica'), (192.2, 23.4, 1.14, 'Pollux'), (20.5, -64.9, 1.16, 'Fomalhaut'), (84.3, 2.0, 1.25, 'Deneb'), (302.5, 3.2, 1.25, 'Mimosa'),
         (226.4, 48.9, 1.35, 'Regulus'), (239.8, -11.3, 1.5, 'Adhara'), (351.7, -2.2, 1.62, 'Shaula'), (196.9, -16.0, 1.64, 'Bellatrix'), (178.0, -3.7, 1.65, 'Elnath')]
def sep(l1, b1, l2, b2):
    l1, b1, l2, b2 = map(math.radians, (l1, b1, l2, b2))
    return math.degrees(math.acos(max(-1, min(1, math.sin(b1) * math.sin(b2) + math.cos(b1) * math.cos(b2) * math.cos(l1 - l2)))))
names = {}
for l, b, v, name in NAMED:
    best = min(range(len(stars)), key=lambda i: sep(l, b, stars[i][0], stars[i][1]) + 3 * abs(stars[i][2] - v))
    d = sep(l, b, stars[best][0], stars[best][1])
    if d < 3 and abs(stars[best][2] - v) < 0.8:
        names[str(best)] = name
        print('%-11s mine (%.1f, %.1f) catalogue (%.2f, %.2f) V %.2f  off by %.2f deg' % (name, l, b, stars[best][0], stars[best][1], stars[best][2], d))
    else:
        print('%-11s not found (nearest %.1f deg away)' % (name, d))
json.dump({'stars': stars, 'names': names}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print('stars', len(stars), 'brighter than 3:', sum(1 for s in stars if s[2] < 3), 'named', len(names))
