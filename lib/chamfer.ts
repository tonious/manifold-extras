import {setMaterial, Mesh, Manifold, CrossSection} from 'manifold-3d/manifoldCAD';
import type {GLTFMaterial, Vec3} from 'manifold-3d/manifoldCAD';

import {wireframe} from './wireframe.ts';
import type {HalfEdge} from './meshutil.ts';
import {
  halfedgeKey, runEdges, uniqueHalfedges, halfedgesOf, halfEdgeCycles,
  curvedTriangles, faceTriangles, flatTriangles,
  vertexPosition, vertexNormal, mergedVertices
} from './meshutil.ts';
import {length, sub, constrainToSegment, scale, add, equals, projectToPlane, normalize} from './math.ts';
import type {Segment} from './math.ts';
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
    const key = halfedgeKey(mesh, edge);
    segments.set(key, edge.map(v => vertexPosition(mesh, v)) as Segment);
  }

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
      for (const pt of pts) {
        // We're radius away from _this_ segment, but there exists another closer 
        // segment leaving this point inside radius.
        if (pointIsTooClose(pt)) continue;

        if (!segmentPoints.has(key)) segmentPoints.set(key, []);
        segmentPoints.get(key)!.push(pt);
      }
    }
  }
  return segmentPoints;
}

/**
 * Generate a list of points offset from edges.
 * Results will mapped to the closest edge by halfedgeKey.
 * 
 * Todo: Need to ensure these actually land on a triangle within the list.
 * Todo: normals can be inferred as part of this path.
 */
function offset(mesh:Mesh, edges:Array<HalfEdge>, radius:number=1, triangles?:Iterable<number>) {  
  const segments:Map<string,Segment> = new Map();
  const segmentPoints:Map<string, Array<Vec3>> = new Map();
  typeof triangles;

  for (const edge of edges) {
    const key = halfedgeKey(mesh, edge);
    const segment = edge.map(v => vertexPosition(mesh, v)) as Segment;
    segments.set(key, segment);
  }

  for (const edge of edges) {
    const key = halfedgeKey(mesh, edge);
    for (const v of edge.map(v => [v, ...mergedVertices(mesh, v)]).flat()) {
      // FIXME huge hack! This is only for testing, and very limited at that.
      const p = vertexPosition(mesh, v);
      const n = vertexNormal(mesh, v);

      if (equals(n,[0,0,1]) || equals(n,[0,0,-1])) continue;

      const nproj = normalize(projectToPlane(n,[0,0,1]))

      //console.log({n,p,nproj})
      if (!segmentPoints.has(key)) segmentPoints.set(key, []);
      segmentPoints.get(key)!.push(add(p,scale(nproj,radius)))
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
    const key = halfedgeKey(mesh, edge);
    const curvedPts = curved.get(key) ?? [];

    // Fixme.  This ain't right.
    const flatPts = curvedPts.length > 0 ? [] : flat.get(key) ?? [];

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
    attributes: ['NORMAL']
  }
  const filletMaterial:GLTFMaterial = {
    baseColorFactor: [1,0,1],
    alpha: 0.5,  doubleSided: true,
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
  const s = setMaterial(Manifold.sphere(0.5),{baseColorFactor:[0,0,0], unlit: true});
  const st = (p:Vec3) => showpts.push(s.translate(p));

  const results = []
  for (const shape of shapes) {
    const geom = base.add(shape);
    const mesh = geom.getMesh();

    // Two opposite paths around our intersection line.
    // Not sure this should depend on runOriginalID, tbh.
    const allPtsA = getPts(mesh, mesh.runOriginalID[0], chamferR);
    const allPtsB = getPts(mesh, mesh.runOriginalID[1], chamferR);

    console.log(`Collecting chamfer volumes...`);

    // Turn an unordered array of half edges (forming the intersection contour)...
    const edges = [...uniqueHalfedges(mesh, runEdges(mesh))]
    // ...into cycles of ordered half edges.
    const cycles = halfEdgeCycles(edges);

    const chamferParts = [];
    for (const edge of cycles[cycles.length-1].slice(16,32)) {
      const key = halfedgeKey(mesh, edge);
      const segment = edge.map(v => vertexPosition(mesh,v)) as Segment;

      if (!(allPtsA.has(key) && allPtsB.has(key))) {
        console.log({edge, key, ptsA: allPtsA.has(key), ptsB: allPtsB.has(key)});
        continue;
      }
      const ptsA = allPtsA.get(key) ?? [];
      const ptsB = allPtsB.get(key) ?? [];

      const pts = [ptsA, ptsB, segment].flat();
      for (const pt of pts) st(pt);

      const vol = Manifold.hull(pts);
      if (vol.isEmpty()) {
        console.log({edge, key, ptsA, ptsB: ptsB, segment, volume:vol.volume()});
        continue;
      }

      chamferParts.push(setMaterial(vol.calculateNormals(0,0),filletMaterial));
    }
    const chamfer = union(chamferParts)


    //results.push(wireframe(chamfer))
    console.log(`...Done!`)

    //results.push(batchUnion([...curvedPts.values(), ...flatPts.values()].flat().map(st)))

    //const flatTris = [...arbitraryOffset(mesh, flat, segments, chamferR)];
    // Show wireframe + normals.
    if (false) results.push(wireframe(mesh));

    results.push(geom);
    results.push(chamfer);
    //results.push(chamfer.add(geom))
    //console.log({segments})
    //console.log(mergedVertices(mesh,4))
  }

  results.push(batchUnion(showpts));

  // OS X preview is a little more responsive at this scale.
  return results.map(geom => geom.scale(1000));
}

export default example;