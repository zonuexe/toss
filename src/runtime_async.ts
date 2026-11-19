export const runtimeAsyncJavaScript = (includeOwnedTasks: boolean): string =>
  `const asyncBlockFunctions = new WeakSet();
${
    includeOwnedTasks
      ? `class AsyncResultReference extends class {
  constructor(reference) { return reference; }
} {
  #entry;
  constructor(entry) {
    // Preserve the opaque reference's null prototype while storing its state directly.
    super(Object.create(null));
    this.#entry = entry;
    Object.freeze(this);
  }
  static has(value) {
    return value !== null && (typeof value === "object" || typeof value === "function") && #entry in value;
  }
  static get(value) {
    if (AsyncResultReference.has(value)) return value.#entry;
  }
}
const asyncResults = AsyncResultReference;`
      : "const asyncResults = new WeakMap();"
  }
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
  ${
    includeOwnedTasks
      ? `const entry = {promise, [asyncResultState]: task.finished ? undefined : task,
    observation: undefined, notified: false};
  if (entry[asyncResultState] !== undefined) task.resultEntry = entry;
  return new AsyncResultReference(entry);`
      : `const reference = Object.freeze(Object.create(null));
  asyncResults.set(reference, promise);
  return reference;`
  }
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
