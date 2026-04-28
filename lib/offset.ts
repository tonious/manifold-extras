import {Mesh, Manifold, setMaterial} from 'manifold-3d/manifoldCAD';
import type {GLTFMaterial, Vec3} from 'manifold-3d/manifoldCAD';

import type {HalfEdge} from './meshutil.ts';
import {sub, equals, length, dot, lerp, constrainToSegment} from './math.ts';
import {
  runEdges, halfedgesOf, halfEdgeCycles, halfEdgeSegment, vertexNormal, faceTriangles, mergedVertex,
} from './meshutil.ts';


import type {Segment} from './math.ts';
import {segmentCylinder} from './intersection.ts';
import {torus} from './torus.ts';
import { segmentsToManifolds } from './wireframe.ts';
import { batchUnion } from './batch.ts';


export type SurfaceVertex = [normal:Vec3, point:Vec3];

/**
 * Offset `path` into `triangles` by `distance`.
 * Assumes that `path` is a single cycle, however it does not need to be ordered.
 * Results will not be ordered, and may contain cycles.
 * 
 * Beware of wild geese.
 */
export function* offsetAligned(mesh: Mesh, path:Array<HalfEdge>, triangles:Iterable<number>, distance:number):Iterable<[SurfaceVertex,SurfaceVertex]> {
  for (const t of triangles) {

    let tpts:Array<[SurfaceVertex, HalfEdge]> = [];
    for (const tedge of halfedgesOf(mesh, t)) { // n=3.
      const tsegment = halfEdgeSegment(mesh, tedge);
      let pts:Array<SurfaceVertex> = [];

      // Find all intersections.
      for (const edge of path) {
        const segment = halfEdgeSegment(mesh, edge);
        for (const pt of segmentCylinder(tsegment, segment, distance)) {
          if (pts.find(([,p]) => equals(p,pt, 1e-3))) continue;

          // Interpolate normal.
          const [a,b] = tsegment;
          const ba = sub(b,a);
          const t1 = dot(sub(pt,a),ba) / dot(ba,ba);
          const nt = lerp(vertexNormal(mesh,tedge[0]), vertexNormal(mesh,tedge[1]), t1);
          pts.push([nt,pt])
        }
      }

      for (const [n, p] of pts) {
        // Find the distance to the nearest edge.
        const [l,edge] = path
          .map((edge):[number,HalfEdge] => {
            const segment = halfEdgeSegment(mesh,edge);
            return [length([p, constrainToSegment(segment, p)]),edge];
          })
          .toSorted(([l1],[l2]) => l2-l1)
          .pop()!

        if (l < distance - 1e-3) continue;
        tpts.push([[n,p], edge]);
      }
    }

    if(tpts.length >= 2) {
      // Keep the same winding direction as the nearest intersection edge.
      const [[,edge]] = tpts;
      const [a,b] = halfEdgeSegment(mesh, edge);
      const ba = sub(b,a);
      const sorted = tpts
          .map(([tpt,]) => tpt)
          .map(([n,p]):[SurfaceVertex,number] => {
            const t = dot(sub(p,a),ba) / dot(ba,ba);
            return [[n,p],t];
          })
          .toSorted(([,t1],[,t2]) => t1-t2)
          .map(([tpt,]) => tpt);

      for (let i=0; i<sorted.length-1; i++) {
        const [,p1] = sorted[i];
        const [,p2] = sorted[i+1];
        if (equals(p1,p2)) continue;

        yield [sorted[i], sorted[i+1]]
      }
    } else if (tpts.length !== 0) {
      console.log(`Triangle ${t} has ${tpts.length} intersections!`);
      //for (const [pt,] of tpts) yield [pt];
    }
  }
}

export type OffsetParameters = {
    originalID: number;
    faceID?: number;
    distance: number;
    invert?: boolean;
}

type CacheRecord = {
    triangles: Set<number>;
    cycles: Array<HalfEdge[]>;
}
const offsetCache:Map<Mesh, CacheRecord> = new Map(); 

