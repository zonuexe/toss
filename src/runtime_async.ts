export const runtimeAsyncJavaScript = (includeOwnedTasks: boolean): string =>
  `const asyncBlockFunctions = new WeakSet();
const asyncResults = new WeakMap();
const asyncHostPromises = new WeakMap();
${
    includeOwnedTasks
      ? "function asyncResultTask(value) { return asyncResults.get(value)?.task; }"
      : ""
  }

function markAsyncBlock(receiver) {
  asyncBlockFunctions.add(receiver);
  return receiver;
}

function asyncResult(promise${includeOwnedTasks ? ", task" : ""}) {
  const reference = Object.freeze(Object.create(null));
  ${
    includeOwnedTasks
      ? `const entry = {promise, task: task.finished ? undefined : task, observed: false, notified: false};
  if (entry.task !== undefined) task.resultEntry = entry;
  asyncResults.set(reference, entry);`
      : "asyncResults.set(reference, promise);"
  }
  return reference;
}

function asyncResultPromise(value) {
  const entry = asyncResults.get(value);
  return ${includeOwnedTasks ? "entry?.promise" : "entry"};
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
  const pendingResult = asyncResultPromise(value);
  if (pendingResult !== undefined) {
    ${includeOwnedTasks ? "observeEffectAsyncResult(value);" : ""}
    return await pendingResult;
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
