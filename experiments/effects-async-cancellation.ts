// Emitted inside the experimental effect runtime.
export const effectAsyncCancellationRuntime = `
const effectTasksByResult = new WeakMap();
const effectTasksByBoundary = new WeakMap();

function createEffectAsyncTask() {
  return {closed: false, cancellation: undefined, wake: undefined, cleanups: []};
}
function bindEffectAsyncTask(task, boundary) {
  if (task !== undefined) effectTasksByBoundary.set(boundary, task);
}
function finishEffectAsyncTask(task, boundary) {
  if (task === undefined) return;
  task.closed = true;
  task.wake = undefined;
  task.cleanups.length = 0;
  effectTasksByBoundary.delete(boundary);
}
function cancelEffectAsyncTask(result, reason, context) {
  const task = effectTasksByResult.get(result);
  if (task === undefined || task.closed || task.cancellation !== undefined) return false;
  const cause = toJavaScript(reason, context);
  task.cancellation = asEffectFailure(new TossRuntimeError("Async Block cancelled.", context.location, {cause}));
  task.wake?.(task.cancellation);
  return true;
}
function registerEffectCancellationCleanup(value, context) {
  const task = effectTasksByBoundary.get(context.boundary);
  if (task === undefined || task.closed || task.cancellation !== undefined) {
    throw new TossRuntimeError("onCancel: requires an active async Block.", context.location);
  }
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
