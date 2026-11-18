export const runtimeAsyncInvocation = `
const ownedFailureCarriers = new WeakSet();
const ownedAsyncObservations = new WeakMap();
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
  if (task === undefined || (!asyncResults.has(value) && !hostValues.has(value))) {
    return awaitOwnedValue(checkEffectTask(value, task), context);
  }
  return awaitEffectTask(value, context, task);
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
  const promise = Reflect.apply(block, {...context.methodReceiver, asyncTask: task}, args);
  const result = asyncResult(promise);
  effectTasksByResult.set(result, task);
  const observation = {observed: false, notified: false};
  ownedAsyncObservations.set(result, observation);
  promise.then(undefined, (error) => {
    if (observation.observed) return;
    const exposed = ownedFailureCarriers.has(error)
      ? exposeOwnedAsyncFailure(result, error, "unobserved-async")
      : error;
    throw exposed;
  });
  return result;
}
function observeEffectAsyncResult(value) {
  const observation = ownedAsyncObservations.get(value);
  if (observation !== undefined) observation.observed = true;
}
function exposeOwnedAsyncFailure(value, error, boundary) {
  const observation = ownedAsyncObservations.get(value);
  if (observation.notified) return effectFailureValue(error);
  observation.notified = true;
  return reportHostFailure(error, boundary);
}
`;
