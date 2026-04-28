import {Vec3} from 'manifold-3d/manifoldCAD';
import type {Plane, Ray, Segment, Triangle} from './math.ts';
import {
  add, cross, length, sub, dot, scale, normalize, equals,
  barycentric, barycentricInTriangle,
} from './math.ts';

/**
 * Given a discriminator value, return a sign value for each root.
 */
const signs = (dis:number, tolerance=1e-3):Array<number> => {
    if (dis >= tolerance) return [-1,+1]; // Two roots.
    if (dis >= 0) return [-1]; // One root.
    return [];
}

/**
 * Find the intersection points between a line and a cylinder.
 * 
 * Straight from wikipedia.
 * @see: https://en.wikipedia.org/wiki/Line-cylinder_intersection
 */
export function segmentCylinder(seg:Segment, axis:Segment, radius:number, endcaps:'flat'|'hemisphere' = 'hemisphere'):Array<Vec3> {
  const tolerance = 1e-3;
  const l = length(seg);
  const n = normalize(seg);

  const b = sub(axis[0], seg[0]); // Axis basis.
  const a = normalize(axis);
  const h = length(axis);

  const results:Array<number> = [];

  const hemisphereEndCap = (center:Vec3) => {
    const c = sub(center, seg[0]);
    const nc = dot(n,c);

    const dis = nc**2 + radius**2 - dot(c,c);
    for (const sign of signs(dis)) {
        const d = nc + sign*Math.sqrt(dis);
        if (d<0 || d>l) continue; // Point is outside segment.

        const t = dot(a,sub(scale(n,d),b));
        if (t<-radius || (t>0 && t<h) || t>(h+radius)) continue;

        results.push(d);
    }
  }

  const nxa = cross(n, a);

  if (length(nxa) > tolerance) {
    // seg is not parallel to axis.

    const bxa = cross(b, a);
    const nxanxa = dot(nxa,nxa);
    const dis = nxanxa*radius**2 - dot(a,a)*dot(b,nxa)**2;
    for (const sign of signs(dis)) {
        const d = (dot(nxa,bxa) + sign*Math.sqrt(dis)) / nxanxa;
        if (d<0 || d>l) continue; // Point is outside segment.

        const t = dot(a,sub(scale(n,d),b));
        if (t<0 || t>h) continue; // Point is outside cylinder.
        results.push(d);
    }
  }

  for (const pt of axis) {
    if (endcaps == 'hemisphere') {
        hemisphereEndCap(pt);
    }
  }

  return results.map(d => add(seg[0], scale(n,d)));
}

/**
 * Return the line (ray) of intersection between two planes.
 */
export function planePlane([na, a=[0,0,0]]:Plane, [nb, b=[0,0,0]]:Plane): Ray|null {
  const n = normalize(cross(na,nb));
  let p = a;
  if (!equals(a,b)) {
    // Create a line along plane A,
    // at right angles to normal n.
    // Find where it intersects plane B,
    // and there's our common point.
    const nl = cross(na,n);
    const t = dot(nb, sub(b,a)) / dot(nb,nl);
    p = add(a, scale(nl, t));
  }
  return [n, p];
}

export function segmentPlane(seg:Segment, [np,p=[0,0,0]]:Plane, tolerance:number=1e-3): Vec3|null {
  const n = normalize(seg);
  const [a] = seg;
  const pa = sub(p,a);
  if (Math.abs(dot(n,np))<tolerance) {
    // Line is parallel there are 0 or infinite points.
    // Either way, return null.
    if (dot(pa,np)<tolerance) {
      return null;
      // Line is in plane.
    } else {
      // Line is not in plane.
      return null;
    }
  }
  const t = dot(pa,np) / dot(n,np);
  return add(a, scale(n, t));
}

export function segmentTriangle(seg:Segment, tri:Triangle, tolerance:number=1e-3): Vec3|null {
  const plane:Plane = [normalize(tri), tri[0]];
  const pt = segmentPlane(seg,plane);
  if (!pt) return null;

  const b = barycentric(pt, tri);

  if (!barycentricInTriangle(b, tolerance)) return null;
  return pt;
}
