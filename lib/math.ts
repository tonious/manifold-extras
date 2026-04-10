import type { Mat4, Vec3 } from 'manifold-3d/manifoldCAD';

export type { Vec3 };

export const clamp = (t:number, low:number=0.0, high:number=1.0) => ((t<low) ? low : ((t>high) ? high : t));
export const sign = (t:number) => (t<0 ? -1 : (t>0 ? +1 : 0));

/**
 * A segment connects two 3d points, each defined as a Vec3.
 */
export type Segment = [Vec3,Vec3];

export const isSegment = (a:any) => {
    if (!Array.isArray(a)) return false;
    if (a.length !== 2) return false;
    if (a.find(x => !isVec3(x))) return false;
    return true;
}

export const isVec3 = (a:any):boolean => {
    if (!Array.isArray(a)) return false;
    if (a.length !== 3) return false;
    if (a.find(x => typeof x !== 'number')) return false;
    return true;
}

export const isMat4 = (a:any):boolean => {
    if (!Array.isArray(a)) return false;
    if (a.length !== 12 && a.length !== 16) return false;
    if (a.find(x => typeof x !== 'number')) return false;
    return true;
}


export const lengthSq = (v: Vec3): number => {
    const [ax, ay, az] = v;
    return ax ** 2 + ay ** 2 + az ** 2;
};

export const length = (v: Vec3|Segment): number => {
    if (isVec3(v)) {
        return Math.sqrt(lengthSq(v as Vec3));
    } else if (isSegment(v)) {
        const [p1,p2] = v as Segment;
        return length(sub(p2,p1));
    }
    throw new TypeError();
};

export const scale = (v: Vec3, s: number): Vec3 => {
    const [ax, ay, az] = v;
    return [ax * s, ay * s, az * s];
};

export const normalize = (v: Vec3|Segment): Vec3 => {
    if (isVec3(v)) {
        return scale(v as Vec3, 1 / length(v));
    } else if (isSegment(v)) {
        const [p1,p2] = v as Segment;
        return normalize(sub(p2,p1));
    }
    throw new TypeError();
};

export const add = (a: Vec3, b: Vec3): Vec3 => {
    const [ax, ay, az] = a;
    const [bx, by, bz] = b;
    return [ax + bx, ay + by, az + bz];
};

export const sub = (a: Vec3, b: Vec3): Vec3 => {
    const [ax, ay, az] = a;
    const [bx, by, bz] = b;
    return [ax - bx, ay - by, az - bz];
};

export const crossVec3Vec3 = (a: Vec3, b: Vec3): Vec3 => {
    const [ax, ay, az] = a;
    const [bx, by, bz] = b;

    return [
        ay * bz - az * by,
        az * bx - ax * bz,
        ax * by - ay * bx
    ];
};

export const dot = (a: Vec3, b: Vec3): number => {
    const [ax, ay, az] = a;
    const [bx, by, bz] = b;

    return ax*bx + ay*by + az*bz;
};

export const angle = (a:Vec3, b: Vec3): number => {
    const ab = dot(a, b)
    const al = length(a);
    const bl = length(b);
    return Math.acos(ab/(al*bl));
};

export const equals = (a: Vec3, b: Vec3, tolerance: number = 0): boolean => {
    return length(sub(a, b)) <= tolerance;
};

export const colinear = (a: Vec3, b: Vec3, tolerance: number = 0): boolean => {
    return equals(normalize(a), normalize(b), tolerance);
};

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => {
    return add(scale(a, 1-t), scale(b, t));
};

export const project = (a: Vec3, b: Vec3):Vec3 => {
    const denominator = lengthSq(b);
    if (denominator === 0) return [0,0,0];
    return scale(b, dot(b, a) / denominator);
};

export const projectToPlane = (a: Vec3, planeNormal: Vec3, planeOrigin:Vec3 = [0,0,0]): Vec3 => {
    const translated = sub(a, planeOrigin);
    const projected = sub(translated, project(translated, planeNormal));
    return add(projected, planeOrigin);
};

/**
 * Courtesy of Zalo.
 * https://zalo.github.io/blog/closest-point-between-segments/
 * https://github.com/zalo/zalo.github.io/blob/master/assets/js/ClosestSegment/SegmentSegment.js
 */
export const constrainToSegment = ([a, b]:Segment, point:Vec3):Vec3 => {
    const ba = sub(b,a)
    const t = dot(sub(point, a), ba) / lengthSq(ba);
    return lerp(a,b,clamp(t));
};

