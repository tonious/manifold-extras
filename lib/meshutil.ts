import {Mesh} from 'manifold-3d/manifoldCAD';
import type {Vec3} from 'manifold-3d/manifoldCAD';
import * as math from './math.ts';

const {length, add, equals} = math.Vec3;
type Segment = math.Vec3.Segment;

/**
 * A halfedge connects two numbered vertices, presumably belonging to the same Mesh.
 */
export type HalfEdge = [number, number];

const meshEdgeFaceCache: Map<Mesh, Map<string, Array<[number, number]>>> = new Map();
const meshVertMergeCache: Map<Mesh, Map<number, number>> = new Map();

export function triangleRun(mesh:Mesh, t:number) {
  for (let i=0; i < mesh.numRun; i++) {
    if ((t*3) < mesh.runIndex[i+1]) return i;
  }
  throw new RangeError()
}

export function triangleOriginalID(mesh:Mesh, t:number) {
  return mesh.runOriginalID[triangleRun(mesh, t)];
}

export function triangleVertices(mesh:Mesh, t:number):[number, number, number] {
  return [...mesh.triVerts.slice(t*3, (t+1)*3)] as [number, number, number]
}

export function vertexNormal(mesh:Mesh, vertex:number, pos:number=3) {
  const offset = vertex * mesh.numProp + pos;
  return [...mesh.vertProperties.slice(offset, offset+3)] as Vec3
}

export function vertexPosition(mesh:Mesh, vertex:number) {
  const offset = vertex * mesh.numProp;
  return [...mesh.vertProperties.slice(offset, offset+3)] as Vec3
}

export function mergedVertex(mesh:Mesh, vertex:number) {
  let vertMerge:Map<number, number> | null = null;
  if (meshVertMergeCache.has(mesh)) {
    vertMerge = meshVertMergeCache.get(mesh) ?? null;
  } else {
    vertMerge = new Map();
    for (let i = 0; i < mesh.mergeFromVert.length; i++) {
      vertMerge.set(mesh.mergeFromVert[i], mesh.mergeToVert[i]);
    }
    meshVertMergeCache.set(mesh, vertMerge);
  }

  return vertMerge?.has(vertex) ? vertMerge.get(vertex)! : vertex;
}

export function halfedgeKey (mesh:Mesh, halfedge:HalfEdge): string {
  const merged = halfedge.map((v:number) => mergedVertex(mesh, v));
  return `[${Math.min(...merged)},${Math.max(...merged)}]`;
}

/**
 * Map halfedges to faces they border.
 */
function meshEdgeFaceMap(mesh:Mesh):Map<string, Array<[originalID:number, faceID:number]>> {
  if (!meshEdgeFaceCache.has(mesh)) {
    const faces:Map<string, Array<[originalID:number, faceID:number]>> = new Map();
    for (let t=0; t<mesh.numTri; t++) {
      const originalID = triangleOriginalID(mesh, t);
      const faceID = mesh.faceID[t];
      for (const halfedge of halfedgesOf(mesh, [t])) {
        const key = halfedgeKey(mesh, halfedge);
        if (!faces.get(key)?.find(([id, face]:[number, number]) => id === originalID && face === faceID)) {
          if (!faces.has(key)) faces.set(key, []);
          faces.get(key)!.push([originalID, faceID]);
        }
      }
    }
    meshEdgeFaceCache.set(mesh, faces);
  }
  return meshEdgeFaceCache.get(mesh)!;
}

/**
 * Yield all half-edges of a mesh, or of a set of numbered triangles within that mesh.
 */
export function* halfedgesOf(
  mesh:Mesh,
  triangles?:Iterable<number>
): Iterable<HalfEdge> {
  for (const tri of triangles ?? new Array(mesh.numTri).keys()) {
    const [v1, v2, v3] = [...mesh.triVerts.slice(tri*3, (tri+1)*3).values()];
    yield([v1, v2]);
    yield([v2, v3]);
    yield([v3, v1]);
  }
}

/**
 * Yield halfedges on run boundaries.
 * 
 * Results are unordered, will have duplicates, will have cycles, and
 * may have unconnected subsets.
 */
export function* runEdges(mesh:Mesh, triangles?:Iterable<number>): Iterable<HalfEdge> {
  const faces = meshEdgeFaceMap(mesh);
  const isRunEdge = (halfedge:HalfEdge) => 
      new Set((faces.get(halfedgeKey(mesh, halfedge)) ?? []).map(([id]) => id)).size > 1;

  // Pass halfedges that border two faces.
  for (const halfedge of halfedgesOf(mesh, triangles)) {
    if (isRunEdge(halfedge)) yield(halfedge);
  }
}

/**
 * Yield halfedges on face boundaries.
 * 
 * Results are unordered, will have duplicates, may have cycles, and
 * may have unconnected subsets.
 */
export function* faceEdges(mesh:Mesh, triangles?:Iterable<number>): Iterable<HalfEdge> {
  const faces = meshEdgeFaceMap(mesh);
  const isFaceEdge = (halfedge:HalfEdge) => (faces.get(halfedgeKey(mesh, halfedge)) ?? []).length > 1
  
  // Pass halfedges that border two faces.
  for (const halfedge of halfedgesOf(mesh, triangles)) {
    if (isFaceEdge(halfedge)) yield(halfedge);
  }
}

/**
 * Yield only unique half-edges.  This excludes the other half-edge taking merged
 * vertices into account.
 */
export function* uniqueHalfedges(mesh:Mesh, halfedges:Iterable<HalfEdge>): Iterable<HalfEdge> {
  const seen:Set<string> = new Set();
  for (const halfedge of halfedges) {
    const key = halfedgeKey(mesh, halfedge)
    if (seen.has(key)) continue;

    seen.add(key);
    yield(halfedge);
  }
}

/**
 * Yield triangles belonging to a face.
 */
export function* faceTriangles(
  mesh:Mesh,
  originalID:number|null = null,
  faceID:number|null = null,
  triangles?:Iterable<number>
): Iterable<number> {
  for (const t of triangles ?? new Array(mesh.numTri).keys()) {
    if (typeof originalID === 'number' && triangleOriginalID(mesh,t) !== originalID) continue;
    if (typeof faceID === 'number' && mesh.faceID[t] !== faceID) continue;
    yield t
  }
}

export function* curvedTriangles(mesh:Mesh, triangles?:Iterable<number>): Iterable<number> {
  if (mesh.numProp < 6) {
    throw new Error("No vertex normals found.");
  }

  for (const tri of (triangles ?? new Array(mesh.numTri).keys())) {
    const triVerts = triangleVertices(mesh, tri);
    const [n1, n2, n3] = triVerts.map(v => vertexNormal(mesh, v));
    if (!(equals(n1, n2, 1e-3) && equals(n1, n3, 1e-3))) {
      yield(tri);
    }
  }
}

export function* vertexNormalsOf(mesh:Mesh, triangles?:Iterable<number>):Iterable<Segment> {
  const seen = new Set();
  for (const tri of triangles ?? new Array(mesh.numTri).keys()) {
    const vertices = [...mesh.triVerts.slice(tri*3, (tri+1)*3).values()];
    for (const vertex of vertices) {
      if (seen.has(vertex)) continue;
      seen.add(vertex);
      const position = vertexPosition(mesh, vertex);
      const normal = vertexNormal(mesh, vertex);
      if (Math.abs(length(normal) - 1) > 0.1) continue;
      yield [position, add(position, normal)];
    }
  }
};
