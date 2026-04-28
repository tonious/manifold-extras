import {Manifold, Vec3, GLTFMaterial, setMaterial} from 'manifold-3d/manifoldCAD';
import type {Plane, Ray, Segment, Triangle} from './math.ts';
import {
  add, cross, length, sub, dot, scale, normalize,
  rotateAlign, translate,
  equals,
  pointInPlane,
  barycentric,
  barycentricInTriangle,

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
  //sphere(pt,1.5);

  const b = barycentric(pt, tri);
  console.log({seg, tri, plane, pt, b})

  if (!barycentricInTriangle(b, tolerance)) return null;
  return pt;
}


// --------------------------------------------------------------------------
// Examples.

const results:Array<Manifold> = [];

const primaryMaterial:GLTFMaterial = {
  baseColorFactor: [1,1,0],
  alpha: 0.5, doubleSided: true
}

const secondaryMaterial:GLTFMaterial = {
  baseColorFactor: [1,0,1],
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
  geom = geom.transform(cross(mTrans, mRot));
  results.push(setMaterial(geom, material));
}

const plane = ([n, p=[0,0,0]]:Plane, material=primaryMaterial) => {
  let geom = Manifold.cube([50,50,0.1],true);
  const mRot = rotateAlign([0,0,1],n);
  const mTrans = translate(p);
  geom = geom.transform(cross(mTrans, mRot))
  results.push(setMaterial(geom, material));
}

const segment = ([a,b]:Segment, material=rayMaterial) => {
  const radius = 0.5;
  let geom = Manifold.hull([
    Manifold.sphere(radius).translate(a),
    Manifold.sphere(radius).translate(b),
  ]);
  geom = geom.add(Manifold.sphere(radius*3).translate(a));
  geom = geom.add(Manifold.sphere(radius*3).translate(b));
  results.push(setMaterial(geom, material));
}

const ray = ([n,p=[0,0,0]]:Plane, material=rayMaterial) => {
  const radius = 0.5;

  const mRot = rotateAlign([0,0,1],normalize(n));
  const mTrans = translate(p);
  let geom = Manifold.sphere(radius*3);
  geom = geom.add(Manifold.cylinder(10*radius,radius));
  geom = geom.add(Manifold.cylinder(radius*6,radius*3,0).translate(0,0,10*radius));

  geom = geom.transform(cross(mTrans, mRot))
  results.push(setMaterial(geom, material));
}

const sphere = (p:Vec3, radius:number=0.5, material = intersectionMaterial) => {
  results.push(setMaterial(Manifold.sphere(radius).translate(p), material))
}

const triangle = (tri:Triangle, material=primaryMaterial) => {
  const n = normalize(tri);
  const geom = Manifold.hull([
    ...tri,
    ...tri.map(p => add(p, scale(n,0.01)))
  ])
  results.push(setMaterial(geom,material));
}

export const segmentCylinderExample = () => {
  const radius = 5;
  const axis:Segment = [[0,-5,0],[0,20,30]];
  const edges:Segment[] = [
    [[0,20,30],[0,-5,0]],
    [[30,0,0],[-30,0,15]],
    [[-10,-15,0],[0,-5,-1]],
    [[8,20,33],[-8,20,33]]
  ];

  for (const edge of edges) {
    results.push(setMaterial(Manifold.hull([
      Manifold.sphere(radius).translate(axis[0]),
      Manifold.sphere(radius).translate(axis[1])
    ]), primaryMaterial));
    cylinder(edge);

    const pts = segmentCylinder(edge, axis, radius);
    for (const pt of pts) {
      sphere(pt,0.5)
    }
  }

  return results;
};

export const planePlaneExample = () => {
  const planeA:Plane = [[1,0.5,0],[0,-1,-5]]
  const planeB:Plane = [normalize([1,2,1]),[5,1,0]]

  plane(planeA, primaryMaterial);
  plane(planeB, secondaryMaterial);
  const [n,p] = planePlane(planeA, planeB)!;
  ray([n,p], intersectionMaterial);

  console.log(`Point is ${pointInPlane(p,planeA[0],planeA[1]) ? 'on' : 'not on'} plane A.`);
  console.log(`Point is ${pointInPlane(p,planeB[0],planeB[1]) ? 'on' : 'not on'} plane B.`);

  return results;
}


export const segmentPlaneExample = () => {
  const planeA:Plane = [normalize([0.5,0.5,1]),[0,0,0]]

  const seg:Segment = [[0,5,-10],[5,0,10]]

  plane(planeA);
  segment(seg);
  const pt = segmentPlane(seg, planeA);
  if (pt) sphere(pt,1.5)

  return results;
}

export const segmentTriangleExample = () => {
  const tri:Triangle = [
    [-50, 50, 0],
    [-50,-50, 0],
    [ 50,  0, 0]
  ];
  const segments:Array<Segment> = [
    [[0,5,-10],[5,0,10]],
    [[15,25,10], [15,25,-10]]
  ];

  triangle(tri);
  for (const seg of segments) {
    segment(seg);
    const pt = segmentTriangle(seg, tri);
    if (pt) sphere(pt,1.5)
  }

  return results;
}

//export default segmentPlaneExample;
export default segmentCylinderExample;
//export default segmentTriangleExample;
//export default planePlaneExample;
