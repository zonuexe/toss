// Experimental cooperative initialization, not the production module runtime.
export const experimentalEffectModuleRuntime = `
const effectModuleInitializers = [];
const effectModuleStates = new Map();
function effectInitialize(id, location) {
  let abandoning = false;
  const iterator = (function*() {
    const previous = effectModuleStates.get(id);
    if (previous?.state === "done") return previous.value;
    if (previous?.state === "failed") throw previous.error;
    if (previous?.state === "running") throw new TossRuntimeError("Module initialization re-entered.", location);
    effectModuleStates.set(id, {state: "running"});
    try {
      const value = yield* effectModuleInitializers[id]();
      effectModuleStates.set(id, {state: "done", value});
      return value;
    } catch (error) {
      if (abandoning) {
        const interrupted = new TossRuntimeError("Module initialization interrupted.", location);
        recordCleanupFailure(interrupted, error);
        effectModuleStates.set(id, {state: "failed", error: interrupted});
      } else {
        effectModuleStates.set(id, {state: "failed", error});
      }
      throw error;
    } finally {
      if (effectModuleStates.get(id)?.state === "running") {
        effectModuleStates.set(id, {state: "failed", error: new TossRuntimeError("Module initialization interrupted.", location)});
      }
    }
  })();
  return {
    [Symbol.iterator]() { return this; },
    next(value) { return iterator.next(value); },
    throw(error) { return iterator.throw(error); },
    return(value) { abandoning = true; return iterator.return(value); },
  };
}
`;
