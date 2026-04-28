import {Mesh} from 'manifold-3d/manifoldCAD';
import type {Vec3} from 'manifold-3d/manifoldCAD';
import tarjan from "@rtsao/scc";

import {length, add, equals} from './math.ts';
import type {Segment} from './math.ts';
import {segmentCylinder} from './intersection.ts';
import {halfedgesToSegments} from './wireframe.ts';

/**
 * A halfedge connects two numbered vertices, presumably belonging to the same Mesh.
 */
export type HalfEdge = [number, number];

const meshEdgeFaceCache: Map<Mesh, Map<string, [number, number]>> = new Map();
const meshEdgeOppositeCache: Map<Mesh, Map<string, Array<HalfEdge>>> = new Map();
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

function getVertMerge(mesh:Mesh):Map<number, number>  {
  if (meshVertMergeCache.has(mesh)) {
    return meshVertMergeCache.get(mesh)!;
  }

  const vertMerge = new Map();
  for (let i = 0; i < mesh.mergeFromVert.length; i++) {
    vertMerge.set(mesh.mergeFromVert[i], mesh.mergeToVert[i]);
  }
  meshVertMergeCache.set(mesh, vertMerge);
  return vertMerge;
}

export function mergedVertex(mesh:Mesh, vertex:number) {
  const vertMerge = getVertMerge(mesh);
  return vertMerge.has(vertex) ? vertMerge.get(vertex)! : vertex;
}

export function mergedVertices(mesh:Mesh, vertex:number) {
  const vertMerge = getVertMerge(mesh);
  if (vertMerge.has(vertex)) return [vertMerge!.get(vertex)!];

  const vertices = vertMerge.entries()
    .filter(([, mergeTo]) => mergeTo === vertex)
    .map(([mergeFrom,]) => mergeFrom);

  return [...vertices];
}

export function halfEdgeSegment(mesh:Mesh, halfedge:HalfEdge): Segment {
  return halfedge.map(v => vertexPosition(mesh, v)) as Segment;
}

/**
 * A key that matches only one side of a halfedge.
 * 
 * A mesh reference is not necessary as we do not merge vertices.
 */
export function halfedgeKey (halfedge:HalfEdge): string {
  return JSON.stringify(halfedge);
}

export function edgeEquals(mesh:Mesh, e1:HalfEdge, e2:HalfEdge): boolean {
  return edgeKey(mesh, e1) === edgeKey(mesh, e2);
}

export function halfEdgeEquals(e1:HalfEdge, e2:HalfEdge): boolean {
  return halfedgeKey(e1) === halfedgeKey(e2);
}

/**
 * A key that matches either side of a halfedge belonging to Mesh.
 */
export function edgeKey (mesh:Mesh, halfedge:HalfEdge): string {
  const merged = halfedge.map((v:number) => mergedVertex(mesh, v));
  return `[${Math.min(...merged)},${Math.max(...merged)}]`;
}


// FIXME accidentally quadratic.
export function halfedgeOpposite(mesh:Mesh, edge:HalfEdge): HalfEdge {
  if (!meshEdgeOppositeCache.has(mesh)) meshEdgeFaceMap(mesh);
  const cache = meshEdgeOppositeCache.get(mesh)!;
  const key = edgeKey(mesh, edge);  
  const opposites = cache.get(key)!.filter(other => !halfEdgeEquals(edge, other));

  if (opposites.length !== 1) {
    throw new Error(`HalfEdge ${key} has ${opposites.length} opposite edges.`);
  }
  return opposites[0];
}

/**
 * Yield only one half-edge per edge.  This excludes the other half-edge taking merged
 * vertices into account.
 */
export function* uniqueHalfedges(mesh:Mesh, halfedges:Iterable<HalfEdge>): Iterable<HalfEdge> {
  const seen:Set<string> = new Set();
  for (const halfedge of halfedges) {
    const key = edgeKey(mesh, halfedge)
    if (seen.has(key)) continue;

    seen.add(key);
    yield(halfedge);
  }
}

