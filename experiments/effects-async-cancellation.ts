// Emitted inside the experimental effect runtime.
export const effectAsyncCancellationRuntime = `
const effectTasksByResult = new WeakMap();
const effectTasksByBoundary = new WeakMap();
const ownedHostFailureOrigins = new WeakMap();

function createEffectAsyncTask() {
  return {
    closed: false, cancellation: undefined, wake: undefined, cleanups: [],
    children: new Map(), hostOperations: new Map(), controller: undefined,
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
  stopEffectTasks([task], cause, context);
  return true;
}
function stopEffectTasks(pending, cause, context, failedParent) {
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
  failedParent?.controller?.abort(cause);
  for (const current of cancelled) {
    current.controller?.abort(cause);
    current.wake?.(current.cancellation);
  }
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
  observeEffectAsyncResult(result);
  const forget = () => {
    if (parent.cancellation === undefined) parent.children.delete(result);
  };
  asyncResults.get(result).then(forget, () => {});
  if (parent.cancellation !== undefined) {
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
  task.hostOperations.set(operation, context.location);
  const forget = () => {
    if (task.cancellation === undefined) task.hostOperations.delete(operation);
  };
  operation.then(forget, () => {});
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
  const operation = hostValues.get(value);
  const owned = task?.hostOperations.has(operation);
  const waiting = awaitToss(value, context);
  if (!owned) return await waitEffectTask(waiting, task);
  const tracked = waiting.catch((error) => {
    ownedHostFailureOrigins.set(error, operation);
    throw error;
  });
  return await waitEffectTask(tracked, task);
}
async function waitEffectTask(waiting, task) {
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
function hasEffectOwnedWork(task) {
  return task !== undefined && (task.children.size > 0 || task.hostOperations.size > 0);
}
async function joinEffectOwnedWork(task) {
  const waiting = [...task.children.keys()].map((result) => asyncResults.get(result));
  for (const [operation, location] of task.hostOperations) {
    waiting.push(operation.catch((cause) => {
      const error = new TossRuntimeError("JavaScript host operation rejected.", location, {cause});
      ownedHostFailureOrigins.set(error, operation);
      throw error;
    }));
  }
  await waitEffectTask(Promise.all(waiting), task);
}
async function settleEffectTaskFailure(task, error, location) {
  if (task === undefined) return asEffectFailure(error);
  task.closed = true;
  const cancelled = task.cancellation !== undefined;
  const primary = cancelled ? task.cancellation : copyEffectFailure(asEffectFailure(error));
  const reason = cancelled ? primary.value.cause : primary.value;
  if (!cancelled) stopEffectTasks([...task.children.values()], reason, {location}, task);
  for (const [result, child] of task.children) {
    try {
      await asyncResults.get(result);
    } catch (childError) {
      if ((!cancelled && childError === error) || childError === primary) continue;
      if (child.cancellation !== undefined && childError === child.cancellation) {
        for (const failure of childError.cleanup) recordCleanupFailure(primary, failure);
      } else {
        recordCleanupFailure(primary, childError);
      }
    }
  }
  for (const operation of task.hostOperations.keys()) {
    try {
      await operation;
    } catch (error) {
      if (operation !== ownedHostFailureOrigins.get(primary.value) && !Object.is(error, reason)) {
        recordCleanupFailure(primary, error);
      }
    }
  }
  while (cancelled && task.cleanups.length > 0) {
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
