import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";

/** Real coastlines (Natural Earth 1:110m), rasterised once; returns a lookup: is (lon, lat) land? */
export function landMask(W = 1024, H = 512) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const topo = land110 as unknown as Parameters<typeof feature>[0] & { objects: { land: Parameters<typeof feature>[1] } };
  const proj = geoEquirectangular().fitSize([W, H], { type: "Sphere" } as never);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  geoPath(proj, ctx)(feature(topo, topo.objects.land) as never);
  ctx.fill();
  const data = ctx.getImageData(0, 0, W, H).data;
  return (lon: number, lat: number) => {
    const x = Math.max(0, Math.min(W - 1, Math.floor(((lon + 180) / 360) * W)));
    const y = Math.max(0, Math.min(H - 1, Math.floor(((90 - lat) / 180) * H)));
    return data[(y * W + x) * 4]! > 128;
  };
}