/**
 * Map edges to faces they border.
 */
function meshEdgeFaceMap(mesh:Mesh):Map<string, [originalID:number, faceID:number]> {
  if (!meshEdgeFaceCache.has(mesh)) {
    const faces:Map<string, [originalID:number, faceID:number]> = new Map();
    const opposites:Map<string, Array<HalfEdge>> = new Map();

    let runID = 0;
    let nextrun = mesh.runIndex[runID+1]/3;
    for (let t=0; t<mesh.numTri; t++) {
      if (t>=nextrun && t>0) {
        runID++;
        nextrun = mesh.runIndex[runID+1]/3;
      }

      const originalID = mesh.runOriginalID[runID];
      const faceID = mesh.faceID[t];
      for (const halfedge of halfedgesOf(mesh, t)) {
        const key = halfedgeKey(halfedge)
        faces.set(key, [originalID, faceID]);

        const ekey = edgeKey(mesh,halfedge);
        if (!opposites.has(ekey)) opposites.set(ekey, []);
        opposites.get(ekey)!.push(halfedge);
      }
    }

    meshEdgeFaceCache.set(mesh, faces);
    meshEdgeOppositeCache.set(mesh, opposites)
  }
  return meshEdgeFaceCache.get(mesh)!;
}

export function originalIDof(mesh:Mesh, halfedge:HalfEdge) {
  const faces = meshEdgeFaceMap(mesh);
  const [originalID] = faces.get(halfedgeKey(halfedge)) ?? [];
  return originalID;
}

export function faceIDof(mesh:Mesh, halfedge:HalfEdge) {
  const faces = meshEdgeFaceMap(mesh);
  const [,faceID] = faces.get(halfedgeKey(halfedge)) ?? [];
  return faceID;
}

/**
 * Yield all half-edges of a mesh, or of a set of numbered triangles within that mesh.
 */
export function* halfedgesOf(
  mesh:Mesh,
  triangles?:number|Iterable<number>
): Iterable<HalfEdge> {
  if (typeof triangles === 'number') {
    const t = triangles;
    const [v1, v2, v3] = [...mesh.triVerts.slice(t*3, (t+1)*3).values()];
    yield([v1, v2]);
    yield([v2, v3]);
    yield([v3, v1]);
  } else {
    for (const t of triangles ?? new Array(mesh.numTri).keys()) {
      yield* halfedgesOf(mesh, t);
    }
  }
}

/**
 * Yield halfedges on run boundaries.
 * 
 * Results are unordered, will have duplicates, will have cycles, and
 * may have unconnected subsets.
 */
