import {Manifold} from "manifold-3d/manifoldCAD";
import {batchUnion} from "./batch.ts";

export const pairUpLoop = (acc:Array<any>,cur:any,idx:number,arr:Array<any>) =>
    ([...acc, [cur, arr[(idx+1<arr.length) ? idx+1 : 0]]])
export const pairUpOpen = (acc:Array<any>,cur:any,idx:number,arr:Array<any>) =>
    ((idx+1<arr.length) ? [...acc, [cur, arr[idx+1]]] : acc)

export const chainHull = (arr: Array<Manifold>, closed:boolean = false): Manifold => {
  const segments = arr
    .reduce(closed ? pairUpLoop : pairUpOpen, [])
    .map(pairs => Manifold.hull(pairs));
  return batchUnion(segments, {callback: null});
};