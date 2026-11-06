export const runtimeAsyncJavaScript =
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

async function awaitToss(value, context) {
  if (asyncResults.has(value)) {
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
