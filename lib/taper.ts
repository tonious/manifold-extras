import {Manifold, CrossSection} from 'manifold-3d/manifoldCAD';
import {chainHull} from './chainhull.ts';
import {clamp} from './math.ts';

const {abs} = Math;

/**
 * Extrude every polygon within a CrossSection into a cylinder or cone.
 */
export function outline(cs:CrossSection, height:number, bottom:number, top:number=0, circularSegments?:number) {
  const {cylinder} = Manifold;
  const vertex = (bottom > top)
     ? cylinder(height,bottom,top,circularSegments)
     : cylinder(height,top,bottom,circularSegments).mirror([0,0,1]).translate([0,0,height]);

  return Manifold.union(
    cs.toPolygons()
      .map(polygon => polygon.map(([x, y]) => vertex.translate([x,y,0])))
      .map(polygon => chainHull(polygon, true))
  );
}

/**
 * Extrude a CrossSection, with offsets at the top and bottom of the volume.
 * This can be used to add a taper or draft.
 */
export function extrudeOffset (cs:CrossSection, height:number, bottom:number, top:number=0, circularSegments?:number) {
  const dx = top-bottom;
  const dz = height;
  const m = 1; // Margin for subtraction
  const zr0 = clamp(-bottom * dz/dx,0,height); // Where top and bottom cones meet.
  const r = (z:number) => abs(z*dx/dz + bottom); // Radius at height z.

  let geom = cs.extrude(height);
  if (bottom > 0 && zr0 > 0) {
    geom = geom.add(outline(cs,zr0,r(0),r(zr0),circularSegments));
  } else if (bottom < 0 && zr0 > 0) {
    geom = geom.subtract(outline(cs,zr0+m,r(-m),r(zr0),circularSegments).translate([0,0,-m]));
  }

  if (top > 0 && zr0 < height) {
    geom = geom.add(outline(cs,(height-zr0),r(zr0),r(height),circularSegments).translate([0,0,zr0]));
  } else if (top < 0 && zr0 < height) {
    geom = geom.subtract(outline(cs,(height-zr0)+m,r(zr0),r(height+m),circularSegments).translate([0,0,zr0]));
  }

  return geom;
}

const demo = () => {
    const {square, circle} = CrossSection;
    const shape = square(100,true).subtract(circle(35));
    return [
        shape,
        outline(shape,10,1,1).translate([-110,0,0]),
        extrudeOffset(shape,10,3,0).translate([110,0,0])
    ];
};
export default demo;