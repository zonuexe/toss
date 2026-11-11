// Experimental runtime source; not the production Toss runtime.
export const experimentalEffectRuntime = `
const effectBlocks = new WeakSet();
const effectJavaScriptCallbacks = new WeakMap();
let effectBoundary = Object.freeze({});
function withEffectBoundaryValue(boundary, body) {
  const previous = effectBoundary;
  effectBoundary = boundary;
  try { return body(); } finally { effectBoundary = previous; }
}
function withEffectBoundary(body) { return withEffectBoundaryValue(Object.freeze({}), body); }
function evaluateEffectJavaScript(evaluator, values, context) {
  return withEffectBoundary(() => evaluateCompiledJavaScript(evaluator, values, context));
}
function effectJavaScriptCallback(receiver, context) {
  if (effectResumeStates.has(receiver)) throw new TossRuntimeError("Resume cannot cross the JavaScript boundary.", context.location);
  const previous = effectJavaScriptCallbacks.get(receiver);
  if (previous !== undefined) return fromJavaScript(previous, context);
  const callback = function(...hostArguments) {
    try { return withEffectBoundary(() => {
      if (hostArguments.length < receiver.length)
        throw new TossRuntimeError("JavaScript callback expects " + receiver.length + " argument(s), received " + hostArguments.length + ".", context.location);
      const args = hostArguments.slice(0, receiver.length).map((value) => fromJavaScript(value, context));
      const lexicalContext = {location: context.location, environment: context.environment, boundary: effectBoundary};
      return toJavaScript(runEffectProgram(effectInvoke(receiver, args, lexicalContext), "JavaScript"), context);
    }); } catch (error) { reportEffectFailures(error); throw error; }
  };
  effectJavaScriptCallbacks.set(receiver, callback);
  return fromJavaScript(callback, context);
}
const effectNativeSymbols = new WeakSet();
function registerEffectSymbolRoot(root) { effectNativeSymbols.add(Reflect.get(root, "generateUnique")); }
const effectResumeStates = new WeakMap();
const effectCleanupFailures = new WeakMap();
const effectHandlerContexts = new WeakMap();
const effectOriginalErrorStacks = new WeakMap();
let effectCleanupDepth = 0;
const effectRoot = Object.freeze(Object.create(null));
function markEffectBlock(block) { effectBlocks.add(block); return block; }
function* effectInvoke(block, args, context) {
  const boundary = context.boundary ?? effectBoundary;
  const methodReceiver = context.methodReceiver === undefined
    ? {kind: "effectInvocation", effectBoundary: boundary}
    : {...context.methodReceiver, effectBoundary: boundary};
  const result = withEffectBoundaryValue(boundary, () => invokeBlock(block, args, {...context, methodReceiver}));
  if (!effectBlocks.has(block)) return result;
  const delegate = {
    [Symbol.iterator]() { return this; },
    next(value) { return withEffectBoundaryValue(boundary, () => result.next(value)); },
    throw(error) { return withEffectBoundaryValue(boundary, () => result.throw(error)); },
    return(value) { return withEffectBoundaryValue(boundary, () => result.return(value)); },
  };
  return yield* delegate;
}
function recordCleanupFailure(primary, secondary) {
  if (!(primary instanceof Error)) throw secondary;
  const failures = effectCleanupFailures.get(primary) ?? [];
  failures.push(secondary);
  effectCleanupFailures.set(primary, failures);
}
function setEffectErrorStack(error, value) {
  try { return Reflect.set(error, "stack", value); }
  catch (_failure) { return false; }
}
function snapshotEffectFailure(error) {
  if (!(error instanceof Error)) return undefined;
  return {
    cleanup: [...(effectCleanupFailures.get(error) ?? [])],
    contexts: [...(effectHandlerContexts.get(error) ?? [])],
  };
}
function restoreEffectFailure(error, snapshot) {
  if (!(error instanceof Error)) return;
  if (snapshot === undefined || snapshot.cleanup.length === 0) effectCleanupFailures.delete(error);
  else effectCleanupFailures.set(error, [...snapshot.cleanup]);
  if (snapshot === undefined || snapshot.contexts.length === 0) effectHandlerContexts.delete(error);
  else effectHandlerContexts.set(error, [...snapshot.contexts]);
  if (effectOriginalErrorStacks.has(error)) setEffectErrorStack(error, effectOriginalErrorStacks.get(error));
}
function recordHandlerContext(error, request) {
  if (!(error instanceof Error)) return;
  const contexts = effectHandlerContexts.get(error) ?? [];
  if (!contexts.includes(request)) contexts.push(request);
  effectHandlerContexts.set(error, contexts);
}
function validateZeroArgumentBlock(value, context) {
  const block = blockArgument(value, context);
  if (asyncBlockFunctions.has(block)) throw new TossRuntimeError("Async Blocks are not supported here.", context.location);
  if (block.length !== 0) throw new TossRuntimeError("Block expects " + block.length + " argument(s), received 0.", context.location);
  return block;
}
function* effectEnsure(receiver, cleanup, context) {
  const body = validateZeroArgumentBlock(receiver, context);
  const finalizer = validateZeroArgumentBlock(cleanup, context);
  let failed = false;
  let primary;
  try { return yield* effectInvoke(body, [], context); }
  catch (error) { failed = true; primary = error; throw error; }
  finally {
    effectCleanupDepth++;
    try { yield* effectInvoke(finalizer, [], context); }
    catch (error) { if (failed) recordCleanupFailure(primary, error); else throw error; }
    finally { effectCleanupDepth--; }
  }
}
function* effectHandle(block, handler, context) {
  if (asyncBlockFunctions.has(block)) throw new TossRuntimeError("Async Blocks are not supported here.", context.location);
  if (handler === null || typeof handler !== "object" || Array.isArray(handler) || isJavaScriptReference(handler))
    throw new TossRuntimeError("Handler must be an Object.", context.location);
  const iterator = effectInvoke(block, [], context);
  const resumeSignal = Symbol("resume");
  const pending = [];
  let current = iterator;
  let currentState = null;
  let input;
  let throwNext = false;
  let done = false;
  let failed = false;
  let primary;
  try {
    while (true) {
      let step;
      try {
        step = throwNext ? current.throw(input) : current.next(input);
        throwNext = false;
        input = undefined;
        if (step.done) {
          if (currentState !== null) {
            currentState.active = false;
            if (!currentState.used && !done) {
              done = true;
              const closed = iterator.return();
              if (!closed.done) throw new TossRuntimeError("Cleanup suspended.", context.location);
            }
          } else {
            done = true;
          }
          if (pending.length === 0) return step.value;
          const previous = pending.pop();
          current = previous.iterator;
          currentState = previous.state;
          currentState.suspended = false;
          input = step.value;
          continue;
        }
      } catch (error) {
        if (currentState !== null) {
          currentState.active = false;
          recordHandlerContext(error, currentState.request);
        }
        if (pending.length === 0) throw error;
        const previous = pending.pop();
        current = previous.iterator;
        currentState = previous.state;
        currentState.suspended = false;
        input = error;
        throwNext = true;
        continue;
      }
      if (step.value?.signal === resumeSignal) {
        currentState.suspended = true;
        pending.push({iterator: current, state: currentState});
        current = iterator;
        currentState = null;
        input = step.value.value;
        continue;
      }
      if (currentState !== null) {
        currentState.suspended = true;
        try { input = yield step.value; }
        catch (error) { input = error; throwNext = true; }
        finally { currentState.suspended = false; }
        continue;
      }
      const request = step.value;
      const owner = slotOwner(handler, request.effect);
      if (owner === null) {
        try { input = yield request; }
        catch (error) { input = error; throwNext = true; }
        continue;
      }
      const selected = Reflect.get(owner, request.effect, handler);
      if (typeof selected !== "function" || !effectBlocks.has(selected))
        throw new TossRuntimeError("Handler case must be a synchronous Block.", request.location);
      const state = {active: true, suspended: false, used: false, boundary: context.boundary ?? effectBoundary, request};
      const resume = markEffectBlock(function*(value) {
        if (!state.active || state.suspended || state.used || state.boundary !== effectBoundary) throw new TossRuntimeError("Invalid resume.", request.location);
        state.used = true;
        return yield {signal: resumeSignal, value};
      });
      effectResumeStates.set(resume, state);
      current = effectInvoke(selected, [request.payload, resume], {
        ...context, methodReceiver: {kind: "tossInvocation", context: {receiver: handler, key: request.effect, owner}}
      });
      currentState = state;
    }
  } catch (error) { failed = true; primary = error; throw error; }
  finally {
    let cleanupFailed = false;
    let cleanupPrimary;
    function close(target, propagateFailure = false) {
      try {
        const result = failed && propagateFailure ? target.throw(primary) : target.return();
        if (!result.done) throw new TossRuntimeError("Cleanup suspended.", context.location);
      } catch (error) {
        if (failed && error !== primary) recordCleanupFailure(primary, error);
        else if (failed) return;
        else if (cleanupFailed) recordCleanupFailure(cleanupPrimary, error);
        else { cleanupFailed = true; cleanupPrimary = error; }
      }
    }
    if (currentState !== null) { currentState.active = false; close(current); }
    while (pending.length > 0) { const frame = pending.pop(); frame.state.active = false; close(frame.iterator); }
    if (!done) close(iterator, true);
    if (cleanupFailed) throw cleanupPrimary;
  }
}
function* effectParent(args, context, scope) {
  const method = scope.superContext;
  if (method === undefined) throw new TossRuntimeError("%super requires a method invocation context.", context.location);
  const owner = slotOwner(Object.getPrototypeOf(method.owner), method.key);
  if (owner === null) {
    const safe = new Set(["clone", "at:", "at:put:"]);
    if (typeof method.key === "string" && objectMessages.has(method.key) && !safe.has(method.key))
      throw new TossRuntimeError("Unsupported parent Prelude message in experimental effects compiler.", context.location);
    return parentSend(args, context, scope);
  }
  const block = Reflect.get(owner, method.key, method.receiver);
  if (typeof block !== "function" || effectNativeSymbols.has(block)) return invokeSlot(method.receiver, method.key, owner, args, context);
  if (!effectBlocks.has(block)) throw new TossRuntimeError("Unsupported native parent method in experimental effects compiler.", context.location);
  return yield* effectInvoke(block, args, {...context, methodReceiver: {kind: "tossInvocation", context: {receiver: method.receiver, key: method.key, owner}}});
}
function* effectPipeline(input, receiver, message, context) {
  return yield* effectSend(receiver, {name: message.name, arguments: [...message.arguments, input]}, context);
}
function* effectSend(receiver, message, context) {
  const {name, arguments: args} = message;
  if (receiver === effectRoot && name === "raise:with:") {
    if (typeof args[0] !== "symbol") throw new TossRuntimeError("Effect identity must be a Symbol.", context.location);
    if (effectCleanupDepth > 0) throw new TossRuntimeError("Effects are not allowed during cleanup.", context.location);
    return yield {effect: args[0], payload: args[1], location: context.location};
  }
  if (typeof receiver === "function" && name === "asJSCallback") return effectJavaScriptCallback(receiver, context);
  if (typeof receiver === "function" && name === "ensure:") return yield* effectEnsure(receiver, args[0], context);
  if (typeof receiver === "function" && name === "handleWith:") return yield* effectHandle(receiver, args[0], context);
  if (typeof receiver === "function" && /^(?:value|(?:value:)+)$/.test(name)) {
    const state = effectResumeStates.get(receiver);
    if (state !== undefined && (!state.active || state.suspended || state.used || state.boundary !== (context.boundary ?? effectBoundary)))
      throw new TossRuntimeError("Invalid resume.", context.location);
    return yield* effectInvoke(receiver, args, context);
  }
  if (typeof receiver === "boolean" && (name === "ifTrue:" || name === "ifFalse:" || name === "ifTrue:ifFalse:")) {
    const first = blockArgument(args[0], context);
    if (name === "ifTrue:ifFalse:") {
      const second = blockArgument(args[1], context);
      return yield* effectInvoke(receiver ? first : second, [], context);
    }
    const selected = name === "ifTrue:" ? receiver : !receiver;
    return selected ? yield* effectInvoke(first, [], context) : null;
  }
  if (typeof receiver === "number" && name === "times:") {
    if (!Number.isSafeInteger(receiver) || receiver < 0) throw new TossRuntimeError("Nonnegative safe integer required.", context.location);
    const block = blockArgument(args[0], context);
    let result = null;
    for (let index = 0; index < receiver; index++) result = yield* effectInvoke(block, [], context);
    return result;
  }
  if (Array.isArray(receiver) && name === "filter:") {
    const block = blockArgument(args[0], context);
    const result = [];
    for (const value of receiver.slice()) {
      const accepted = yield* effectInvoke(block, [value], context);
      if (typeof accepted !== "boolean") throw new TossRuntimeError("Boolean result required.", context.location);
      if (accepted) result.push(value);
    }
    return result;
  }
  if (Array.isArray(receiver) && name === "reduce:with:") {
    const block = blockArgument(args[1], context);
    let result = args[0];
    for (const value of receiver.slice()) result = yield* effectInvoke(block, [result, value], context);
    return result;
  }
  if (Array.isArray(receiver) && name === "map:") {
    const block = blockArgument(args[0], context);
    const result = [];
    for (const value of receiver.slice()) result.push(yield* effectInvoke(block, [value], context));
    return result;
  }
  if (receiver !== null && typeof receiver === "object" && !Array.isArray(receiver) && !isJavaScriptReference(receiver)) {
    const owner = slotOwner(receiver, name);
    if (owner !== null) {
      const block = Reflect.get(owner, name, receiver);
      if (typeof block === "function" && effectBlocks.has(block))
        return yield* effectInvoke(block, args, {...context, methodReceiver: {kind: "tossInvocation", context: {receiver, key: name, owner}}});
      if (typeof block !== "function" || effectNativeSymbols.has(block)) return send(receiver, message, context);
      throw new TossRuntimeError("Unsupported native method in experimental effects compiler.", context.location);
    }
    if (name === "perform:" || name === "perform:withArguments:") {
      const key = args[0];
      if (typeof key !== "string" && typeof key !== "symbol")
        throw new TossRuntimeError("Object key must be a string or symbol.", context.location);
      let argumentsList = [];
      if (name === "perform:withArguments:") {
        if (!Array.isArray(args[1])) throw new TossRuntimeError("Arguments must be an Array.", context.location);
        argumentsList = args[1].slice();
      }
      if (typeof key === "string" && !Reflect.has(receiver, key) && objectMessages.has(key)) {
        const expected = [...key].filter((character) => character === ":").length;
        if (name === "perform:" && expected > 0)
          throw new TossRuntimeError("Message " + keyDescription(key) + " requires arguments.", context.location);
        if (name === "perform:withArguments:" && argumentsList.length !== expected)
          throw new TossRuntimeError("Message " + keyDescription(key) + " expects " + expected + " argument(s), received " + argumentsList.length + ".", context.location);
      }
      return yield* effectSend(receiver, {name: key, arguments: argumentsList}, context);
    }
  }
  if (typeof name === "symbol") return send(receiver, message, context);
  const allowed = new Set(["bind:", "clone", "at:", "at:put:", "add:", "subtract:", "multiplyBy:", "divideBy:", "remainder:", "negated", "equals:", "lessThan:", "greaterThan:", "lessThanOrEqual:", "greaterThanOrEqual:", "length", "print", "not"]);
  if (!allowed.has(name) || (name === "print" && typeof receiver === "object" && receiver !== null))
    throw new TossRuntimeError("Unsupported message in experimental effects compiler: " + name, context.location);
  return send(receiver, message, context);
}
function runEffectProgram(iterator, boundary) {
  const step = iterator.next();
  if (!step.done) {
    const reason = boundary === "JavaScript" ? "Effect cannot cross the JavaScript boundary: " : boundary === "Async" ? "Effect cannot cross the async boundary: " : "Unhandled effect ";
    const error = new TossRuntimeError(reason + keyDescription(step.value.effect) + ".", step.value.location);
    error.effect = step.value.effect;
    error.payload = step.value.payload;
    try { iterator.throw(error); }
    catch (cleanupError) { if (cleanupError !== error) recordCleanupFailure(error, cleanupError); }
    throw error;
  }
  return step.value;
}
function getEffectFailureDetails(error) {
  const cleanup = [];
  const seen = new Set([error]);
  function collect(failure) {
    cleanup.push(failure);
    if ((typeof failure !== "object" || failure === null) && typeof failure !== "function") return;
    if (seen.has(failure)) return;
    seen.add(failure);
    for (const nested of effectCleanupFailures.get(failure) ?? []) collect(nested);
  }
  if ((typeof error === "object" && error !== null) || typeof error === "function") {
    for (const failure of effectCleanupFailures.get(error) ?? []) collect(failure);
    return {error, cleanup, contexts: [...(effectHandlerContexts.get(error) ?? [])]};
  }
  return {error, cleanup, contexts: []};
}
function reportEffectFailures(error) {
  if ((typeof error !== "object" || error === null) && typeof error !== "function") return;
  const details = getEffectFailureDetails(error);
  if (details.cleanup.length === 0 && details.contexts.length === 0) return;
  const lines = details.contexts.map((request) => "\\n  while handling " + keyDescription(request.effect) + " at " + request.location.file + ":" + request.location.line + ":" + request.location.column);
  for (const failure of details.cleanup) {
    let description;
    try { description = failure instanceof Error ? failure.message : String(failure); }
    catch (_failure) { description = "<unavailable error>"; }
    lines.push("\\n  cleanup failure: " + description);
  }
  if (!effectOriginalErrorStacks.has(error)) {
    try { effectOriginalErrorStacks.set(error, error.stack); }
    catch (_failure) { return; }
  }
  setEffectErrorStack(error, effectOriginalErrorStacks.get(error) + lines.join(""));
}
`;
