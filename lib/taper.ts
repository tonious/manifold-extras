import {Manifold, CrossSection} from 'manifold-3d/manifoldCAD';
import { clamp } from './math';

const {abs} = Math;

/**
 * Extrude every polygon within a CrossSection into a cylinder or cone.
 */
export function outline(cs:CrossSection, height:number, bottom:number, top:number=0, circularSegments?:number) {
  const {cylinder, hull, union} = Manifold;
  const vertex = (bottom > top)
     ? cylinder(height,bottom,top,circularSegments)
     : cylinder(height,top,bottom,circularSegments).mirror([0,0,1]).translate([0,0,height])

  const polygons = cs.toPolygons()
    .map(polygon => polygon
      .map(([x, y]) => vertex.translate([x,y,0]))
    )

  const pairs = []
  for (const polygon of polygons) {
    let i=0;
    do {
      pairs.push(hull([polygon[i], polygon[++i]]))
    } while ((i+1)<polygon.length)
    pairs.push(hull([polygon[i], polygon[0]]))
  }
  
  return union(pairs)
}

/**
 * Extrude a CrossSection, with offsets at the top and bottom of the volume.
 * This can be used to add a taper or draft.
 */
export function extrudeOffset (cs:CrossSection, height:number, bottom:number, top:number=0, circularSegments?:number) {
  const t = clamp((top === bottom) ? 0 : bottom/(bottom-top));
  const z = t * height;
  const rb = abs(bottom);
  const rz = abs(t*top+(1-t)*bottom);
  const rt = abs(top);

  let geom = cs.extrude(height);
  const bottomTaper = outline(cs,z,rb,rz,circularSegments)
  if (bottom > 0) {
    geom = geom.add(bottomTaper);
  } else if (bottom < 0) {
    geom = geom.subtract(bottomTaper)
  }

  const topTaper = outline(cs,(height-z),rz,rt,circularSegments).translate([0,0,z])
  if (top > 0) {
    geom = geom.add(topTaper)
  } else if (top < 0) {
    geom = geom.subtract(topTaper)
  }

  return geom;
}

const demo = () => {
    const {square, circle} = CrossSection;
    const shape = square(100,true).subtract(circle(35));
    return [
        outline(shape,10,3,0).translate([-60,0,0]),
        extrudeOffset(shape, 10,3,0).translate([60,0,0])
    ];
};
export default demo;