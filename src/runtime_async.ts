export const runtimeAsyncJavaScript = (includeOwnedTasks: boolean): string =>
  `const asyncBlockFunctions = new WeakSet();
const asyncResults = new WeakMap();
const asyncHostPromises = new WeakMap();

function markAsyncBlock(receiver) {
  asyncBlockFunctions.add(receiver);
  return receiver;
}

function asyncResult(promise) {
  const reference = Object.freeze(Object.create(null));
  asyncResults.set(reference, promise);
  return reference;
}

function resumeTossAwait(result, environment) {
  ${
    includeOwnedTasks
      ? `const task = environment.asyncTask;
  if (task !== undefined) {
    task.wake = undefined;
    checkEffectTask(undefined, task);
  }`
      : ""
  }
  return result.value;
}

async function awaitToss(value, context) {
  if (asyncResults.has(value)) {
    ${includeOwnedTasks ? "observeEffectAsyncResult(value);" : ""}
    return await asyncResults.get(value);
  }
  if (!hostValues.has(value)) return {value};
  let resolved;
  try {
    resolved = await hostValues.get(value);
  } catch (error) {
    throw new TossRuntimeError("JavaScript Promise rejected.", context.location, {cause: error});
  }
  return {value: fromJavaScript(resolved, context)};
}`;
