import {setMaterial, Mesh, Manifold} from 'manifold-3d/manifoldCAD';
import type {GLTFMaterial, MeshOptions, Vec3} from 'manifold-3d/manifoldCAD';

import {wireframe} from './wireframe.ts';
import type {HalfEdge} from './meshutil.ts';
import {
  runEdges,  
  halfEdgeSegment,
  faceTriangles,
  halfedgeOpposite,
  mergedVertex,
  edgeKey,
  halfedgeKey,
  vertexPosition,
} from './meshutil.ts';
import {
  sub, scale, add, equals, length, normalize, dot, lerp,
  projectToPlane, closestPointOnSegmentToSegment,
} from './math.ts';
import {torus} from './torus.ts';
import type {Segment, Triangle} from './math.ts';
import { offsetAligned } from './offset.ts';
import type { SurfaceVertex } from './offset.ts';

const {cube, cylinder, union} = Manifold;

/**
 * This doesn't work well near center of explosion.  Hm.
 */
const explode = (parts:Array<Manifold>, factor:number=2, linear:number=0) => {
  if (!parts.length) return [];
  const centers = parts.map(obj => {
    const bb = obj.boundingBox();
    return lerp(bb.max, bb.min, 0.5);
  });
  const weights = parts.map(obj => obj.volume());
  const weight = weights.reduce((a,b) => a+b);

  const center = centers
      .map((p,idx) => scale(p, weights[idx]/weight))
      .reduce((a,b) => add(a,b));

  return parts.map((obj,idx) => {
    const c = centers[idx]
    const v = sub(c,center);
    const n = normalize(projectToPlane(v,[0,0,1]));

    //const x = add(center,scale(v,(factor-1)/factor))
    const x = scale(c, (factor-1));
    const l = scale(n,linear);
    return obj.translate(add(x,l))
  })
}

const tetrahedron = (sv1: SurfaceVertex, sv2: SurfaceVertex, sv3: SurfaceVertex, v1: Vec3) => {
  const numTri = 4;
  const numProp = 6; // 3 position, 3 normal.
  const numVert = numTri*3;

  const vertProperties = new Float32Array(numProp * numVert);
  const triVerts = new Uint32Array(3 * numTri);

  let vert = 0;
  let tri = 0;
  const vertex = (n:Vec3,p:Vec3) => {
    for (let i = 0; i < 3; i++) {
      vertProperties[vert*numProp+i] = p[i];
      vertProperties[vert*numProp+i+3] = n[i];
    };
    return (++vert)-1;
  }
  const triangle = (vertices:number[]) => {
    for (let i = 0; i < 3; i++) {
      triVerts[tri*3+i] = vertices[i];
    }
    return tri++;
  }

  // Back faces.
  const pts = [sv1,sv2,sv3].map(([,p]) => p);
  pts.push(v1);
  const triangles = [
    [1,0,3], [0,2,3], [2,1,3]
  ]

  for (const t of triangles) {
    const tri = t.map(v => pts[v]) as Triangle;
    const n = normalize(tri);
    const verts = tri.map(p => vertex(n,p));
    triangle(verts);
  }
  
  // Front face:
  triangle([sv1,sv2,sv3].map(([n,p]) => vertex(n,p)));

  const meshOpts:MeshOptions = {
    numProp, triVerts, vertProperties
  }
  const mesh = new Mesh(meshOpts);
  mesh.merge();

  return new Manifold(mesh);
};


const closestProjection = (segment:Segment, edges:Array<HalfEdge>, halfedgeToSegment:(e:HalfEdge)=>Segment, radius:number) => {
  const [a,b] = segment;
  const ba = sub(b,a);

  return edges
    .map(e => [e,halfedgeToSegment(e)])
    .map(([e,s]) => {
      const [,p] = s as Segment;
      const t = Math.abs(dot(ba,sub(p,a))/dot(ba,ba));
      return [e,s,t] as [HalfEdge,Segment,number]
    })
    .toSorted(([,,a],[,,b]) => b-a)
    .filter(([,,t]) => t>=0 && t<=1)
    .filter(([,s]) =>length(closestPointOnSegmentToSegment(segment,s))<radius)
    .map(([e]) => e)
    .find(() => true) ?? null;
}

export type ChamferParameters = {
    originalID: number;
    radius: number;
    faceID?: number;
    invert?: boolean;
}

