import type {Mat4, Vec3} from 'manifold-3d/manifoldCAD';

export type Segment = [Vec3, Vec3];

export const clamp = (t:number, low:number=1.0, high:number=1.0) => ((t<low) ? low : ((t>high) ? high : t));

export const lengthSqVec3 = (v: Vec3): number => {
  const [ax, ay, az] = v;
  return ax ** 2 + ay ** 2 + az ** 2;
};

export const lengthVec3 = (v: Vec3): number => {
  return Math.sqrt(lengthSqVec3(v));
};

export const scaleVec3 = (v: Vec3, s: number): Vec3 => {
  const [ax, ay, az] = v;
  return [ax * s, ay * s, az * s];
};

export const normalizeVec3 = (v: Vec3): Vec3 => {
  return scaleVec3(v, 1 / lengthVec3(v));
};

export const addVec3 = (a: Vec3, b: Vec3): Vec3 => {
  const [ax, ay, az] = a;
  const [bx, by, bz] = b;
  return [ax + bx, ay + by, az + bz];
};

export const subVec3 = (a: Vec3, b: Vec3): Vec3 => {
  return addVec3(a, scaleVec3(b, -1));
};

export const crossVec3 = (a: Vec3, b: Vec3): Vec3 => {
  const [ax, ay, az] = a;
  const [bx, by, bz] = b;

  return [
    ay * bz - az * by,
    az * bx - ax * bz,
    ax * by - ay * bx
  ];
};

export const dotVec3 = (a: Vec3, b: Vec3): number => {
  const [ax, ay, az] = a;
  const [bx, by, bz] = b;

  return ax*bx + ay*by + az*bz;
};

export const angleVec3 = (a:Vec3, b: Vec3): number => {
  const ab = dotVec3(a, b)
  const al = lengthVec3(a);
  const bl = lengthVec3(b);
  return Math.acos(ab/(al*bl));
}

export const equalsVec3 = (a: Vec3, b: Vec3, tolerance: number = 0): boolean => {
  return lengthVec3(subVec3(a, b)) <= tolerance;
};

export const colinearVec3 = (a: Vec3, b: Vec3, tolerance: number = 0): boolean => {
  return equalsVec3(normalizeVec3(a), normalizeVec3(b), tolerance);
};

export const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => {
  return addVec3(scaleVec3(a, 1-t), scaleVec3(b, t));
}

/**
 * Project a onto vector b.
 */
export const projectVec3 = (a: Vec3, b: Vec3):Vec3 => {
  const denominator = lengthSqVec3(b);
  if (denominator === 0) return [0,0,0];
  return scaleVec3(b, dotVec3(b, a) / denominator);
};

export const projectOnPlaneVec3 = (a: Vec3, planeNormal: Vec3) => {
  return subVec3(a, projectVec3(a, planeNormal));
};

/**
 * Courtesy of Zalo.
 * https://zalo.github.io/blog/closest-point-between-segments/
 * https://github.com/zalo/zalo.github.io/blob/master/assets/js/ClosestSegment/SegmentSegment.js
 */
export const projectPointOnSegment = ([a, b]:Segment, point:Vec3) => {
  const ba = subVec3(b,a)
  const t = dotVec3(subVec3(point, a), ba) / lengthSqVec3(ba);
  return lerpVec3(a,b,clamp(t));
};

export const closestPointOnSegmentToLine = ([segA, segB]:Segment, [lineA, lineB]:Segment) => {
  const lineBAAxis = normalizeVec3(subVec3(lineB,lineA));
  const inPlaneA = addVec3(projectOnPlaneVec3(subVec3(segA, lineA), lineBAAxis), lineA);
  const inPlaneB = addVec3(projectOnPlaneVec3(subVec3(segB, lineA), lineBAAxis), lineA);
  const inPlaneBA = subVec3(inPlaneB,inPlaneA);
  const t = dotVec3(subVec3(lineA, inPlaneA), inPlaneBA) / lengthSqVec3(inPlaneBA);
  return lerpVec3(segA, segB, clamp(t));
};

export const closestPointOnSegmentToSegment = ([segA, segB]:Segment, [segC, segD]:Segment) => {
  const rayPoint = closestPointOnSegmentToLine([segA, segB], [segC, segD]);
  const pointCD = projectPointOnSegment([segC, segD], rayPoint);
  const pointAB = projectPointOnSegment([segA, segB], pointCD);
  return [pointAB, pointCD];
}

const _addr = (row:number, col:number) => col * 4 + row;

export const identityMat4 = (): Mat4 => ([
  1, 0, 0, 0,   0, 1, 0, 0,   0, 0, 1, 0,   0, 0, 0, 1
]);

export const multiplyMat4 = (a: Mat4, b: Mat4) => {
  const m = identityMat4();
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
}

/**
 * Ignoring 'w'.
 */
export const multiplyMat4Vec3 = (a: Mat4, b: Vec3): Vec3 => {
  const [x, y, z] = b;
  const A = (row:number, col:number) => a[_addr(row, col)];

  return [
    x * A(0, 0) + y * A(0, 1) + z * A(0, 2) + A(0, 3),
    x * A(1, 0) + y * A(1, 1) + z * A(1, 2) + A(1, 3),
    x * A(2, 0) + y * A(2, 1) + z * A(2, 2) + A(2, 3),
  ];
}

export const translateMat4 = (p:Vec3): Mat4 => {
  const mTranslate = identityMat4()
  mTranslate[12] = p[0];
  mTranslate[13] = p[1];
  mTranslate[14] = p[2];
  return mTranslate
}

/**
 * Provide a translation matrix that rotates the Z axis vector `z`
 * to the target direction vector, `d`.
 * 
 * See: https://iquilezles.org/articles/noacos/
 */
export const rotateAlignMat4 = (d:Vec3, z:Vec3 = [0,0,1]): Mat4 => {
  const v = crossVec3( z, d );
  const c = dotVec3( z, d );
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
}

/**
 * Given two adjacent line segments, generate up and right vectors.
 * vUp is perpendicular the plane of the bend.
 * vRight is in plane with the bend, pointing away from the corner.
 */
export const getUpRight = (p1: Vec3, p2: Vec3, p3: Vec3): [Vec3, Vec3] => {
  if (colinearVec3(subVec3(p2, p1), subVec3(p3, p2))) {
    throw new Error(`Segments are co-linear`);
  }

  // Lines angle to the left.  vUp is perpendicular the plane of the bend.
  const p2p1 = normalizeVec3(subVec3(p2, p1));
  const p3p2 = normalizeVec3(subVec3(p3, p2));
  const vUp = normalizeVec3(crossVec3(p3p2, p2p1));

  // vRight points away from the bend.
  const p2p1Right = normalizeVec3(crossVec3(vUp, p2p1));
  const p3p2Right = normalizeVec3(crossVec3(vUp, p3p2));
  const vRight = normalizeVec3(addVec3(p3p2Right, p2p1Right));

  return [vUp, vRight];
}

/**
 * Generate a rotation such that vUp will point to +Y and vRight to +X.
 */
export const rotateFromMat4 = (vUp: Vec3, vRight: Vec3): Mat4 => {
  const vForward = normalizeVec3(crossVec3(vUp, vRight));

  const mRotate = identityMat4();
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
export const transposeMat4 = (a: Mat4): Mat4 => {
  const m:Mat4 = [...a];
  for (let i=0; i<3; i++) {
    for (let j=0; j<3; j++) {
      m[_addr(i,j)] = a[_addr(j,i)];
    }
  }
  return m;
}