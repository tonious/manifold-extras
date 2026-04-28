import type {Segment} from '../../lib/math.ts';
import {segmentCylinder} from '../../lib/intersection.ts'
import sketchpad from '../../lib/sketchpad.ts';

export const segmentCylinderExample = () => {
  const radius = 5;
  const axis:Segment = [[0,-5,0],[0,20,30]];
  const edges:Segment[] = [
    [[0,20,30],[0,-5,0]],
    [[30,0,0],[-30,0,15]],
    [[-10,-15,0],[0,-5,-1]],
    [[8,20,33],[-8,20,33]]
  ];

  const sk = sketchpad();
  const {materials, cylinder, sphere, segment} = sk;
  cylinder(axis,radius,materials.primary, 'round');

  for (const edge of edges) {
    segment(edge);
    const pts = segmentCylinder(edge, axis, radius);
    for (const pt of pts) {
      sphere(pt,1);
    }
  }

  return sk.get();
};

export default segmentCylinderExample;
