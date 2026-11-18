// Shared by the ordinary and experimental runtimes.
export const runtimeAsyncOwnership = (diagnosticHost: string): string => `
const effectTasksByResult = new WeakMap();
const ownedHostFailureOrigins = new WeakMap();
const onLateHostOperationFailure = ${diagnosticHost}?.onLateHostOperationFailure;
if (onLateHostOperationFailure !== undefined && typeof onLateHostOperationFailure !== "function") {
  throw new TypeError("Expected onLateHostOperationFailure to be a function.");
}

function createEffectAsyncTask() {
  return {
    closed: false, cancellation: undefined, wake: undefined, cleanups: [],
    children: new Map(), hostOperations: new Map(), controller: undefined,
    hostAbortTime: undefined,
  };
}
function finishEffectAsyncTask(task) {
  if (task === undefined) return;
  task.closed = true;
  task.wake = undefined;
  task.cleanups.length = 0;
  task.children.clear();
  task.hostOperations.clear();
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
  if (failedParent !== undefined) abortOwnedHostOperations(failedParent, cause);
  for (const current of cancelled) {
    abortOwnedHostOperations(current, cause);
    current.wake?.(current.cancellation);
  }
}
function abortOwnedHostOperations(task, cause) {
  if (task.controller === undefined) return;
  task.hostAbortTime = performance.now();
  task.controller.abort(cause);
}
function activeEffectTask(context, operation) {
  const task = taskForContext(context);
  if (task === undefined || task.closed || task.cancellation !== undefined) {
    throw new TossRuntimeError(operation + " requires an active async Block.", context.location);
  }
  return task;
}
function ownedAsyncBlock(value, context) {
  const block = blockArgument(value, context);
  if (!asyncBlockFunctions.has(block) || block.length !== 0) {
    throw new TossRuntimeError("spawn: requires a zero-argument async Block.", context.location);
  }
  return block;
}
function registerOwnedEffectChild(parent, result, context) {
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
function startOwnedHostOperation(value, context, abortWaitMs) {
  const task = activeEffectTask(context, "hostOperation:");
  if (abortWaitMs !== undefined &&
      (!Number.isInteger(abortWaitMs) || abortWaitMs < 0 || abortWaitMs > 2147483647)) {
    throw new TossRuntimeError("abortWaitMs: requires an integer from 0 to 2147483647.", context.location);
  }
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
  const operations = task.hostOperations;
  const previous = operations.get(operation);
  // A shared Promise must satisfy the longest wait requested by its registrations.
  if (previous === undefined || abortWaitMs === undefined ||
      (previous.abortWaitMs !== undefined && abortWaitMs > previous.abortWaitMs)) {
    operations.set(operation, {location: context.location, abortWaitMs});
  }
  operation.then(() => operations.delete(operation), () => {});
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
  const owned = !asyncResults.has(value) && task?.hostOperations.has(operation);
  const waiting = awaitOwnedValue(value, context);
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
    return checkEffectTask(await Promise.race([waiting, interrupted]), task);
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
  for (const [operation, {location}] of task.hostOperations) {
    waiting.push(operation.catch((cause) => {
      const error = new TossRuntimeError("JavaScript host operation rejected.", location, {cause});
      ownedHostFailureOrigins.set(error, operation);
      throw error;
    }));
  }
  await waitEffectTask(Promise.all(waiting), task);
}
async function observeLateHostOperationFailure(operation, registration, abortReason) {
  const {location: {file, line, column}, abortWaitMs} = registration;
  const location = Object.freeze({file, line, column});
  let cause;
  try {
    await operation;
    return;
  } catch (error) {
    cause = error;
  }
  try {
    const failure = Object.freeze({cause, abortReason, abortWaitMs, location});
    await withEffectBoundary(() => Promise.resolve(onLateHostOperationFailure(failure)));
  } catch {
    // An observer error must not affect task failure or create another notification.
  }
}
async function observeStoppedHostOperation(operation, registration, abortTime, abortReason) {
  const {location, abortWaitMs} = registration;
  let timer;
  let deadlineError;
  try {
    if (abortWaitMs === undefined) {
      await operation;
    } else {
      const remaining = Math.max(0, Math.ceil(abortWaitMs - (performance.now() - abortTime)));
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          deadlineError = new TossRuntimeError(
            "JavaScript host operation did not settle within " + abortWaitMs + " ms after abort.", location,
          );
          reject(deadlineError);
        }, remaining);
      });
      // The race keeps observing the operation if it rejects after the timer wins.
      await Promise.race([operation, deadline]);
    }
    return undefined;
  } catch (error) {
    if (onLateHostOperationFailure !== undefined && deadlineError !== undefined && error === deadlineError) {
      void observeLateHostOperationFailure(operation, registration, abortReason);
    }
    return {error};
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
async function settleEffectTaskFailure(task, error, location) {
  if (task === undefined) return asEffectFailure(error);
  task.closed = true;
  const cancelled = task.cancellation !== undefined;
  const primary = cancelled ? task.cancellation : copyEffectFailure(asEffectFailure(error));
  const reason = cancelled ? primary.value.cause : primary.value;
  if (!cancelled) stopEffectTasks([...task.children.values()], reason, {location}, task);
  const abortReason = task.controller?.signal.reason;
  const hostFailures = [...task.hostOperations].map(async ([operation, registration]) => ({
    operation, failure: await observeStoppedHostOperation(operation, registration, task.hostAbortTime, abortReason),
  }));
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
  for (const waiting of hostFailures) {
    const {operation, failure} = await waiting;
    if (failure !== undefined && operation !== ownedHostFailureOrigins.get(primary.value) &&
        !Object.is(failure.error, reason)) {
      recordCleanupFailure(primary, failure.error);
    }
  }
  while (cancelled && task.cleanups.length > 0) {
    const {block, context} = task.cleanups.pop();
    try {
      const result = invokeOwnedCancellationCleanup(block, context);
      if (asyncResults.has(result)) await awaitOwnedValue(result, context);
    } catch (error) {
      recordCleanupFailure(primary, error);
    }
  }
  return primary;
}
`;
