import type {Plane} from '../../lib/math.ts';
import {normalize, pointInPlane} from '../../lib/math.ts';
import {planePlane} from '../../lib/intersection.ts'
import sketchpad from '../../lib/sketchpad.ts';

export const planePlaneExample = () => {
  const planeA:Plane = [[1,0.5,0],[0,-1,-5]]
  const planeB:Plane = [normalize([1,2,1]),[5,1,0]]

  const sk = sketchpad();
  const {materials, plane, ray} = sk;

  plane(planeA, materials.primary);
  plane(planeB, materials.secondary);
  const [n,p] = planePlane(planeA, planeB)!;
  ray([n,p], materials.intersection);

  console.log(`Point is ${pointInPlane(p,planeA[0],planeA[1]) ? 'on' : 'not on'} plane A.`);
  console.log(`Point is ${pointInPlane(p,planeB[0],planeB[1]) ? 'on' : 'not on'} plane B.`);

  return sk.get();
}

export default planePlaneExample;
