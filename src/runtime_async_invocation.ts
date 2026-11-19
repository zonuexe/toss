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
  const entry = asyncResults.get(value);
  if (entry !== undefined) {
    const waiting = entry.promise;
    entry.observation ??= true;
    if (waiting === undefined) return entry.taskOrValue;
    return entry.taskOrValue === undefined ? waiting : suspendEffectTask(waiting, task);
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
function invokeOwnedAsyncBlock(block, args, context, discardResult) {
  const task = createEffectAsyncTask(context.methodReceiver?.context);
  const promise = Reflect.apply(block, task, args);
  if (discardResult) {
    task.discardedPromise = promise;
    return;
  }
  return asyncResult(promise, task);
}
function preserveOwnedAsyncRejection(task, error) {
  const entry = task.resultEntry;
  if (entry?.observation !== undefined || !ownedFailureCarriers.has(error)) return error;
  // The observer state outlives the running task and can still be updated before rejection.
  const promise = entry?.promise ?? task.discardedPromise;
  promise.then(undefined, (failure) => {
    if (entry === undefined) throw reportHostFailure(failure, "unobserved-async");
    if (entry.observation === undefined) throw exposeOwnedAsyncFailure(entry, failure, "unobserved-async");
  });
  return error;
}
function observeEffectAsyncResult(value) {
  const entry = asyncResults.get(value);
  if (entry !== undefined) entry.observation ??= true;
}
function exposeOwnedAsyncFailure(entry, error, boundary) {
  if (entry.notified) return effectFailureValue(error);
  entry.notified = true;
  return reportHostFailure(error, boundary);
}
`;
