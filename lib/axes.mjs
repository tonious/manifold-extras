import {Manifold} from "manifold-3d/manifoldCAD"

const drawSymbol = (symbol, height = 3) => {
  const symbols = {
    'x': [
      [[-1,-1], [ 1, 1]],
      [[-1, 1], [ 1,-1]]
    ],
    'y': [
      [[ 0,-1], [ 0, 0]],
      [[ 0, 0], [-1, 1]],
      [[ 0, 0], [ 1, 1]]
    ],
    'z': [
      [[-1, 1], [ 1, 1]],
      [[-1, 1], [ 1,-1]],
      [[-1,-1], [ 1,-1]]
    ],
    'box': [
      [[-1, 1], [ 1, 1]],
      [[ 1, 1], [ 1,-1]],
      [[ 1,-1], [-1,-1]],
      [[-1,-1], [-1, 1]]
    ]
  }

  const xscale = height/2
  const yscale = height/2 * 4/3

  const vectors = (symbols[symbol] ?? symbols['box'])
      .map(points => points.map(([x,y]) => ([x*xscale, y*yscale])))

  return drawLines(vectors)
}

const drawLines = (vectors) => {
  const {sphere, hull, union} = Manifold

  const point = sphere(0.5,8)
  return union(
    vectors
      .map(points => points.map(
        ([x,y]) => point.translate([x,y,0])
      ))
      .map(points => hull(points))
    )
} 

const arrow = (length = 10, head=2) => {
  const vectors = [
    [[0,0], [length, 0]],
    [[length, 0], [length-head,  head]],
    [[length, 0], [length-head, -head]],
  ]
  return drawLines(vectors)
}

const xarrow = (length = 8) => {
  const geom = Manifold.compose([
    arrow(length),
    drawSymbol('x', 2)
      .rotate([0,0,-90])
      .translate([length+3,0,0])
  ])
    .translate([2,0,0])

  return setMaterial(geom, {baseColorFactor: [1,0,0]})
}

const yarrow = (length = 8) => {
  const geom = Manifold.compose([
    arrow(length),
    drawSymbol('y', 2)
      .rotate([0,0,-90])
      .translate([length+3,0,0])
  ])
    .translate([2,0,0])
    .rotate(0,0,90)

  return setMaterial(geom, {baseColorFactor: [0,1,0]})
}

const zarrow = (length = 8) => {
  const geom = Manifold.compose([
    arrow(length),
    drawSymbol('z', 2)
      .rotate([0,0,-90])
      .translate([length+3,0,0])
  ])
    .translate([2,0,0])
    .rotate(0,-90,0)

  return setMaterial(geom, {baseColorFactor: [0,0,1]})
}

export const axes = () => {
  const {sphere, compose} = Manifold
  return compose([
    setMaterial(sphere(0.5, 16), {baseColorFactor: [0.6,0.6,0.6]}),
    xarrow(), yarrow(), zarrow()
  ])
}
