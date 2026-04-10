import {Manifold, Vec3, GLTFMaterial, setMaterial} from 'manifold-3d/manifoldCAD';
import type {Segment} from './math.ts';
import {
  add, cross, length, sub, dot, scale, normalize,
  rotateAlign, translate, multiply
} from './math.ts';

const signs = (dis:number, tolerance=1e-3):Array<number> => {
    if (dis >= tolerance) return [-1,+1]; // Two roots.
    if (dis >= 0) return [-1]; // One root.
    return [];
}

/**
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

const results:Array<Manifold> = [];

const baseMaterial:GLTFMaterial = {
  baseColorFactor: [1,1,0],
  alpha: 0.5, doubleSided: true
}

const rayMaterial:GLTFMaterial = {
  baseColorFactor: [0,0,0],
  unlit: true
}

const intersectionMaterial:GLTFMaterial = {
  baseColorFactor: [1,0,0],
  unlit: true
}

const cylinder = (axis:Segment, radius:number=0.1, material=rayMaterial) => {
  const naxis = normalize(sub(axis[1],axis[0]));
  let geom = Manifold.cylinder(length(sub(axis[1],axis[0])), radius);

  const mRot = rotateAlign([0,0,1],naxis);
  const mTrans = translate(axis[0]);
  geom = geom.transform(multiply(mTrans, mRot));
  return setMaterial(geom, material);
}

const sphere = (p:Vec3, radius:number=0.5, material = intersectionMaterial) => {
  return setMaterial(Manifold.sphere(radius).translate(p), material)
}

export default () => {
  const radius = 5;
  const axis:Segment = [[0,-5,0],[0,20,30]];
  //const axis:Segment = [[0,20,30],[0,-5,0]];

  const edge:Segment = [[-30,0,0],[30,0,15]]
  //const edge:Segment = [[-10,-15,0],[0,-5,-1]]

  results.push(setMaterial(Manifold.hull([sphere(axis[0],radius),sphere(axis[1],radius)]), baseMaterial));

  results.push(cylinder(edge));

  const pts = segmentCylinder(edge, axis, radius);
  for (const pt of pts) {
    results.push(sphere(pt,0.5))
  }

  return results;
};