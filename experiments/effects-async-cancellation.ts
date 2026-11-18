// Emitted inside the experimental effect runtime.
export const effectAsyncCancellationRuntime = `
const effectTasksByResult = new WeakMap();
const effectTasksByBoundary = new WeakMap();

function createEffectAsyncTask() {
  return {
    closed: false, cancellation: undefined, wake: undefined, cleanups: [],
    children: new Map(), hostOperations: new Set(), controller: undefined,
  };
}
function bindEffectAsyncTask(task, boundary) {
  if (task !== undefined) effectTasksByBoundary.set(boundary, task);
}
function finishEffectAsyncTask(task, boundary) {
  if (task === undefined) return;
  task.closed = true;
  task.wake = undefined;
  task.cleanups.length = 0;
  task.children.clear();
  task.hostOperations.clear();
  effectTasksByBoundary.delete(boundary);
}
function cancelEffectAsyncTask(result, reason, context) {
  const task = effectTasksByResult.get(result);
  if (task === undefined || task.closed || task.cancellation !== undefined) return false;
  return requestEffectCancellation(task, toJavaScript(reason, context), context);
}
function requestEffectCancellation(task, cause, context) {
  if (task.closed || task.cancellation !== undefined) return false;
  const pending = [task];
  const cancelled = [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current.closed || current.cancellation !== undefined) continue;
    current.cancellation = asEffectFailure(new TossRuntimeError("Async Block cancelled.", context.location, {cause}));
    cancelled.push(current);
    for (const [result, child] of current.children) {
      observeEffectAsyncResult(result);
      pending.push(child);
    }
  }
  for (const current of cancelled) {
    current.controller?.abort(cause);
    current.wake?.(current.cancellation);
  }
  return true;
}
function activeEffectTask(context, operation) {
  const task = effectTasksByBoundary.get(context.boundary);
  if (task === undefined || task.closed || task.cancellation !== undefined) {
    throw new TossRuntimeError(operation + " requires an active async Block.", context.location);
  }
  return task;
}
function* spawnOwnedEffectTask(value, context) {
  const parent = activeEffectTask(context, "spawn:");
  const block = blockArgument(value, context);
  if (!asyncBlockFunctions.has(block) || block.length !== 0) {
    throw new TossRuntimeError("spawn: requires a zero-argument async Block.", context.location);
  }
  const result = yield* effectInvoke(block, [], context);
  const child = effectTasksByResult.get(result);
  parent.children.set(result, child);
  const forget = () => {
    if (parent.cancellation === undefined) parent.children.delete(result);
  };
  asyncResults.get(result).then(forget, forget);
  if (parent.cancellation !== undefined) {
    observeEffectAsyncResult(result);
    requestEffectCancellation(child, parent.cancellation.value.cause, context);
  }
  return result;
}
function startOwnedHostOperation(value, context) {
  const task = activeEffectTask(context, "hostOperation:");
  const factory = hostValues.get(value);
  if (typeof factory !== "function") {
    throw new TossRuntimeError("hostOperation: requires a JavaScript function.", context.location);
  }
  task.controller ??= new AbortController();
  let operation;
  try {
    operation = withEffectBoundary(() => Promise.resolve(factory(task.controller.signal)));
  } catch (cause) {
    throw new TossRuntimeError("JavaScript host operation threw.", context.location, {cause});
  }
  task.hostOperations.add(operation);
  const forget = () => {
    if (task.cancellation === undefined) task.hostOperations.delete(operation);
  };
  operation.then(forget, forget);
  return fromJavaScript(operation, context);
}
function registerEffectCancellationCleanup(value, context) {
  const task = activeEffectTask(context, "onCancel:");
  const block = blockArgument(value, context);
  if (block.length !== 0) {
    throw new TossRuntimeError("onCancel: requires a zero-argument Block.", context.location);
  }
  task.cleanups.push({block, context});
  return null;
}
async function awaitEffectTask(value, context, task) {
  const waiting = awaitToss(value, context);
  if (task === undefined) return await waiting;
  const interrupted = new Promise((_, reject) => {
    task.wake = reject;
    if (task.cancellation !== undefined) reject(task.cancellation);
  });
  try {
    return await Promise.race([waiting, interrupted]);
  } finally {
    task.wake = undefined;
  }
}
function checkEffectTask(value, task) {
  if (task?.cancellation !== undefined) throw task.cancellation;
  return value;
}
async function unwindEffectCancellation(task) {
  task.closed = true;
  const primary = task.cancellation;
  for (const [result, child] of task.children) {
    try {
      await asyncResults.get(result);
    } catch (error) {
      if (child.cancellation !== undefined && error === child.cancellation) {
        for (const failure of error.cleanup) recordCleanupFailure(primary, failure);
      } else {
        recordCleanupFailure(primary, error);
      }
    }
  }
  for (const operation of task.hostOperations) {
    try {
      await operation;
    } catch (error) {
      if (!Object.is(error, primary.value.cause)) recordCleanupFailure(primary, error);
    }
  }
  while (task.cleanups.length > 0) {
    const {block, context} = task.cleanups.pop();
    try {
      const result = withEffectBoundary(() =>
        runEffectProgram(effectInvoke(block, [], {...context, boundary: getEffectBoundary()}), "Async")
      );
      if (asyncResults.has(result)) await awaitToss(result, context);
    } catch (error) {
      recordCleanupFailure(primary, error);
    }
  }
  return primary;
}
`;
