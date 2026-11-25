# The real sky, for the design pages

Both files are made from public data by the scripts in `apps/web/scripts/sky/`.

- `milkyway.jpg` (4096 × 2048, galactic coordinates, the middle of the galaxy in the middle, longitude growing
  leftward, north up): the glow of the Milky Way without its stars, from NASA's Scientific Visualization Studio,
  *Deep Star Maps 2020* (`milkyway_2020_4k_gal.exr`, https://svs.gsfc.nasa.gov/4851), built from ESA Gaia DR2 and
  the Hipparcos and Tycho-2 catalogues. NASA imagery, public domain; credit NASA/Goddard Space Flight Center
  Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC. Tone-mapped from linear light by `mw.py`.
- `bsc5.json`: the Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991; CDS catalogue V/50),
  the 9,096 entries that are stars, each `[l, b, V, B−V]` (degrees along and across the galaxy, magnitude, colour),
  and the proper names of twenty-five of the brightest by entry. Made by `bsc.py`.
