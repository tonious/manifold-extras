import {setMaterial, Manifold, CrossSection} from 'manifold-3d/manifoldCAD';
import type {GLTFMaterial} from 'manifold-3d/manifoldCAD';

import {wireframe} from './wireframe.ts';
import {
  runEdges, uniqueHalfedges,
  vertexPosition,
} from './meshutil.ts';
import type {Segment} from './math.ts';

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
    //alpha: 0.5, doubleSided: true
  }
  const shapeMaterial:GLTFMaterial = {
    baseColorFactor: [0,1,1],
    //alpha: 0.5,  doubleSided: true,
  //  attributes: ['NORMAL']
  }
  const filletMaterial:GLTFMaterial = {
    baseColorFactor: [1,0,1],
  //  alpha: 0.5,  doubleSided: true,
  //  attributes: ['NORMAL']
  }

  const base = setMaterial(Manifold.cube([100,100,10], true).translate([0,0,5]).calculateNormals(0,minSharpAngle), baseMaterial);
  const shapes = [
    //Manifold.cube([35,35,25], true).translate([0,0,25/2]),
    //Manifold.cube([35,35,25], true).translate([-35/2,0,25/2+0.01]).calculateNormals(0,minSharpAngle).add(Manifold.cylinder(25,35/2,35/2).translate([0,0,0.01]).calculateNormals(0,minSharpAngle)).translate([10,0,0]),
    //Manifold.cylinder(25,35/2,35/2,16).translate([0,0,0.1]).calculateNormals(0,minSharpAngle),
    Manifold.cylinder(50,35/2, 35/2).translate([0,0,-15]).rotate([0,30,0]).calculateNormals(0,minSharpAngle),
    //torus(10,25).rotate([-60,0,0]).translate([0,0,22]).calculateNormals(0,minSharpAngle),
    //torus(10,25).rotate([90,0,0]).translate([0,0,25]).calculateNormals(0,minSharpAngle),
  ].map(shape => setMaterial(shape,shapeMaterial));

  const results = []
  const [shape] = shapes;

  const geom = base.add(shape);
  const mesh = geom.getMesh();

  console.log(`Collecting chamfer volumes...`);
  const edges = [...uniqueHalfedges(mesh, runEdges(mesh))]

  const piecewise = false

  const s = Manifold.sphere(chamferR, 16);

  // Inner bead is a circle, of a consistant radius.
  // This means that the depth of the fillet is dependant
  // on the angle between the two surfaces.  A narrow angle
  // means a deeper fillet.
  // This means the intersection contour alone is not sufficient
  // to determine the chamfer volume.
  // Hacky hack hack.
  const c = Manifold.cube(chamferR*3, true);

  let i=0;
  const chamferParts = [];
  for (const edge of edges) {
    const segment = edge.map(v => vertexPosition(mesh,v)) as Segment;
    let vol = Manifold.hull(segment.map(p => c.translate(p)));
    if (piecewise) {
      console.log(`start segment ${++i} of ${edges.length}`)

      vol = vol.intersect(geom);
      console.log(`start minkowskiSum()`);
      vol = vol.minkowskiSum(s);
      vol.getMesh();
      console.log(`end minkowskiSum()`);

      console.log(`start minkowskiDifference()`);
      vol = vol.minkowskiDifference(s);
      vol.getMesh();
      console.log(`end minkowskiDifference()`);

      console.log(`end segment ${i} of ${edges.length}`)
    }
    chamferParts.push(vol);
  }

  let chamfer:Manifold|null = null;
  if (!piecewise) {
    console.log(`start intersect()`);
    chamfer = Manifold.hull(chamferParts).intersect(geom);
    chamfer.getMesh();
    console.log(`end intersect()`);

    console.log(`start minkowskiSum()`);
    chamfer = chamfer.minkowskiSum(s);
    chamfer.getMesh();
    console.log(`end minkowskiSum()`);

    console.log(`start minkowskiDifference()`);
    chamfer = chamfer.minkowskiDifference(s)
    chamfer = chamfer.simplify(0.01);
    chamfer.getMesh();
    console.log(`end minkowskiDifference()`);

  } else {
    chamfer = union(chamferParts);
  }
  console.log(`...Done!`)

  // Show wireframe + normals.
  if (false) results.push(wireframe(mesh));

  chamfer = setMaterial(chamfer, filletMaterial)

  results.push(geom.add(chamfer).calculateNormals(0,minSharpAngle));

  // OS X preview is a little more responsive at this scale.
  return results.map(geom => geom.scale(1000));
}

export default example;