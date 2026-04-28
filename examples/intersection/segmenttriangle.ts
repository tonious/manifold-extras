import type {Segment, Triangle} from '../../lib/math.ts';
import {segmentTriangle} from '../../lib/intersection.ts'
import sketchpad from '../../lib/sketchpad.ts';

export const segmentTriangleExample = () => {
  const tri:Triangle = [
    [-50, 50, 0],
    [-50,-50, 0],
    [ 50,  0, 0]
  ];
  const segments:Array<Segment> = [
    [[0,5,-10],[5,0,10]],
    [[15,25,10], [15,25,-10]]
  ];

  const sk = sketchpad();
  const {sphere, triangle, segment} = sk;

  triangle(tri);
  for (const seg of segments) {
    segment(seg);
    const pt = segmentTriangle(seg, tri);
    if (pt) sphere(pt,1.5)
  }

  return sk.get();
}

export default segmentTriangleExample;
