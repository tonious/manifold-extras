import {setMaterial, Mesh, Manifold, CrossSection} from 'manifold-3d/manifoldCAD';
import type {GLTFMaterial, Vec3} from 'manifold-3d/manifoldCAD';
import {wireframe} from './wireframe.ts';
import type {HalfEdge} from './meshutil.ts';
import {halfedgesOf, runEdges, uniqueHalfedges, vertexPosition, curvedTriangles} from './meshutil.ts';
import {batchUnion} from './batch.ts';
import * as math from './math.ts';

const {constrainToSegment, length, sub, lerp} = math.Vec3;
const {cylinder, cube, sphere, union, hull} = Manifold;

const distanceTo = (segment:[Vec3, Vec3], p:Vec3) => {
  const pn = constrainToSegment(segment, p);
  return length(sub(pn, p));
}

function segmentEdges(mesh:Mesh, edges:Iterable<HalfEdge>, segments:Array<HalfEdge>, radius:number=1) {
  console.log("segmentEdges()")
  
  function *intersection(edges:Iterable<HalfEdge>) {
    const s = sphere(0.25)

    for (const edge of edges) {
      //const [ve1, ve2] = edge;
      const [pe1, pe2] = edge.map(v => vertexPosition(mesh,v));
      //const u = subVec3(pe2, pe1);

      //let bestAngle = 2
      let bestSegment:[number,number]|null = null;
      let skip = true;
      let bestPoint:Vec3|null = null;
      let bestDistance = null;

      for (const segment of segments) {
        const [p1, p2] = segment.map(v => vertexPosition(mesh,v))

        // How close are we?
        // Distance from each vertex of edge to contour segment.
        const d1 = distanceTo([p1, p2], pe1);
        const d2 = distanceTo([p1, p2], pe2);
        if (d1<radius && d2<radius) {
          // Too close.
          skip = true
          break;
        }
        if(d1>radius && d2>radius) {
          // Not close.
          //skip = true;
          continue;
        }
        skip = false;

        const t = (radius-d1)/(d2-d1);
        if (t <= 0 || t >= 1) continue;

        //const v = subVec3(p2, p1)
        const distance = (t*d1+(1-t)*d2)

        if (typeof bestDistance !== 'number' || bestDistance >= distance) {
          // No need for special cases for t === 0 || t === 1
          bestSegment = segment;
          //bestAngle = angle;
          bestDistance = distance;

          bestPoint = lerp(pe1, pe2, t);
          //console.log(bestDistance)
        }
      }

      if (!skip && bestPoint && bestSegment) {
                /*

        yield (s.translate(bestPoint))
        console.log({bestDistance})
              */

        const [p1,p2] = bestSegment.map(v => vertexPosition(mesh,v))
        const ps = lerp(p1, p2, 0.5)
        yield hull([
          s.translate(bestPoint),
          s.translate(ps)
        ]);
      }
    }
  }

  const result=batchUnion(intersection(edges))
  console.log("segmentEdges() done")
  return result;
}

export const torus = (major:number, minor:number) => {
  return CrossSection.circle(minor).translate([major,0]).revolve();
};

const example = () => {
  const chamferR = 8;
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
    //cylinder(25,35/2,35/2,16).translate([0,0,0.1]),
    cylinder(50,35/2, 35/2).translate([0,0,-15]).rotate([0,30,0]),
    //torus(10,25).rotate([-60,0,0]).translate([0,0,22]),
    //torus(10,25).rotate([90,0,0]).translate([0,0,25]),
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
    const triangles = [...curvedTriangles(mesh)];
    const edges = halfedgesOf(mesh, triangles);

    const segments = [...uniqueHalfedges(mesh, runEdges(mesh))];
    const subset =  segments.slice(45,46);

    results.push(setMaterial(
        segmentEdges(mesh, edges, subset, chamferR),
        {
            baseColorFactor: [0,0,1],
            unlit: true
        }
    ));

    // Show wireframe + normals.
    if (true) results.push(wireframe(mesh, {triangles}));
  }

  return results;
}

export default example;