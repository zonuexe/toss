export const runtimeAsyncJavaScript = (includeOwnedTasks: boolean): string =>
  `const asyncBlockFunctions = new WeakSet();
const asyncResults = new WeakMap();
const asyncResultState = Symbol();
${
    includeOwnedTasks
      ? `function asyncResultTask(value) {
  const entry = asyncResults.get(value);
  return entry?.promise === undefined ? undefined : entry[asyncResultState];
}`
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
      ? `const entry = {promise, [asyncResultState]: task.finished ? undefined : task,
    observation: undefined, notified: false};
  if (entry[asyncResultState] !== undefined) task.resultEntry = entry;
  asyncResults.set(reference, entry);`
      : "asyncResults.set(reference, promise);"
  }
  return reference;
}

function asyncResultAwaitable(value) {
  const entry = asyncResults.get(value);
  return ${
    includeOwnedTasks ? "entry?.promise ?? entry?.[asyncResultState]" : "entry"
  };
}

const settledTossTick = ${
    includeOwnedTasks ? "(async () => {})()" : "undefined"
  };

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
  const pendingResult = asyncResultAwaitable(value);
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
