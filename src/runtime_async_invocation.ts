export const runtimeAsyncInvocation = `
const ownedFailureCarriers = new WeakSet();
const ownedEffectRoot = Object.freeze(Object.create(null));

function asEffectFailure(value) {
  if (ownedFailureCarriers.has(value)) return value;
  const failure = {value, cleanup: []};
  ownedFailureCarriers.add(failure);
  return failure;
}
function effectFailureValue(value) {
  return ownedFailureCarriers.has(value) ? value.value : value;
}
function copyEffectFailure(value) {
  const copy = asEffectFailure(value.value);
  copy.cleanup = [...value.cleanup];
  return copy;
}
function recordCleanupFailure(primary, secondary) {
  primary.cleanup.push(asEffectFailure(secondary));
}
function ownedCleanupDescriptions(error) {
  const descriptions = [];
  function collect(failure) {
    try {
      descriptions.push(String(failure.value instanceof Error ? failure.value.message : failure.value));
    } catch {
      descriptions.push("<unavailable error>");
    }
    for (const nested of failure.cleanup) collect(nested);
  }
  if (ownedFailureCarriers.has(error)) {
    for (const failure of error.cleanup) collect(failure);
  }
  return Object.freeze(descriptions);
}

function taskForContext(context) { return context.environment?.asyncTask; }
const awaitOwnedValue = awaitToss;
awaitToss = function(value, context) {
  const task = taskForContext(context);
  if (task === undefined) return awaitOwnedValue(value, context);
  const waiting = asyncResults.get(value);
  if (waiting !== undefined) {
    observeEffectAsyncResult(value);
    return suspendEffectTask(waiting, task);
  }
  const operation = hostValues.get(value);
  if (operation === undefined) return {value: checkEffectTask(value, task)};
  return suspendEffectTask(operation, task, context);
};
function invokeOwnedCancellationCleanup(block, context) {
  return invokeBlock(block, [], {location: context.location});
}
function spawnOwnedEffectTask(value, context) {
  const parent = activeEffectTask(context, "spawn:");
  const result = invokeBlock(ownedAsyncBlock(value, context), [], context);
  return registerOwnedEffectChild(parent, result, context);
}
function invokeOwnedAsyncBlock(block, args, context) {
  const task = createEffectAsyncTask();
  task.observed = false;
  task.notified = false;
  const invocation = context.methodReceiver === undefined
    ? {asyncTask: task} : {...context.methodReceiver, asyncTask: task};
  const promise = Reflect.apply(block, invocation, args);
  const result = asyncResult(promise);
  if (!task.closed) {
    task.promise = promise;
    effectTasksByResult.set(result, task);
  }
  return result;
}
function preserveOwnedAsyncRejection(task, error) {
  if (task.observed || !ownedFailureCarriers.has(error)) return error;
  // A carrier reaches this point after a suspension, when the result Promise exists.
  // Forward the underlying error only if nobody observes the Toss result.
  task.promise.then(undefined, (failure) => {
    if (!task.observed) throw exposeOwnedAsyncFailure(task, failure, "unobserved-async");
  });
  return error;
}
function observeEffectAsyncResult(value) {
  const task = effectTasksByResult.get(value);
  if (task !== undefined) task.observed = true;
}
function exposeOwnedAsyncFailure(task, error, boundary) {
  if (task === undefined) return reportHostFailure(error, boundary);
  if (task.notified) return effectFailureValue(error);
  task.notified = true;
  return reportHostFailure(error, boundary);
}
`;
