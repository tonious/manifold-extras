import {Manifold, getCircularSegments} from "manifold-3d/manifoldCAD"

const {floor, PI, cos, sin } = Math
const TAU=2*PI

const sliceYZ = (geom) => {
  const bounds = geom.boundingBox()

  const [cx, cy, cz] = [...bounds["min"].keys()]
      .map(n => ((bounds["min"][n] + bounds["max"][n])/2))
  const [ex, ey, ez] = [...bounds["min"].keys()]
      .map(n => (bounds["max"][n] - bounds["min"][n]))

  const segments = getCircularSegments(bounds.min[0])
  const thickness = Math.max(floor(100*segments/(TAU*10))/100,0.1)
  const slices = []
  let y = bounds["min"][1]

  do {
    const box = Manifold.cube([ex+1, thickness, ez+1], true)
      .translate([cx, y, cz])
    const slice = geom.intersect(box)

    slices.push(slice)
  } while ((y+=thickness)<=bounds["max"][1])

  return slices
}

export const polarWarp = (geom) => sliceYZ(geom)
  .map(geom => geom.warp(vec => {
    const [x,y,z] = vec

    //Standard polar coordinates.
    //const r = sqrt(x**2 + y**2)
    //const phi = atan2(y,x)

    const r = x
    const phi = y/r

    vec[0] = r * cos(phi)
    vec[1] = r * sin(phi)
    vec[2] = z
  }))
  .reduce((acc, cur) => acc.add(cur))

  export const cylinderWarp = (geom) => sliceYZ(geom)
  .map(geom => geom.warp(vec => {
    const [x,y,z] = vec

    //Standard polar coordinates.
    //const r = sqrt(x**2 + y**2)
    //const phi = atan2(y,x)

    const r = x
    const phi = y/geom.boundingBox().min(x)

    vec[0] = r * cos(phi)
    vec[1] = r * sin(phi)
    vec[2] = z
  }))
  .reduce((acc, cur) => acc.add(cur))
