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
  let pending;
  if (asyncResults.has(value)) {
    pending = asyncResults.get(value);
  } else if (hostValues.has(value)) {
    pending = Promise.resolve(hostValues.get(value)).then((resolved) =>
      ({value: fromJavaScript(resolved, context)})
    );
  } else {
    pending = Promise.resolve({value});
  }
  try {
    return await pending;
  } catch (error) {
    if (error instanceof TossRuntimeError) throw error;
    throw new TossRuntimeError("JavaScript Promise rejected.", context.location, {cause: error});
  }
}`;