/**
 * Offset a face or run.
 * 
 * Beware of wild geese.
 */
export function offset(mesh:Mesh, args:OffsetParameters) {
    const {faceID, originalID, distance} = args; 
    const invert = args.invert ?? false;

    if (!offsetCache.has(mesh)) {
        const triangles = new Set([...faceTriangles(mesh, originalID, faceID)]);

        const edges = [...runEdges(mesh, triangles)]
            .map(edge => edge.map(v => mergedVertex(mesh,v)) as HalfEdge);
        const cycles = halfEdgeCycles(edges);
        offsetCache.set(mesh, {triangles, cycles});
    }
    const {triangles, cycles} = offsetCache.get(mesh)!

    const offsetTriangles = invert ? new Set(new Array(mesh.numTri).keys()).difference(triangles): triangles;
    const offsets:Array<Segment[]> = [];
    for (const cycle of cycles) {
        const surfaceVertices = [...offsetAligned(mesh, cycle, offsetTriangles, distance)];
        const segments:Segment[] = surfaceVertices.map(([[,p1],[,p2]]) => [p1,p2] as Segment)
        offsets.push(segments)
    }
    return offsets;
}

// --------------------------------------------------------------------------
// Examples.

const baseMaterial:GLTFMaterial = {
    baseColorFactor: [1,1,0],
    //alpha: 0.5, doubleSided: true,
    attributes: ['NORMAL']
}
const shapeMaterial:GLTFMaterial = {
    baseColorFactor: [0,1,1],
    //alpha: 0.5,  doubleSided: true,
    attributes: ['NORMAL']
}
const intersectionMaterial:GLTFMaterial = {
    baseColorFactor: [1,0,0],
    unlit: true
}

export const example = () => {
    const minSharpAngle = 60;

    const bases = [
        //Manifold.cube([100,100,10], true).translate([0,0,5]),
        torus(50,40/2).translate([-50,0,0])
    ].map(shape => setMaterial(shape,baseMaterial).calculateNormals(0,minSharpAngle));
    
    const shapes = [
/*
        Manifold.cube([35,35,25], true)
            .translate([0,0,25/2]),
        Manifold.cube([35,35,25], true)
            .translate([-35/2,0,25/2+0.01])
            .add(Manifold.cylinder(25,35/2,35/2).translate([0,0,0.01]))
            .translate([10,0,0]),
*/
        Manifold.cylinder(35,35/2,35/2,16).translate([0,0,0.1]),
//        Manifold.cylinder(50,35/2, 35/2).translate([0,0,-15]).rotate([0,30,0]),
        torus(25,10).rotate([-60,0,0]).translate([0,0,22]),
        torus(25,10).rotate([90,0,0]).translate([0,0,25]),
    ].map(shape => setMaterial(shape,shapeMaterial).calculateNormals(0,minSharpAngle));


    const spacing =[150,150];
    const results:Manifold[] = [];
    for (let i=0; i<bases.length; i++) {
        const base = bases[i];
        const y = (i-bases.length/2)*spacing[1];
        for (let j=0; j<shapes.length; j++) {
            console.log(`Base ${i}, shape ${j}`);
            const x = (j-bases.length/2)*spacing[0];
            const shape = shapes[j];

            let geom = base.add(shape);
            const mesh = geom.getMesh();
            let paths = [
                ...offset(mesh, {originalID: shape.originalID(), distance: 4}),
                ...offset(mesh, {originalID: shape.originalID(), distance: 4, invert: true})
            ];
            //const paths = intersections(mesh, shape.originalID()).map(path => halfedgesToSegments(mesh, path));

            for (const path of paths) {
                const intersection = batchUnion(segmentsToManifolds(path,0.5));
                results.push(setMaterial(intersection, intersectionMaterial).translate([x,y,0]));
            }

            results.push(geom.translate([x,y,0]))
        }
    }
    return results;
};

export default example;