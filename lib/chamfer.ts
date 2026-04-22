import {setMaterial, Mesh, Manifold, CrossSection, getCircularSegments} from 'manifold-3d/manifoldCAD';
import type {GLTFMaterial, Vec3} from 'manifold-3d/manifoldCAD';

import {wireframe} from './wireframe.ts';
import type {HalfEdge} from './meshutil.ts';
import {
  edgeKey, runEdges, halfedgesOf,  halfedgeOpposite,
  halfEdgeSegment, vertexPosition, vertexNormal,
  faceTriangles, triangleVertices, isFlat,
  intersectingTriangles,
  halfEdgeEquals,
  halfedgeKey,
  uniqueHalfedges
} from './meshutil.ts';
import {
  sub, scale, add, equals, cross, length,  normalize,
  constrainToSegment, pointInTriangle,
  closestPointOnSegmentToSegment,
  rotateAlign,
  translate,
  dot,
  planeOf,
  angle,
  lerp,
  projectToPlane
} from './math.ts';
import type {Plane, Segment, Triangle} from './math.ts';
import {planePlane, segmentCylinder} from './intersection.ts';

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
    const x = scale(c, (factor-1)/factor);
    const l = scale(n,linear);
    return obj.translate(add(x,l))
  })
}

// We're radius away from _this_ segment, but there exists another closer 
// segment leaving this point inside radius.
const pointIsTooClose = (mesh:Mesh, path:Array<HalfEdge>, pt:Vec3, d:number) => {
  const closerSegment = path
    .map(edge => halfEdgeSegment(mesh, edge))
    .map(seg => length(sub(pt, constrainToSegment(seg, pt))))
    .find(l => l < d);
  return (closerSegment ?? -1) >= 0;
}


function* offset(mesh: Mesh, edge:HalfEdge, triangles:Iterable<number>, path:Array<HalfEdge>, radius:number, planes:Array<Plane>) {
  const seenEdge = new Set();
  const segment = halfEdgeSegment(mesh, edge);
  const ns = normalize(segment);
  for (const t of triangles) {
    if (isFlat(mesh, t)) {
      // For flat surfaces, start with the path.
      // Project vertices out (as disks) and see what
      // they intersect.
      const tri = triangleVertices(mesh,t).map(v => vertexPosition(mesh, v)) as Triangle;
      const triplane = planeOf(tri)
      const [nt] = triplane;

      for (const plane of planes) {
          const [np, p] = plane;
          let ln:Vec3|null = cross(nt,ns);
          if (!equals(nt,np, 1e-2) && !equals(nt, scale(np,-1),1e-2)) {
            // Planes are not parallel.
            const li = planePlane(plane, triplane);
            if (!li) continue;
            
            ln = li[0]
            if (isNaN(ln[0])) {
              // Likely a degenerate triangle.
              continue;
              console.log({edge, t, tri, triplane, np, p, ln})
              //console.log(normalize(tri))
            }
          }

          const pt = add(p, scale(ln, radius))
          if (!pointInTriangle(pt, tri)) continue;
          let outside = false;
          for (const plane2 of planes) {
            if (plane2 === plane) continue;
            const [np, p] = plane2;
            if (dot(np,sub(pt,p))<0) {
              outside = true;
              break;
            }
          }
          if (outside) continue;
          //if (pointIsTooClose(mesh,path,pt,radius - 1e-3)) continue;

          yield([nt,pt]);
      }

    } else {
      // For curved surfaces, start with the mesh.
      // Choosing intersection points that are already on mesh
      // edges hopefully plays nice with smoothing.
      for (const tedge of halfedgesOf(mesh, t)) { // n=3.
        const key = edgeKey(mesh, tedge);
        if (seenEdge.has(key)) continue;
        seenEdge.add(key)

        // May have more than one solution.
        const tsegment = halfEdgeSegment(mesh, tedge);
        for (const pt of segmentCylinder(tsegment, segment, radius)) {
          if (pointIsTooClose(mesh,path,pt,radius - 1e-3)) continue;
          const [a,b] = tsegment;
          const ba = sub(b,a);
          const t = dot(sub(pt,a),ba) / dot(ba,ba);
          const nt = lerp(vertexNormal(mesh,tedge[0]), vertexNormal(mesh,tedge[1]), t);

          // Interpolate normal.
          yield([nt,pt]);
        }
      }
    }
  }
}

const halfedgePlanes = (mesh:Mesh, edge:HalfEdge, prevEdges:Array<HalfEdge>, nextEdges:Array<HalfEdge>, radius:number) => {
  const segment = halfEdgeSegment(mesh, edge);
  const planes:Array<Plane> = [];
  const ns = normalize(segment); // Normal segment.
  for (const other of prevEdges) {
    const no = normalize(halfEdgeSegment(mesh,other)); // Normal other.
    if (angle(ns,no) >= 360/getCircularSegments(radius)) {
      planes.push([ns,add(segment[0],scale(ns,-radius))]);
      planes.push([normalize(add(ns,no)),segment[0]]);

      //planes.push([scale(ns,1),segment[0]]);
      //planes.push([no,segment[0]]);
    } else {
      planes.push([normalize(add(ns,no)),segment[0]]);
    }
  }
  for (const other of nextEdges) {
    const no = normalize(halfEdgeSegment(mesh,other));
    if (angle(ns,no) >= 360/getCircularSegments(radius)) {
      planes.push([scale(normalize(add(ns,no)),-1),segment[1]]);
      planes.push([scale(ns,-1),add(segment[1],scale(ns,radius))]);

      //planes.push([scale(ns,1),segment[1]]);
      //planes.push([scale(no,-1),segment[1]]);
      //planes.push([scale(ns,1),segment[1]]);
    } else {
      planes.push([scale(normalize(add(ns,no)),-1),segment[1]]);
    }
  }

  return planes;
}