export const closestPointOnSegmentToLine = ([segA, segB]:Segment, [lineA, lineB]:Segment):Vec3 => {
    const lineBAAxis = normalize(sub(lineB,lineA));
    const inPlaneA = projectToPlane(segA, lineBAAxis, lineA);
    const inPlaneB = projectToPlane(segB, lineBAAxis, lineA);
    const inPlaneBA = sub(inPlaneB,inPlaneA);
    const t = dot(sub(lineA, inPlaneA), inPlaneBA) / lengthSq(inPlaneBA);
    return lerp(segA, segB, clamp(t));
};

export const closestPointOnSegmentToSegment = ([segA, segB]:Segment, [segC, segD]:Segment):[Vec3,Vec3] => {
    const rayPoint = closestPointOnSegmentToLine([segA, segB], [segC, segD]);
    const pointCD = constrainToSegment([segC, segD], rayPoint);
    const pointAB = constrainToSegment([segA, segB], pointCD);
    return [pointAB, pointCD];
};

const _addr = (row:number, col:number) => col * 4 + row;

export const identity = (): Mat4 => ([
    1, 0, 0, 0,   0, 1, 0, 0,   0, 0, 1, 0,   0, 0, 0, 1
]);

const crossMat4Mat4 = (a: Mat4, b: Mat4):Mat4 => {
    const m = identity();
    const A = (row:number, col:number) => a[_addr(row, col)];
    const B = (row:number, col:number) => b[_addr(row, col)];

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const ij = _addr(i, j);
            m[ij] = 0;
            for (let z = 0; z < 4; z++) {
                m[ij] += A(i, z) * B(z, j)
            }
        }
    }
    return m;
};

/**
 * Ignoring 'w'.
 */
const crossMat4Vec3 = (a: Mat4, b: Vec3): Vec3 => {
    const [x, y, z] = b;
    const A = (row:number, col:number) => a[_addr(row, col)];

    return [
        x * A(0, 0) + y * A(0, 1) + z * A(0, 2) + A(0, 3),
        x * A(1, 0) + y * A(1, 1) + z * A(1, 2) + A(1, 3),
        x * A(2, 0) + y * A(2, 1) + z * A(2, 2) + A(2, 3),
    ];
}

export function cross(a:Vec3, b:Vec3): Vec3;
export function cross(a:Mat4, b:Vec3): Vec3;
export function cross(a:Mat4, b:Mat4): Mat4;
export function cross(a:Mat4|Vec3, b:Mat4|Vec3): Mat4|Vec3 {
    if (isVec3(a) && isVec3(b)) return crossVec3Vec3(a as Vec3,b as Vec3);
    if (isMat4(a) && isMat4(b)) return crossMat4Mat4(a as Mat4, b as Mat4);
    if (isMat4(a) && isVec3(b)) return crossMat4Vec3(a as Mat4, b as Vec3);

    throw new RangeError();
};

export const translate = (p:Vec3): Mat4 => {
    const mTranslate = identity()
    mTranslate[12] = p[0];
    mTranslate[13] = p[1];
    mTranslate[14] = p[2];
    return mTranslate
};

/**
 * Provide a translation matrix that rotates the Z axis vector `z`
 * to the target direction vector, `d`.
 * 
 * See: https://iquilezles.org/articles/noacos/
 */
export const rotateAlign = (d:Vec3, z:Vec3 = [0,0,1]): Mat4 => {
    if(equals(normalize(d),normalize(z))) return identity();
    const v = cross( z, d );
    const c = dot( z, d );
    const k = (1.0-c)/(1.0-c*c);

    const [vx, vy, vz] = v;

    return [
        vx*vx*k + c,
        vy*vx*k - vz,
        vz*vx*k + vy,
        0,

        vx*vy*k + vz,
        vy*vy*k + c,
        vz*vy*k - vx,
        0,

        vx*vz*k - vy,
        vy*vz*k + vx,
        vz*vz*k + c,
        0,

        0, 0, 0, 1
    ];
};

/**
 * Generate a rotation such that vUp will point to +Y and vRight to +X.
 */
export const rotateFrom = (vUp: Vec3, vRight: Vec3): Mat4 => {
    const vForward = normalize(cross(vUp, vRight));

    const mRotate = identity();
    mRotate[0] = vRight[0];
    mRotate[4] = vRight[1];
    mRotate[8] = vRight[2];

    mRotate[1] = vUp[0];
    mRotate[5] = vUp[1];
    mRotate[9] = vUp[2];

    mRotate[2] = vForward[0];
    mRotate[6] = vForward[1];
    mRotate[10] = vForward[2];
    return mRotate;
}

/**
 * Technically only transposes the Cartesian part of an affine transformation matrix.
 */
export const transpose = (a: Mat4): Mat4 => {
    const m:Mat4 = [...a];
    for (let i=0; i<3; i++) {
        for (let j=0; j<3; j++) {
            m[_addr(i,j)] = a[_addr(j,i)];
        }
    }
    return m;
};
