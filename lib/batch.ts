import {Manifold} from 'manifold-3d/manifoldCAD';

interface BatchOperationArguments {
  batchSize: number;
  callback: ((seenObj: number) => void) | null;
}

/**
 * Split a large CSG operation into smaller operations.
 * 
 * Order is not guaranteed -- operator must be commutative.
 */
export function batchOperation (
    operator:(objects:Array<Manifold>) => Manifold,
    objects:Iterable<Manifold>,
    args:Partial<BatchOperationArguments> = {}
): Manifold {
  const opts:BatchOperationArguments = {
    batchSize: 500,
    callback: (seenObj: number) => {
      if (seenObj >= opts.batchSize) console.log(`${seenObj} objects processed.`);
    },
    ...args,
  }
  let seenObj = 0;
  let batch:Array<Manifold> = [];

  const callback = () => {
    if (typeof opts.callback === 'function') opts.callback(seenObj);
  };

  const handleBatch = () => {
    const batched = operator(batch);
    // Force mesh evaluation.
    batched.numTri(); 

    batch = [];
    callback();
    return batched;
  };

  function *batches (objects:Iterable<Manifold>) {
    callback();
    for (const obj of objects) {
      batch.push(obj);
      seenObj++;
      if (batch.length >= opts.batchSize) {
        yield handleBatch();
      };
    }

    if (batch.length > 0) {
      yield handleBatch();
    }
  }
  
  const result = operator([...batches(objects)]);
  result.numTri(); // Force mesh evaluation of all batches.
  return result;
}

/**
 * Perform a union operation, batching and evaluating `objects`.
 */
export function batchUnion (
    objects:Iterable<Manifold>,
    args:Partial<BatchOperationArguments> = {}
): Manifold {
  return batchOperation(Manifold.union, objects, args);
}
