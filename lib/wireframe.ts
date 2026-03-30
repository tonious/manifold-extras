import {Mesh, Manifold, setMaterial} from 'manifold-3d/manifoldCAD';
import type {Vec3, GLTFMaterial} from 'manifold-3d/manifoldCAD';
import { batchUnion } from './batch.ts';
import type {HalfEdge} from './meshutil.ts';
import { uniqueHalfedges, faceEdges, halfedgesOf, vertexNormalsOf } from './meshutil.ts';

/**
 * A segment connects two 3d points, each defined as a Vec3.
 */
export type Segment = [Vec3, Vec3];


/**
 * Convert half-edges belonging to a mesh to segments in free space.
 */
export function* halfedgesToSegments(mesh:Mesh, halfedges:Iterable<HalfEdge>):Iterable<Segment> {
  for (const halfedge of halfedges) {
    yield halfedge.map(v => [...mesh.position(v)]) as Segment;
  }
}

/**
 * Convert segments to manifold geometry.
 */
export function* segmentsToManifolds(segments: Iterable<Segment>, radius:number = 0.1) {
  const {sphere, hull} = Manifold;
  const s = sphere(radius);
  for (const segment of segments) {
    yield hull(segment.map(p => s.translate(p)));
  }
}

export interface MeshPreviewArguments {
  radius:number;
  batchSize: number;
  verbose: boolean;
  triangles: Iterable<number>,
}

function wireframeBuilder(
  mesh:Mesh,
  halfedges: Iterable<HalfEdge>,
  args:Partial<MeshPreviewArguments> = {}
): Manifold {
  const opts = {
    radius: 0.1,
    verbose: true,
    batchSize: 500,
    ...args,
  };

  const segments = halfedgesToSegments(mesh, uniqueHalfedges(mesh, halfedges));
  const progress = (num:number) => console.log(`${num}/${mesh.numTri * 3/2} edges processed`);
  return batchUnion(
    segmentsToManifolds(segments, opts.radius),
    {
      batchSize: opts.batchSize,
      callback: opts.verbose ? progress : null
    }
  );
}

/**
 * Generate a wireframe model of a mesh, showing each triangle.
 */
export function meshTriangleWireframe (
    mesh:Mesh,
    args:Partial<MeshPreviewArguments> = {}
): Manifold {
  const halfedges = halfedgesOf(mesh, args.triangles);
  return wireframeBuilder(mesh, halfedges, args);
}

/**
 * Generate a wireframe model of a mesh, showing each face.
 */
export function meshWireframe (
    mesh:Mesh,
    args:Partial<MeshPreviewArguments> = {}
): Manifold {
  const halfedges = faceEdges(mesh, args.triangles);
  return wireframeBuilder(mesh, halfedges, args);
}

export function meshNormals (
    mesh:Mesh,
    args:Partial<MeshPreviewArguments> = {}
): Manifold {
  const segments = vertexNormalsOf(mesh, args.triangles);

  const opts = {
    radius: 0.1,
    verbose: true,
    batchSize: 500,
    ...args,
  };

  const progress = (num:number) => console.log(`${num}/${mesh.numVert} normals processed`);
  return batchUnion(
    segmentsToManifolds(segments, opts.radius),
    {
      batchSize: opts.batchSize,
      callback: opts.verbose ? progress : null
    }
  );
}

const baseMaterial:GLTFMaterial = {
  baseColorFactor: [1,1,0],
  alpha: 0.8
};
const shapeMaterial:GLTFMaterial = {
  baseColorFactor: [0,1,1],
  attributes: ['NORMAL'],
  alpha: 0.8
};
const faceEdgeMaterial:GLTFMaterial = {
  baseColorFactor: [0,0,0],
  unlit: true
};
const triangleEdgeMaterial:GLTFMaterial = {
  baseColorFactor: [0.15,0.15,0.15],
  unlit: true
};
const normalMaterial:GLTFMaterial = {
  baseColorFactor: [1,0,0],
  unlit: true
};

export function wireframe(object:Manifold|Mesh):Manifold {
  const mesh = object instanceof Manifold ? object.getMesh() : object;
  if (!(mesh instanceof Mesh)) {
    throw new Error("That's not a mesh!");
  }
  const parts = [
    setMaterial(
      meshWireframe(mesh, {radius:0.15}),
      faceEdgeMaterial
    ),
    setMaterial(
      meshTriangleWireframe(mesh),
      triangleEdgeMaterial,
    ),
    setMaterial(
      meshNormals(mesh),
      normalMaterial,
    )
  ];
  return Manifold.union(parts);
}

export const example = () => {
  const {cylinder, cube} = Manifold;

  const base = setMaterial(
    cube([100,100,10], true).translate([0,0,5]),
    baseMaterial
  );
  const shape = setMaterial(
    cylinder(50,35/2, 35/2).translate([0,0,-15]).rotate([0,30,0]).calculateNormals(0,30),
    shapeMaterial
  );

  const obj = base.add(shape);

  return [
    obj,
    wireframe(obj)
  ];
};

export default () => {
  const cube = Manifold.cube(10);
  const cut = cube.rotate(45).translate([0, 0, 5]).asOriginal();
  const cutID = cut.originalID();
  const chamfer = cube.subtract(cut).calculateNormals(0, 30);
  const mesh = chamfer.getMesh(0);

  const run = mesh.runOriginalID.findIndex((v) => v == cutID);
  for (var i = mesh.runIndex[run]; i < mesh.runIndex[run + 1]; ++i) {
    const v = mesh.triVerts[i];
    // adjust normals to match desired faces
    if (mesh.vertProperties[mesh.numProp * v + 2] > 8) {// upper
      mesh.vertProperties[mesh.numProp * v + 3] = 0;
      mesh.vertProperties[mesh.numProp * v + 4] = 0;
      mesh.vertProperties[mesh.numProp * v + 5] = 1;
    } else {// lower
      mesh.vertProperties[mesh.numProp * v + 3] = 0;
      mesh.vertProperties[mesh.numProp * v + 4] = -1;
      mesh.vertProperties[mesh.numProp * v + 5] = 0;
    }
  }

  const fillet = Manifold.ofMesh(mesh).smoothByNormals(0).refineToTolerance(0.1);

  return [
    fillet,
    wireframe(fillet)
  ]
}

