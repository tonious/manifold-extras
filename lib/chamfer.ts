import {setMaterial, Mesh, Manifold, CrossSection} from 'manifold-3d/manifoldCAD';
import type {GLTFMaterial, Vec3} from 'manifold-3d/manifoldCAD';

import {wireframe} from './wireframe.ts';
import type {HalfEdge} from './meshutil.ts';
import {
  edgeKey, halfedgeKey, runEdges, uniqueHalfedges, halfedgesOf, halfEdgeCycles,
  curvedTriangles, faceTriangles, flatTriangles,
  vertexPosition, vertexNormal,
  triangleVertices,
  edgeEquals
} from './meshutil.ts';
import {
  sub, scale, add, equals, cross, length,  normalize,
  constrainToSegment, pointInTriangle,
  pointInPlane
} from './math.ts';
import type {Segment, Triangle} from './math.ts';
import { segmentCylinder } from './intersection.ts';
import { batchUnion } from './batch.ts';

/**
 * Generate a list of points offset from edges aligned on half-edges belonging to triangles.
 * Results will mapped to the closest edge by halfedgeKey.
 * 
 * Todo: normals can be inferred as part of this path.
 */
function alignedOffset(mesh:Mesh, edges:Array<HalfEdge>, radius:number=1, triangles:Iterable<number>, tolerance:number=1e-3) {  
  const segments:Map<string,Segment> = new Map();
  const segmentPoints:Map<string, Array<Vec3>> = new Map();

  for (const edge of edges) {
    const key = edgeKey(mesh, edge);
    segments.set(key, edge.map(v => vertexPosition(mesh, v)) as Segment);
  }

  // We're radius away from _this_ segment, but there exists another closer 
  // segment leaving this point inside radius.
  const pointIsTooClose = (pt:Vec3) => {
    const closerSegment = segments.values()
      .map(seg => length(sub(pt,constrainToSegment(seg, pt))))
      .find(l => l < (radius-tolerance));
    return (closerSegment ?? -1) >= 0;
  }

  // Iterate over triangle edges.
  const tedges = uniqueHalfedges(mesh,halfedgesOf(mesh, triangles));
  for (const tedge of tedges) {
    const tsegment = tedge.map(v => vertexPosition(mesh, v)) as Segment;
    for (const [key,segment] of segments.entries()) {
      const pts = segmentCylinder(tsegment, segment, radius)
        .filter(pt => !pointIsTooClose(pt))
      const [pt] = pts;
      if (pt) {
        if (!segmentPoints.has(key)) segmentPoints.set(key, []);
        segmentPoints.get(key)!.push(pt);
      }
    }
  }
  return segmentPoints;
}

/**
 * Generate a list of points offset from edges.
 * Results will mapped to the closest edge by edgeKey.
 * 
 * Todo: Need to ensure these actually land on a triangle within the list.
 * Todo: normals can be inferred as part of this path.
 */
function offset(mesh:Mesh, edges:Array<HalfEdge>, radius:number=1, triangles?:Iterable<number>, tolerance:number=1e-3) {  
  const segments:Map<string,Segment> = new Map();
  const segmentPoints:Map<string, Array<Vec3>> = new Map();
  
  for (const edge of edges) {
    const key = edgeKey(mesh, edge);
    const segment = edge.map(v => vertexPosition(mesh, v)) as Segment;
    segments.set(key, segment);
  }

  for (const t of (triangles ?? new Array(mesh.numTri).keys())) {
    const tri = triangleVertices(mesh,t).map(v => vertexPosition(mesh, v)) as Triangle;
    const n = normalize(tri);

    
    for (const edge of edges) {
      const na = normalize(sub(vertexPosition(mesh, edge[1]),vertexPosition(mesh, edge[0])))

      const checkPoint = (pr:Vec3) => {
        if (!pointInPlane(pr, n, tri[0])) return;
        //if (!pointInTriangle(pr, tri)) return;
        if (!segmentPoints.has(key)) segmentPoints.set(key, []);
        segmentPoints.get(key)!.push(pr);
      }

      // simple projection according to normal.
      const proj1 = (v: number, v2: number) => {
        const p = vertexPosition(mesh, v)
        const pn = vertexNormal(mesh, v2)
        return checkPoint(add(p, scale(pn,radius)))
      }

      // project along axis of plane intersections.  Dodgy.
      const proj2 = (v: number, v2: number) => {
        const p = vertexPosition(mesh, v)
        const pn = vertexNormal(mesh, v2)
        const axis = equals(n,pn) ? n : cross(pn, na);
        return checkPoint(add(p, scale(axis,radius)))
      }

      // The actual intersection is between a triangle and a circle, both in 3d space.
      // In this particular case, they should never be coplanar.
      // Right now, I'm preselecting curved vs flat triangles but I don't think that's
      // actually doable before looking at the halfedge.  One halfedge may be curved while
      // the other is not.  E.g.: intersection of a plane and an orthagonal cylinder.

      const key = edgeKey(mesh, edge);

      proj2(edge[0], edge[0]);
      proj2(edge[1], edge[1]);
    }
  }
  return segmentPoints;
}

