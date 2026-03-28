import {Mesh} from 'manifold-3d/manifoldCAD';


/**
 * A halfedge connects two numbered vertices, presumably belonging to the same Mesh.
 */
export type HalfEdge = [number, number];

const meshFaceCache: Map<Mesh, Map<string, Array<[number, number]>>> = new Map();
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

function halfedgeKey (mesh:Mesh, halfedge:HalfEdge): string {
  const merged = halfedge.map((v:number) => mergedVertex(mesh, v));
  return `[${Math.min(...merged)},${Math.max(...merged)}]`;
}

export function isFaceEdge(mesh:Mesh, halfedge:HalfEdge) {
  // Map halfedges to faces they border.
  let faces:Map<string, Array<[originalID:number, faceID:number]>> | null = null;
  if (meshFaceCache.has(mesh)) {
    faces = meshFaceCache.get(mesh) ?? null;
  } else {
    faces = new Map();
    for (let t=0; t<mesh.numTri; t++) {
      const originalID = triangleOriginalID(mesh, t);
      const faceID = mesh.faceID[t];
      for (const halfedge of halfedgesOf(mesh, [t])) {
        const key = halfedgeKey(mesh, halfedge);
        if (!faces.get(key)?.find(([id, face]) => id === originalID && face === faceID)) {
          if (!faces.has(key)) faces.set(key, []);
          faces.get(key)!.push([originalID, faceID]);
        }
      }
    }
    meshFaceCache.set(mesh, faces);
  }

  return (faces?.get(halfedgeKey(mesh, halfedge))?.length ?? 0) > 1;
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
 * Yield halfedges on face boundaries.
 * 
 * Results are unordered, will have duplicates, may have cycles, and
 * may have unconnected subsets.
 */
export function* faceEdges(mesh:Mesh, triangles?:Iterable<number>): Iterable<HalfEdge> {
  // Pass halfedges that border two faces.
  for (const halfedge of halfedgesOf(mesh, triangles)) {
    if (isFaceEdge(mesh, halfedge)) yield(halfedge);
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