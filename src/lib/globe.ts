import { feature, mesh } from 'topojson-client';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { Topology } from 'topojson-specification';
import land110 from 'world-atlas/land-110m.json';
import countries110 from 'world-atlas/countries-110m.json';

export const RAD = Math.PI / 180;

/** Land outlines as rings of [longitude, latitude]. The file ships with the app; nothing is fetched. */
export function landRings(): number[][][] {
  const topo = land110 as unknown as Topology;
  const fc = feature(topo, topo.objects.land) as unknown as
    FeatureCollection<Polygon | MultiPolygon> | { geometry: Polygon | MultiPolygon };
  const geoms = 'features' in fc ? fc.features.map((f) => f.geometry) : [fc.geometry];
  const out: number[][][] = [];
  for (const g of geoms) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polys) out.push(p[0]);
  }
  return out;
}

/** Where a point on the sphere lands on screen for a globe turned to (lon0, lat0). `z` above zero means it faces the viewer. */
export function project(
  lon: number,
  lat: number,
  lon0: number,
  lat0: number,
  r: number,
  cx: number,
  cy: number,
) {
  const l = (lon - lon0) * RAD;
  const p = lat * RAD;
  const p0 = lat0 * RAD;
  const z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  return {
    x: cx + r * Math.cos(p) * Math.sin(l),
    y: cy - r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)),
    z,
  };
}

/** Points along the shortest path between two places, lifted off the surface in the middle, as [lat, lon, lift]. */
export function arcPoints(a: [number, number], b: [number, number], steps = 48): [number, number, number][] {
  const v = (lat: number, lon: number) => [
    Math.cos(lat * RAD) * Math.cos(lon * RAD),
    Math.cos(lat * RAD) * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
  ];
  const p = v(a[0], a[1]);
  const q = v(b[0], b[1]);
  const dot = Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
  const om = Math.acos(dot) || 1e-6;
  const out: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s1 = Math.sin((1 - t) * om) / Math.sin(om);
    const s2 = Math.sin(t * om) / Math.sin(om);
    const x = s1 * p[0] + s2 * q[0];
    const y = s1 * p[1] + s2 * q[1];
    const z = s1 * p[2] + s2 * q[2];
    out.push([
      Math.atan2(z, Math.hypot(x, y)) / RAD,
      Math.atan2(y, x) / RAD,
      Math.sin(Math.PI * t) * 0.22 * Math.min(1, om / 1.2),
    ]);
  }
  return out;
}

/** Country borders as lines of [longitude, latitude], where two countries meet. Real boundaries from the same open dataset as the coastlines. */
export function borderLines(): number[][][] {
  const topo = countries110 as unknown as Topology;
  const m = mesh(topo, topo.objects.countries as never, (a, b) => a !== b) as unknown as {
    coordinates: number[][][];
  };
  return m.coordinates;
}
