import {CrossSection} from 'manifold-3d/manifoldCAD';

export const torus = (major:number, minor:number) => {
  return CrossSection.circle(minor).translate([major, 0]).revolve();
};

export default torus;