import hershey from "hershey"

export const text = (text, fontHeight=10, stroke=1) => {
  const {circle, hull} = CrossSection

  // A little more detail for small strokes.
  const dot = circle(stroke/2, getCircularSegments(stroke/2) * (stroke <= 1 ? 2 : 1) )
  const {bounds, paths} = hershey.stringToPaths(text)

  const segments = paths
    .map(points => points.map((point,i,arr) => (i+1 < arr.length ? [point, arr[i+1]] : null)))
    .flat()
    .filter((x) => !!x);

  return segments
    .map(points => points.map(([x,y]) => ([x - bounds.minX, y+9])))
    .map(points => points.map(([x,y]) => ([x*fontHeight/(12+9), y*fontHeight/(12+9)])))
    .map(([start, end]) => ([dot.translate(start), dot.translate(end)]))
    .map(([start, end]) => hull([start, end]))
    .reduce((acc,cur) => acc.add(cur));
}