export function* runEdges(mesh:Mesh, triangles?:Iterable<number>): Iterable<HalfEdge> {
  const isRunEdge = (thisEdge:HalfEdge) => {
    const thatEdge = halfedgeOpposite(mesh, thisEdge);
    if (originalIDof(mesh,thisEdge) !== originalIDof(mesh, thatEdge)) return true;
    return false;
  };

  // Pass halfedges that border two runs.
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
  const isFaceEdge = (thisEdge:HalfEdge) => {
    const thatEdge = halfedgeOpposite(mesh, thisEdge);
    return faceIDof(mesh,thisEdge) !== faceIDof(mesh, thatEdge) 
      || originalIDof(mesh,thisEdge) !== originalIDof(mesh, thatEdge);
  };
  
  // Pass halfedges that border two faces.
  for (const halfedge of halfedgesOf(mesh, triangles)) {
    if (isFaceEdge(halfedge)) yield(halfedge);
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
  function* byOriginalID(iter:Iterable<number>) {
    if (typeof originalID !== 'number') {
      yield* iter;
    } else {
      const runID = mesh.runOriginalID.indexOf(originalID);
      let thisrun = mesh.runIndex[runID]/3;
      let nextrun = mesh.runIndex[runID+1]/3;

      for (const t of iter) {
        if (t < thisrun || t >= nextrun) continue;
        if (triangleOriginalID(mesh,t) != originalID) throw new Error("Uh oh")
        yield t;
      }
    }
  }

  function* byFaceID(iter:Iterable<number>) {
    if (typeof faceID !== 'number') {
      yield* iter;
    } else {
      for (const t of iter) if (mesh.faceID[t] === faceID) yield t;
    }
  }
  
  yield* byFaceID(byOriginalID(triangles ?? new Array(mesh.numTri).keys()))
}

export function isFlat(mesh:Mesh, triangle:number, tolerance:number=1e-3) {
  if (mesh.numProp < 6) return true;
  const triVerts = triangleVertices(mesh, triangle);
  const [n1, n2, n3] = triVerts.map(v => vertexNormal(mesh, v));
  return (equals(n1, n2, tolerance) && equals(n1, n3, tolerance));
}

export function* curvedTriangles(mesh:Mesh, triangles?:Iterable<number>, tolerance:number=1e-3): Iterable<number> {
  if (mesh.numProp < 6) {
    throw new Error("No vertex normals found.");
  }

  for (const tri of (triangles ?? new Array(mesh.numTri).keys())) {
    if (!isFlat(mesh, tri, tolerance)) yield(tri);
  }
}

export function* flatTriangles(mesh:Mesh, triangles?:Iterable<number>,  tolerance:number=1e-3): Iterable<number> {
  for (const tri of (triangles ?? new Array(mesh.numTri).keys())) {
    if (isFlat(mesh, tri, tolerance)) yield(tri);
  }
}

export function* intersectingTriangles(mesh:Mesh, edges:Array<HalfEdge>, radius:number=1, triangles?:Iterable<number>) {  
  const segments:Array<Segment> = [...halfedgesToSegments(mesh, edges)];

  for (const tri of (triangles ?? new Array(mesh.numTri).keys())) {
    let found = false;
    for (const tedge of halfedgesOf(mesh,tri)) {
      const tsegment = tedge.map(v => vertexPosition(mesh,v)) as Segment;
      for (const segment of segments) {
        if (segmentCylinder(tsegment, segment, radius).length) {
          found = true;
          break;
        }
      }
      if(found) break;
    }
    if (found) yield tri;    
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
}


/**
 * Split an unordered set of halfedges into ordered chordless cycles.
 */
export function halfEdgeCycles(edges:Iterable<HalfEdge>) {
  const dfs = (nodes: Set<number>) => {
    const visited: Set<number> = new Set();
    const recurse = (recStack:Array<number>) => {
      const prevNode = recStack[recStack.length-1];
      const adjacent = digraph.get(prevNode)!
      for(const u of adjacent) {
        if (visited.has(u)) {
          // Trim back-edges.
          cycles.push([...recStack.slice(recStack.indexOf(u))]);
          for (const n of recStack.slice(0,recStack.indexOf(u))) {
            visited.delete(n);
          }
        } else {
          visited.add(u);
          recurse([...recStack, u]);
        }
      }
    }
    recurse([nodes.values().next().value!]);
  }

  const digraph:Map<number, Set<number>> = new Map();
  for (const [v1, v2] of edges) {
    if (!digraph.has(v1)) digraph.set(v1, new Set());
    if (!digraph.has(v2)) digraph.set(v2, new Set());
    digraph.get(v1)!.add(v2);
  }

  const cycles:Array<Array<number>> = [];
  const cycleEdges:Array<Array<HalfEdge>> = [];
  for (const subgraph of tarjan(digraph)) dfs(subgraph);
  for (const cycle of cycles) {
    const edges:Array<HalfEdge> = [];
    for (let i=0; i<cycle.length; i++) {
      edges.push([cycle[i], cycle[(i+1)%cycle.length]] as HalfEdge);
    }
    cycleEdges.push(edges);
  }
  return cycleEdges;
}