const halfedgeVolume = (mesh:Mesh, edge:HalfEdge, planes:Array<Plane>, radius:number=1) => {
  const segment = halfEdgeSegment(mesh, edge);
  let matR = rotateAlign([0,0,1],normalize(segment));
  let matT = translate(segment[0])
  let vol = Manifold
    .cylinder(length(segment)+2*radius,radius)
    .translate([0,0,-radius])
    .transform(cross(matT,matR));

  for (const [n,p] of planes) {   
    vol = vol.trimByPlane(n,dot(n,p));
  }
  return vol;
}

const pointInsidePlanes = (pt:Vec3, planes:Iterable<Plane>) => {
  for (const [np, p] of planes) {
    if (dot(np,sub(pt,p)) < 0) {
      return false;
    }
  }
  return true;
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
    //attributes: ['NORMAL']
  }
  const filletMaterial:GLTFMaterial = {
    baseColorFactor: [1,0,1],
    //alpha: 0.8,  doubleSided: true,
    //attributes: ['NORMAL']
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
  const s = Manifold.sphere(0.5,8);
  const co = Manifold.cylinder(1,1,0,8);
  const cy = Manifold.cylinder(0.01,chamferR,chamferR,16);
  let pointcounter = 0;
  let vectorcounter = 0;

  const st = (p:Vec3,c:Vec3=[0,0,0], push=true) => {
    const vol = setMaterial(s.translate(p),{baseColorFactor:c, unlit: true});
    ++pointcounter;
    if (push) showpts.push(vol);
    return vol;
   };

  const sv = (seg:Segment,c:Vec3=[0,0,0], push=true) => {
    vectorcounter++
    const l = length(seg);
    if (l === 0) {
      console.log(`Zero length vector: ${seg}`)
    }
    let vol = co.translate([0,0,l-1]);
    if (l>1) {
      vol = vol.add(Manifold.cylinder(l-1,0.25));
    }

    const n = normalize(seg);
    let matR = rotateAlign([0,0,1],n);
    let matT = translate(seg[0])
    vol = vol.transform(cross(matT,matR));

    vol = setMaterial(vol,{baseColorFactor:c, unlit: true});
    if (push) showpts.push(vol)
    return vol
  };

  const sp = (p:Vec3, n:Vec3, c:Vec3=[1,0,1]) => {
    let vol = cy;
    let matR = rotateAlign([0,0,1],n);
    let matT = translate(p)
    vol = vol.transform(cross(matT,matR));

    showpts.push(setMaterial(vol,{baseColorFactor:c, alpha: 0.5}))   
  }

  const vf = (n:Vec3, p:Vec3) => {
    let vol = cy;
    let matR = rotateAlign([0,0,1],n);
    let matT = translate(p)
    vol = vol.transform(cross(matT,matR));
    return vol;
  }

  const results = []
  for (const shape of shapes) {
    const geom = base.add(shape);

    console.log(`Getting mesh...`)
    const mesh = geom.getMesh();
    console.log(`...done.`);

    console.log(`Building edges...`);
    // Slow.
    const meshTriangles = new Set(faceTriangles(mesh, base.originalID()));
    const edges = [...runEdges(mesh, meshTriangles)];

    console.log(`... and finding nearby triangles ...`);
    // Very slow.
    // Also varies depending on which edge we're following.
    const nearTriangles = new Set(intersectingTriangles(mesh, edges, chamferR));

    console.log(`... and grouping them...`);
    // Fast.
    const insideTriangles = nearTriangles.intersection(meshTriangles);
    const outsideTriangles = nearTriangles.difference(meshTriangles);
    console.log(`...done.`);

    console.log(`Generating offset paths...`);

    const chamferParts = [];

    const planeMap:Map<string, Array<Plane>> = new Map();
    let ptsA:Array<any> = [];
    let ptsB:Array<any> = [];
    const details:Map<string,any> = new Map();

    for (const edge of edges) {
      const segment = halfEdgeSegment(mesh, edge);

      // This could be faster.
      const nearby = edges
        .map(e => [e, halfEdgeSegment(mesh,e)])
        .map(([e,s]) => [e, closestPointOnSegmentToSegment(segment, s as Segment)])
        .map(([e,s]) => [e,length(s as Segment)])
        .filter(([,l]) => (l as number) < 2*chamferR)
        .map(([e,]) => e) as Array<HalfEdge>;

      const opposite = halfedgeOpposite(mesh, edge);
      const across = nearby.map(e => halfedgeOpposite(mesh, e));

      const nextEdges = nearby.filter(e => e[0] === edge[1]);
      const prevEdges = nearby.filter(e => e[1] === edge[0]);

      if ((nextEdges.length + prevEdges.length) > 2) {
        console.log(`${edge} has more than two neighbours.`);
      }
      if ((nextEdges.length + prevEdges.length) < 2) {
        console.log(`${edge} has less than two neighbours.`);
      }

      const planes = halfedgePlanes(mesh, edge, prevEdges,nextEdges, chamferR);   
      planeMap.set(halfedgeKey(edge), planes);

      for (const [n, p] of offset(mesh, edge, insideTriangles, nearby, chamferR, planes)) {
        if (ptsA.find(([n2,p2]) => equals(n,n2, 1e-2) && equals(p,p2, 1e-2))) continue;
        ptsA.push([n,p]);
      }

      for (const [n, p] of offset(mesh, opposite, outsideTriangles, across, chamferR, planes)) {
        if (ptsB.find(([n2,p2]) => equals(n,n2, 1e-2) && equals(p,p2, 1e-2))) continue;
        ptsB.push([n,p]);
      }

      details.set(halfedgeKey(edge), {
        nextEdges, prevEdges
      })
    }
    console.log(`...Done!`)

    console.log(`Ordering paths...`);

    const ptsForEdge = (mesh:Mesh, edge:HalfEdge, pts:Array<[Vec3,Vec3]>) => {
      const segment = halfEdgeSegment(mesh, edge);
      const planes = planeMap.get(halfedgeKey(edge))!;
      const [b,a] = segment;
      const ba = sub(b,a);
      const near = pts
        //.filter(([,pt]) => pointInsidePlanes(pt,planes))
        .filter(([,pt]) => length([pt, constrainToSegment(segment, pt)]) <= chamferR + 1e-2)
      return near
        .map(([,p]:[Vec3,Vec3], i:number) => {
          const pa = sub(p,a);
          const t = (dot(pa,ba) / dot(ba,ba));
          return [i,t];
        })
        .toSorted(([,t1],[,t2])=>t2-t1)
        .map(([i]) => near[i]);
    }

    function* toVector(vecs:Array<[Vec3,Vec3]>, c:Vec3) {
      // Huh.  I could probably avoid this by inferring
      // segments when offsetting.
      for (let i=0; i<vecs.length-1; i++) {
        const [n1,p1] = vecs[i]
        const [n2,p2] = vecs[i+1]
        if (equals(p1,p2) && equals(p1,p2)) continue;
        if (equals(p1,p2)) {
          const a = angle(n1,n2);
          console.log(`${a} degree variation`)
          yield(st(p1,[0,0,0],false))
          continue;
        }
        yield sv([p1,p2],c,false);
      }
    }

    for (const edge of edges) {
      const detail = details.get(halfedgeKey(edge))
      detail.left = ptsForEdge(mesh, edge, ptsA);
      detail.right = ptsForEdge(mesh, edge, ptsB);
    }
    console.log(`...done?`)

    for (const edge of edges) {
      const key = halfedgeKey(edge)
      const {
        left, right, nextEdges, prevEdges
      } = details.get(key);

      if (nextEdges.length > 1 || prevEdges.length > 1) {
        console.log(`Skipping ${key}`)
        continue;
      }
      const prev = details.get(halfedgeKey(prevEdges[0]));
      const next = details.get(halfedgeKey(nextEdges[0]));

      if (!right.length || (prev.right.length>0 && !equals(right.at(0), prev.right.at(-1)))) {

        right.unshift(prev.right.at(-1));
      }

      if (true) {
        const planes = planeMap.get(halfedgeKey(edge))!;
        if (false) for (const [n,p] of planes) sp(p,n);

        let vol = setMaterial(
          halfedgeVolume(mesh, edge, planes, chamferR),
          filletMaterial
        );
        vol = Manifold.union([
          //vol,
          ...left.map(([,pt]) => st(pt, [1,0,0], false)),
          ...right.map(([,pt]) => st(pt, [0,1,0], false)),
          ...toVector(left,[1,0,0]),
          ...toVector(right,[0,1,0]),
          sv(halfEdgeSegment(mesh, edge), [0,0,1], false)
        ]);
        chamferParts.push(vol);
      }
    }


    if (false) {
      for (const edge of edges) {
        const segment = halfEdgeSegment(mesh, edge);
        sv(segment, [0,0,1]);
      }
    }

    // Show wireframe + normals.
    if (false) results.push(wireframe(mesh, {triangles: nearTriangles}));

    
    results.push(geom);
    if (true) {
      if (false) {
        results.push(...explode(chamferParts,1.1));
      } else {
        results.push(...chamferParts)
      }
    }
    //results.push(chamfer);
    //results.push(chamfer.add(geom))

    console.log(`${pointcounter} points charted.`)
    console.log(`${vectorcounter} vectors charted.`)

  }

  results.push(...showpts);

  // OS X preview is a little more responsive at this scale.
  return true ? results.map(geom => geom.scale(1000)) : results;
}

export default example;