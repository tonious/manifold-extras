import {Manifold, Vec3, GLTFMaterial, setMaterial} from 'manifold-3d/manifoldCAD';
import type {Plane, Ray, Segment, Triangle} from './math.ts';
import {
  add, cross, length, sub, scale, normalize,
  rotateAlign, translate,
} from './math.ts';


const materials:Record<string, GLTFMaterial> = {
  primary: {
    baseColorFactor: [1,1,0],
    alpha: 0.5, doubleSided: true
  },
  secondary: {
    baseColorFactor: [1,0,1],
    alpha: 0.5, doubleSided: true
  },
  ray: {
    baseColorFactor: [0,0,0],
    unlit: true
  },
  intersection: {
    baseColorFactor: [1,0,0],
    unlit: true
  }
}

export const sketchpad = () => {
  let results:Array<Manifold> = [];

  /**
   * Render a cylinder.
   */
  const cylinder = (axis:Segment, radius:number, material=materials.ray, cap:'flat'|'round' = 'flat') => {
    const naxis = normalize(sub(axis[1],axis[0]));
    const l = length(sub(axis[1],axis[0]));
    let geom = Manifold.cylinder(l, radius);
    if (cap === 'round') {
      const s = Manifold.sphere(radius);
      geom = geom.add(s);
      geom = geom.add(s.translate([0,0,l]))
    }

    const mRot = rotateAlign([0,0,1],naxis);
    const mTrans = translate(axis[0]);
    geom = geom.transform(cross(mTrans, mRot));
    results.push(setMaterial(geom, material));
  }

  const plane = (plane:Plane, material=materials.primary) => {
    const [n,p] = plane;
    let geom = Manifold.cube([50,50,0.1],true);
    const mRot = rotateAlign([0,0,1],n);
    const mTrans = translate(p);
    geom = geom.transform(cross(mTrans, mRot));

    results.push(setMaterial(geom, material));
  }

  const segment = (segment:Segment, material=materials.ray) => {
    const [a,b] = segment
    const radius = 0.5;
    let geom = Manifold.hull([
        Manifold.sphere(radius).translate(a),
        Manifold.sphere(radius).translate(b),
    ]);
    geom = geom.add(Manifold.sphere(radius*3).translate(a));
    geom = geom.add(Manifold.sphere(radius*3).translate(b));

    results.push(setMaterial(geom, material));
  }

  const ray = (ray:Ray, material=materials.ray) => {
    const [n,p] = ray;
    const radius = 0.5;

    const mRot = rotateAlign([0,0,1],normalize(n));
    const mTrans = translate(p);
    let geom = Manifold.sphere(radius*3);
    geom = geom.add(Manifold.cylinder(10*radius,radius));
    geom = geom.add(Manifold.cylinder(radius*6,radius*3,0).translate(0,0,10*radius));

    geom = geom.transform(cross(mTrans, mRot));
    results.push(setMaterial(geom, material));
  }

  const sphere = (p:Vec3, radius:number=0.5, material = materials.intersection) => {
    results.push(setMaterial(Manifold.sphere(radius).translate(p), material))
  }

  const triangle = (tri:Triangle, material=materials.primary) => {
    const n = normalize(tri);
    const geom = Manifold.hull([
      ...tri,
      ...tri.map(p => add(p, scale(n,0.01)))
    ])
    results.push(setMaterial(geom,material));
  }

  const clear = () => results = [];

  const get = () => {
    return results;
  }

  return {
    materials, 
    cylinder, sphere, triangle, plane,
    ray, segment,
    clear, get
  }
}

export default sketchpad;