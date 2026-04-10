import {setMaterial, Mesh, Manifold, CrossSection} from 'manifold-3d/manifoldCAD';
import type {GLTFMaterial} from 'manifold-3d/manifoldCAD';
import {halfedgesToSegments, segmentsToManifolds, wireframe} from './wireframe.ts';
import type {Segment} from './wireframe.ts';
import type {HalfEdge} from './meshutil.ts';
import {runEdges, uniqueHalfedges, vertexPosition, curvedTriangles, triangleVertices, halfedgeKey} from './meshutil.ts';
import {batchUnion} from './batch.ts';
import * as math from './math.ts';
import { segmentCylinder } from './intersection.ts';

const {length, sub, constrainToSegment, lerp} = math.Vec3;
const {cube, union} = Manifold;

function segmentTriangles(mesh:Mesh, triangles:Iterable<number>, edges:Array<HalfEdge>, radius:number=1) {
    const result:Array<Manifold> = [];
    const tolerance = 1e-3; // mm.
    const s = Manifold.sphere(0.5);
    const seen:Set<string> = new Set();

    const segments = [...halfedgesToSegments(mesh,edges)];
    for (const t of triangles) {
        const [v1, v2, v3] = triangleVertices(mesh, t);
        for (const tedge of [[v1, v2], [v2, v3], [v3, v1]] as Array<HalfEdge>) {
            const tkey = halfedgeKey(mesh,tedge);
            if (seen.has(tkey)) continue;
            seen.add(tkey);

            const tsegment = tedge.map(v => vertexPosition(mesh, v)) as Segment
            const candidates:Array<any> = [];
            for (const segment of segments) {
                const pts = segmentCylinder(tsegment, segment, radius)
                for (const pt of pts) {
                  const closer = segments
                    .map(seg => length(sub(pt,constrainToSegment(seg, pt))))
                    .find(l => l < (radius-tolerance));
                  if ((closer ?? -1) >= 0) continue;

                  result.push(Manifold.hull([
                    s.scale(0.30).translate(pt),
                    s.scale(0.30).translate(lerp(segment[0], segment[1], 0.5))
                  ]))

                  candidates.push(pt);
                }
            }

            for (const pt of candidates) {
              result.push(s.translate(pt));
            }
          
        }
    }
    return batchUnion(result.flat())
}

export const torus = (minor:number, major:number) => {
  return CrossSection.circle(minor).translate([major, 0]).revolve();
};

const example = () => {
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

  const base = setMaterial(cube([100,100,10], true).translate([0,0,5]), baseMaterial);
  const shapes = [
    //cube([35,35,25], true).translate([0,0,25/2]),
    //Manifold.cylinder(25,35/2,35/2,16).translate([0,0,0.1]),
    //Manifold.cylinder(50,35/2, 35/2).translate([0,0,-15]).rotate([0,30,0]),
    //torus(10,25).rotate([-60,0,0]).translate([0,0,22]),
    torus(10,25).rotate([90,0,0]).translate([0,0,25]),
  ].map(shape => setMaterial(
    shape.calculateNormals(0,minSharpAngle),
    shapeMaterial
  ));

  const results = []
  for (const shape of shapes) {
    const geom = union([
      base.calculateNormals(0,minSharpAngle),
      shape.calculateNormals(0,minSharpAngle)
    ]);
    results.push(geom);

    const mesh = geom.getMesh();
    let segments = [...uniqueHalfedges(mesh, runEdges(mesh))];
    let triangles = [...curvedTriangles(mesh)];

    //triangles = [208,209] //[...triangles.slice(203,204)];
    //segments = [...segments.slice(45,46)];
    //segments = segments.filter(([a,b]) => a === 127 || b === 127)
    if (true) {
        results.push(setMaterial(
            segmentTriangles(mesh, triangles, segments, chamferR),
            {
                baseColorFactor: [0,0,1],
                unlit: true
            }
        ));
    }

    if (false) {
        results.push(setMaterial(
            batchUnion(segmentsToManifolds(halfedgesToSegments(mesh, segments), chamferR)),
            {
                baseColorFactor: [0,1,0],
                unlit: false,
                alpha: 0.8,
            }
        ));
    }

    // Show wireframe + normals.
    if (true) results.push(wireframe(mesh, {triangles}));

  }

  // OS X preview is a little more responsive at this scale.
  return results.map(geom => geom.scale(1000));
}

export default example;