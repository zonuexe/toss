// Experimental runtime source; not the production Toss runtime.
export const experimentalEffectRuntime = `
const effectBlocks = new WeakSet();
const effectNativeSymbols = new WeakSet();
function registerEffectSymbolRoot(root) { effectNativeSymbols.add(Reflect.get(root, "generateUnique")); }
const effectResumeStates = new WeakMap();
const effectCleanupFailures = new WeakMap();
const effectHandlerContexts = new WeakMap();
let effectCleanupDepth = 0;
const effectRoot = Object.freeze(Object.create(null));
function markEffectBlock(block) { effectBlocks.add(block); return block; }
function* effectInvoke(block, args, context) {
  const result = invokeBlock(block, args, context);
  return effectBlocks.has(block) ? yield* result : result;
}
function recordCleanupFailure(primary, secondary) {
  if (!(primary instanceof Error)) throw secondary;
  const failures = effectCleanupFailures.get(primary) ?? [];
  failures.push(secondary);
  effectCleanupFailures.set(primary, failures);
}
function recordHandlerContext(error, request) {
  if (!(error instanceof Error)) return;
  const contexts = effectHandlerContexts.get(error) ?? [];
  if (!contexts.includes(request)) contexts.push(request);
  effectHandlerContexts.set(error, contexts);
}
function validateZeroArgumentBlock(value, context) {
  const block = blockArgument(value, context);
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
      const state = {active: true, suspended: false, used: false, request};
      const resume = markEffectBlock(function*(value) {
        if (!state.active || state.suspended || state.used) throw new TossRuntimeError("Invalid resume.", request.location);
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
  if (typeof receiver === "function" && name === "ensure:") return yield* effectEnsure(receiver, args[0], context);
  if (typeof receiver === "function" && name === "handleWith:") return yield* effectHandle(receiver, args[0], context);
  if (typeof receiver === "function" && /^(?:value|(?:value:)+)$/.test(name)) {
    const state = effectResumeStates.get(receiver);
    if (state !== undefined && (!state.active || state.suspended || state.used))
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
function runEffectProgram(iterator) {
  const step = iterator.next();
  if (!step.done) {
    const error = new TossRuntimeError("Unhandled effect " + keyDescription(step.value.effect) + ".", step.value.location);
    error.effect = step.value.effect;
    error.payload = step.value.payload;
    try { iterator.throw(error); }
    catch (cleanupError) { if (cleanupError !== error) recordCleanupFailure(error, cleanupError); }
    throw error;
  }
  return step.value;
}
function reportEffectFailures(error) {
  if (!(error instanceof Error)) return;
  const failures = effectCleanupFailures.get(error) ?? [];
  const contexts = effectHandlerContexts.get(error) ?? [];
  if (failures.length === 0 && contexts.length === 0) return;
  const lines = contexts.map((request) => "\\n  while handling " + keyDescription(request.effect) + " at " + request.location.file + ":" + request.location.line + ":" + request.location.column);
  const seen = new Set([error]);
  function collect(failure) {
    lines.push("\\n  cleanup failure: " + (failure instanceof Error ? failure.message : String(failure)));
    if (!(failure instanceof Error) || seen.has(failure)) return;
    seen.add(failure);
    for (const nested of effectCleanupFailures.get(failure) ?? []) collect(nested);
  }
  for (const failure of failures) collect(failure);
  error.stack += lines.join("");
}
`;