const getPts = (mesh:Mesh, runID:number, radius:number=1):Map<string, Array<Vec3>> => {
  console.log(`Collecting points from run ${runID}...`)
  const triangles = [...faceTriangles(mesh, runID)];
  const edges = [...uniqueHalfedges(mesh, runEdges(mesh, triangles))]
  const curved = alignedOffset(mesh, edges, radius, curvedTriangles(mesh, triangles));
  const flat = offset(mesh, edges, radius, flatTriangles(mesh, triangles));

  const edgePts:Map<string, Array<Vec3>> = new Map()
  for (const edge of edges) {
    const key = edgeKey(mesh, edge);
    const curvedPts = curved.get(key) ?? [];

    const flatPts = flat.get(key) ?? [];

    edgePts.set(key,[curvedPts, flatPts].flat());
    //console.log({key, curvedPts, flatPts})
  }
  console.log(`...Done!`)
  return edgePts;
}

export const torus = (minor:number, major:number) => {
  return CrossSection.circle(minor).translate([major, 0]).revolve();
};

const example = () => {
  console.log(`Start`)
  const {union} = Manifold;

  const chamferR = 4;
  const minSharpAngle = 30;

  const baseMaterial:GLTFMaterial = {
    baseColorFactor: [1,1,0],
    alpha: 0.5, doubleSided: true
  }
  const shapeMaterial:GLTFMaterial = {
    baseColorFactor: [0,1,1],
    alpha: 0.5,  doubleSided: true,
  //  attributes: ['NORMAL']
  }
  const filletMaterial:GLTFMaterial = {
    baseColorFactor: [1,0,1],
    //alpha: 0.5,  doubleSided: true,
    attributes: ['NORMAL']
  }

  const base = setMaterial(Manifold.cube([100,100,10], true).translate([0,0,5]).calculateNormals(0,minSharpAngle), baseMaterial);
  const shapes = [
    //Manifold.cube([35,35,25], true).translate([0,0,25/2]),
    //Manifold.cube([35,35,25], true).translate([-35/2,0,25/2+0.01]).calculateNormals(0,minSharpAngle).add(Manifold.cylinder(25,35/2,35/2).translate([0,0,0.01]).calculateNormals(0,minSharpAngle)).translate([10,0,0]),
    //Manifold.cylinder(25,35/2,35/2,16).translate([0,0,0.1]).calculateNormals(0,minSharpAngle),
    //Manifold.cylinder(50,35/2, 35/2).translate([0,0,-15]).rotate([0,30,0]).calculateNormals(0,minSharpAngle),
    torus(10,25).rotate([-60,0,0]).translate([0,0,22]).calculateNormals(0,minSharpAngle),
    //torus(10,25).rotate([90,0,0]).translate([0,0,25]).calculateNormals(0,minSharpAngle),
  ].map(shape => setMaterial(shape,shapeMaterial));

  const showpts:Array<Manifold> = [];
  const s = Manifold.sphere(0.5,16);
  const st = (p:Vec3,c:Vec3=[0,0,0]) => showpts.push(
    setMaterial(s.translate(p),{baseColorFactor:c, unlit: true})
  );

  const results = []
  for (const shape of shapes) {
    const geom = base.add(shape);
    const mesh = geom.getMesh();

    // Two opposite paths around our intersection line.
    // Not sure this should depend on runOriginalID, tbh.
    const allPtsA = getPts(mesh, base.originalID(), chamferR);
    const allPtsB = getPts(mesh, shape.originalID(), chamferR);

    console.log(`Collecting chamfer volumes...`);

    // Turn an unordered array of half edges (forming the intersection contour)...
    const edges = [...uniqueHalfedges(mesh, runEdges(mesh))]
    // ...into cycles of ordered half edges.

    const chamferParts:Array<Manifold> = [];
    for (const edge of edges) {
      const segment = edge.map(v => vertexPosition(mesh,v)) as Segment;
      const [v1, v2] = edge;
      const adjacent = edges
        .filter(e => e.includes(v1)|| e.includes(v2))
        .filter(other => !edgeEquals(mesh, edge, other));

      if (adjacent.length > 2) {
        console.log(`${edge} has ${adjacent.length} neighbours.`);
        //continue;
      }

      const ptsA = [edge, /*...adjacent*/].map(e => allPtsA.get(edgeKey(mesh,e)) ?? []).flat()
      const ptsB = [edge, /*...adjacent*/].map(e => allPtsB.get(edgeKey(mesh,e)) ?? []).flat()
      for (const pt of ptsA)    st(pt, [1,0,0]); // Flat.
      for (const pt of ptsB)    st(pt, [0,1,0]);
      for (const pt of segment) st(pt, [0,0,1]);

      const pts = [segment, ptsA, ptsB].flat();

      const vol = Manifold.hull(pts);
      chamferParts.push(setMaterial(vol.calculateNormals(0,0),filletMaterial));
    }
    const chamfer = union(chamferParts)

    console.log(`...Done!`)
    // Show wireframe + normals.
    if (false) results.push(wireframe(mesh));

    results.push(geom);
    results.push(chamfer);
    //results.push(chamfer.add(geom))
  }

  results.push(...showpts);

  // OS X preview is a little more responsive at this scale.
  return true ? results.map(geom => geom.scale(1000)) : results;
}

export default example;