export const tetrahedronChamfer = (mesh:Mesh, args:ChamferParameters) => {
  const {radius, originalID} = args;

  // FIXME: This doesn't detect cycles.

  const insideTriangles = new Set(faceTriangles(mesh, originalID));
  const edges = [...runEdges(mesh, insideTriangles)];
  const left = [...offsetAligned(mesh, edges, insideTriangles, radius)];
  const right:Array<[SurfaceVertex,SurfaceVertex]> = [...offsetAligned(mesh,
    edges.map(e => halfedgeOpposite(mesh,e)),
    new Set(new Array(mesh.numTri).keys()).difference(insideTriangles),
    radius
  )].map(v => [v[1],v[0]]);

  // Take the intersection points and create a set of halfedges, hopefully
  // to make it easier to order those halfedges.
  // This is all a little convoluted, but made sense at the time.
  const pts:Array<Vec3> = [];
  const normals:Array<Vec3> = []
  const svToEdges = (segments: Array<[SurfaceVertex,SurfaceVertex]>) => {
    const svToVertex = (sv:SurfaceVertex) => {
      const [nt,pt] = sv;
      const idx = pts.findIndex(p => equals(p,pt, 1e-3));
      if (idx >= 0 ) return idx;

      pts.push(pt);
      normals.push(nt);
      return pts.length - 1; 
    }

    const svToEdge = (sv1:SurfaceVertex, sv2:SurfaceVertex):HalfEdge => {
      return [svToVertex(sv1), svToVertex(sv2)]
    }

    const edges:HalfEdge[] = [];
    for (const segment of segments.filter(s => s.length === 2)) {
      const [v1,v2] = svToEdge(...segment);
      edges.push([v1,v2]);
    }
    return edges;
  }

  const rightEdges = svToEdges(right);
  const leftEdges = svToEdges(left);

  // Okay, that's done with.  Now, let's zipper our three sets of edges together.
  let edge:HalfEdge|null = edges[0];
  let rightEdge:HalfEdge|null = null;
  let leftEdge:HalfEdge|null = null

  // Advance until we find an auspiciously aligned edge.
  // This is, of course, flakey.
  let i=0;
  while (edge && i++ < edges.length) {
    rightEdge = closestProjection(halfEdgeSegment(mesh,edge), rightEdges, edge => edge.map(v => pts[v]) as Segment, radius);
    leftEdge = closestProjection(halfEdgeSegment(mesh,edge), leftEdges, edge => edge.map(v => pts[v]) as Segment, radius);
    if (rightEdge && leftEdge) break;

    edge = edges.find((other) =>
      edge 
      && mergedVertex(mesh,other[0]) === mergedVertex(mesh,edge[1])
    ) ?? null;
  }
  if (!edge || !(leftEdge && rightEdge)) throw new Error("I don't know where to start.");


  // Set up for the big loop.
  let chamferParts:Array<Manifold> = [];
  const seenEdge = new Set();
  const seenOffsets = new Set();
  let leftt = 0;
  let rightt = 0;

  let [ve1, ve2] = edge;
  let [vr1, vr2] = rightEdge;
  let [vl1, vl2] = leftEdge;

  let touched = true;
  while (touched && (edge || leftEdge || rightEdge)) {
    touched = false;

    const [pe1,pe2] = halfEdgeSegment(mesh, [ve1, ve2]);
    const [pr1, pr2, pl1, pl2] = [vr1, vr2, vl1, vl2].map(v => pts[v]);
    const [nr1, nr2, nl1, nl2] = [vr1, vr2, vl1, vl2].map(v => normals[v]);

    const pe2e1 = sub(pe2,pe1);
    rightt = dot(sub(pr2,pe1),pe2e1)/dot(pe2e1,pe2e1);
    leftt =  dot(sub(pl2,pe1),pe2e1)/dot(pe2e1,pe2e1);

    if (edge && ((rightt > 1 && leftt > 1) || rightt == leftt || (!leftEdge && !rightEdge))) {
      seenEdge.add(edgeKey(mesh,edge));

      edge = edges.find((other) => 
        !seenEdge.has(edgeKey(mesh,other))
        && mergedVertex(mesh,other[0]) === mergedVertex(mesh,edge![1])
      ) ?? null;

      if (edge) {
        // Interior tetrahedron.
        let geom = Manifold.hull([pr1, pl1, pe1, pe2])
        geom = geom.calculateNormals(0,60);
        //geom = setMaterial(geom,filletMaterial);
        chamferParts.push(geom);
        [ve1,ve2] = edge;
      }

      touched = true;
    } else if (leftEdge && (rightt > leftt || !rightEdge)) {
      seenOffsets.add(halfedgeKey(leftEdge));
      leftEdge = leftEdges.find(e => !seenOffsets.has(halfedgeKey(e)) && e[0] === leftEdge![1]) ?? null;
      if (leftEdge) {
        let geom = tetrahedron([nr1, pr1], [nl2,pl2], [nl1,pl1], pe1);
        //geom = setMaterial(geom,baseMaterial);
        //geom = geom.translate([0,0,-25]);
        chamferParts.push(geom);
        [vl1, vl2] = leftEdge;
      }
      touched = true;

    } else if (rightEdge && (rightt < leftt || !leftEdge)) {
      seenOffsets.add(halfedgeKey(rightEdge));
      rightEdge = rightEdges.find(e => !seenOffsets.has(halfedgeKey(e)) && e[0] === rightEdge![1]) ?? null;
      if (rightEdge) {
        let geom = tetrahedron([nr1, pr1], [nr2,pr2], [nl1,pl1], pe1)
        //geom = setMaterial(geom,shapeMaterial);
        //geom = geom.translate([0,0,25]);
        chamferParts.push(geom);
        [vr1, vr2] = rightEdge;
      }
      touched = true;
    }
  }

  // At this point, `edge` should be exhausted.
  // There should still be one segment for both left and right.
  let pe2 = vertexPosition(mesh,ve2);
  let [pr1, pr2, pl1, pl2] = [vr1, vr2, vl1, vl2].map(v => pts[v]);
  const [nr1, nr2, nl1, nl2] = [vr1, vr2, vl1, vl2].map(v => normals[v]);
  chamferParts.push(tetrahedron([nr1, pr1], [nl2,pl2], [nl1,pl1], pe2));
  chamferParts.push(tetrahedron([nr1, pr1], [nr2,pr2], [nl1,pl1], pe2));

  return chamferParts;
}

