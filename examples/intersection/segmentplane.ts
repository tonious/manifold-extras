import type {Plane, Segment} from '../../lib/math.ts';
import {normalize} from '../../lib/math.ts';
import {segmentPlane} from '../../lib/intersection.ts'
import sketchpad from '../../lib/sketchpad.ts';

export const segmentPlaneExample = () => {
  const planeA:Plane = [normalize([0.5,0.5,1]),[0,0,0]]
  const seg:Segment = [[0,5,-10],[5,0,10]]

  const sk = sketchpad();
  const {sphere, plane, segment} = sk;
  plane(planeA);
  segment(seg);
  const pt = segmentPlane(seg, planeA);
  if (pt) sphere(pt,1.5)

  return sk.get();
}

export default segmentPlaneExample;