// --------------------------------------------------------------------------
// Examples.

const example = () => {
  const chamferR = 5;
  const minSharpAngle = 30;

  const baseMaterial:GLTFMaterial = {
    baseColorFactor: [1,1,0],
    alpha: 0.5, doubleSided: true,
    attributes: ['NORMAL']
  }
  const shapeMaterial:GLTFMaterial = {
    baseColorFactor: [0,1,1],
    alpha: 0.5,  doubleSided: true,
    attributes: ['NORMAL']
  }
  const filletMaterial:GLTFMaterial = {
    baseColorFactor: [1,0,1],
    //alpha: 0.5,  doubleSided: true,
    attributes: ['NORMAL']
  }

  let bases = [
    cube([100,100,10], true).translate([0,0,5]),
    torus(50,40/2).translate([-50,0,0])
  ].map(shape => setMaterial(shape,baseMaterial).calculateNormals(0,minSharpAngle));
  
  let shapes = [
    cube([35,35,25], true)
      .translate([0,0,25/2]),
    cube([35,35,25], true)
      .translate([-35/2,0,25/2+0.01])
      .add(cylinder(25,35/2,35/2).translate([0,0,0.01]))
      .translate([10,0,0]),
    cylinder(35,35/2,35/2,16)
      .translate([0,0,0.1]),
    cylinder(50,35/2, 35/2)
      .translate([0,0,-15]).rotate([0,30,0]),
    torus(25,10)
      .rotate([-60,0,0]).translate([0,0,22]),
    torus(25,10)
      .rotate([90,0,0]).translate([0,0,25]),
  ].map(shape => setMaterial(shape,shapeMaterial).calculateNormals(0,minSharpAngle));

  // Not all of these work right now, and some are very slow.
  const base = bases[1];
  shapes = [2].map(n => shapes[n]);

  const results = []
  for (const shape of shapes) {
    const geom = base.add(shape);
    const mesh = geom.getMesh();
    let chamferParts:Manifold[] = [];

    try {
      chamferParts = tetrahedronChamfer(mesh, {
        originalID: shape.originalID(),
        radius: chamferR
      });
    } catch (e) {
      console.error(e);
      continue;
    }

    // Assemble chamfer.
    if (false) chamferParts = explode(chamferParts,2.5);
    chamferParts = chamferParts.map(part => setMaterial(part, filletMaterial));
    let chamfer = union(chamferParts);

    // Show geom and chamfer separately.
    if (false) results.push(geom);
    if (false) results.push(chamfer);
    
    // Union and/or smooth results.
    let result = geom.add(chamfer);
    if (false) result = result.smoothByNormals(0).refineToTolerance(0.1)
    if (true) results.push(result);

    // Show wireframe + normals.
    if (false) results.push(wireframe(mesh));
    if (false) results.push(wireframe(result));
    if (false) results.push(...chamferParts.map(part => wireframe(part)));
  }

  return results;
}

export default example;