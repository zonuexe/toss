// Experimental runtime source; not the production Toss runtime.
import { effectDiagnosticRuntime } from "../src/effect_diagnostics.ts";
import { effectAsyncCancellationRuntime } from "./effects-async-cancellation.ts";

export type ExperimentalRuntimeOptions = {
  readonly sharedDispatchTables?: boolean;
  readonly directBoundarySteps?: boolean;
  readonly sharedBoundaryDelegate?: boolean;
  readonly outputHook?: string;
  readonly failureCarriers?: boolean;
  readonly asyncCancellation?: boolean;
};

export function experimentalEffectRuntime(
  options: ExperimentalRuntimeOptions = {},
): string {
  const {
    sharedDispatchTables = false,
    directBoundarySteps = false,
    sharedBoundaryDelegate = false,
    outputHook,
    failureCarriers = false,
    asyncCancellation = false,
  } = options;
  if (asyncCancellation && !failureCarriers) {
    throw new TypeError("Async cancellation requires failure carriers.");
  }
  const allowedMessages =
    `const effectAllowedMessages = new Set(["bind:", "clone", "at:", "at:put:", "add:", "subtract:", "multiplyBy:", "divideBy:", "remainder:", "negated", "equals:", "lessThan:", "greaterThan:", "lessThanOrEqual:", "greaterThanOrEqual:", "length", "toString", "inspect", "not"]);`;
  return `
${effectDiagnosticRuntime}
const effectBlocks = new WeakSet();
${sharedDispatchTables ? allowedMessages : ""}
const effectJavaScriptCallbacks = new WeakMap();
let effectBoundary = Object.freeze({});
function getEffectBoundary() { return effectBoundary; }
${asyncCancellation ? effectAsyncCancellationRuntime : ""}
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
    }); } catch (error) { throw exposeEffectFailure(error, "callback"); }
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
const effectCarrierSet = new WeakSet();
const useEffectCarriers = ${failureCarriers};
function isEffectCarrier(value) {
  return ((typeof value === "object" && value !== null) || typeof value === "function") && effectCarrierSet.has(value);
}
function asEffectFailure(value) {
  if (!useEffectCarriers || isEffectCarrier(value)) return value;
  const carrier = {value, cleanup: [], contexts: []};
  effectCarrierSet.add(carrier);
  return carrier;
}
function effectFailureValue(value) { return isEffectCarrier(value) ? value.value : value; }
function throwAsyncEffectFailure(error) {
  const failure = asEffectFailure(error);
  if (!useEffectCarriers) reportEffectFailures(failure);
  throw failure;
}
const effectBaseToJavaScript = toJavaScript;
const effectAsyncPublicResults = new WeakMap();
const effectBaseAsyncResult = asyncResult;
const effectBaseAwaitToss = awaitToss;
if (useEffectCarriers) asyncResult = function(promise) {
  const value = effectBaseAsyncResult(promise);
  const state = {observed: false, notified: false, publicResult: undefined};
  const publicResult = promise.then(
    (result) => result,
    (error) => {
      if (state.observed) return;
      throw exposeAsyncEffectFailure(state, error, "unobserved-async");
    },
  );
  state.publicResult = publicResult;
  effectAsyncPublicResults.set(value, state);
  return value;
};
function observeEffectAsyncResult(value) {
  const state = effectAsyncPublicResults.get(value);
  if (state === undefined) return;
  state.observed = true;
  state.publicResult.catch(() => {});
}
if (useEffectCarriers) awaitToss = function(value, context) {
  observeEffectAsyncResult(value);
  return effectBaseAwaitToss(value, context);
};
if (useEffectCarriers) toJavaScript = function(value, context) {
  if (!asyncResults.has(value)) return effectBaseToJavaScript(value, context);
  const previous = asyncHostPromises.get(value);
  if (previous !== undefined) return previous;
  observeEffectAsyncResult(value);
  const promise = asyncResults.get(value).then(
    (result) => toJavaScript(result.value, context),
    (error) => { throw exposeAsyncEffectFailure(effectAsyncPublicResults.get(value), error, "promise"); },
  );
  asyncHostPromises.set(value, promise);
  hostValues.set(value, promise);
  hostReferences.set(promise, value);
  return promise;
};
function copyEffectFailure(value) {
  if (!isEffectCarrier(value)) return value;
  const copy = asEffectFailure(value.value);
  copy.cleanup = value.cleanup.map(copyEffectFailure);
  copy.contexts = [...value.contexts];
  return copy;
}
let effectCleanupDepth = 0;
const effectRoot = Object.freeze(Object.create(null));
function markEffectBlock(block) { effectBlocks.add(block); return block; }
${
    sharedBoundaryDelegate
      ? `class EffectBoundaryDelegate {
  constructor(iterator, boundary) { this.iterator = iterator; this.boundary = boundary; }
  [Symbol.iterator]() { return this; }
  next(value) {
    const previous = effectBoundary; effectBoundary = this.boundary;
    try { return this.iterator.next(value); } finally { effectBoundary = previous; }
  }
  throw(error) {
    const previous = effectBoundary; effectBoundary = this.boundary;
    try { return this.iterator.throw(error); } finally { effectBoundary = previous; }
  }
  return(value) {
    const previous = effectBoundary; effectBoundary = this.boundary;
    try { return this.iterator.return(value); } finally { effectBoundary = previous; }
  }
}`
      : ""
  }
${
    directBoundarySteps
      ? `function effectIteratorStep(boundary, iterator, method, value) {
  const previous = effectBoundary;
  effectBoundary = boundary;
  try { return iterator[method](value); } finally { effectBoundary = previous; }
}`
      : ""
  }
function* effectInvoke(block, args, context) {
  ${failureCarriers ? "try {" : ""}
  const boundary = context.boundary ?? effectBoundary;
  const methodReceiver = context.methodReceiver === undefined
    ? {kind: "effectInvocation", effectBoundary: boundary}
    : {...context.methodReceiver, effectBoundary: boundary};
  ${
    asyncCancellation
      ? "const task = asyncBlockFunctions.has(block) ? createEffectAsyncTask() : undefined; if (task !== undefined) methodReceiver.effectAsyncTask = task;"
      : ""
  }
  const result = withEffectBoundaryValue(boundary, () => invokeBlock(block, args, {...context, methodReceiver}));
  ${
    asyncCancellation
      ? "if (task !== undefined) effectTasksByResult.set(result, task);"
      : ""
  }
  if (!effectBlocks.has(block)) return result;
  const delegate = ${
    sharedBoundaryDelegate ? "new EffectBoundaryDelegate(result, boundary)" : `{
    [Symbol.iterator]() { return this; },
    next(value) { return ${
      directBoundarySteps
        ? 'effectIteratorStep(boundary, result, "next", value)'
        : "withEffectBoundaryValue(boundary, () => result.next(value))"
    }; },
    throw(error) { return ${
      directBoundarySteps
        ? 'effectIteratorStep(boundary, result, "throw", error)'
        : "withEffectBoundaryValue(boundary, () => result.throw(error))"
    }; },
    return(value) { return ${
      directBoundarySteps
        ? 'effectIteratorStep(boundary, result, "return", value)'
        : "withEffectBoundaryValue(boundary, () => result.return(value))"
    }; },
  }`
  };
  return yield* delegate;
  ${failureCarriers ? "} catch (error) { throw asEffectFailure(error); }" : ""}
}
function recordCleanupFailure(primary, secondary) {
  if (isEffectCarrier(primary)) {
    primary.cleanup.push(copyEffectFailure(asEffectFailure(secondary)));
    return;
  }
  if (!(primary instanceof Error)) throw secondary;
  const failures = effectCleanupFailures.get(primary) ?? [];
  const object = (typeof secondary === "object" && secondary !== null) || typeof secondary === "function";
  const nested = object ? [...(effectCleanupFailures.get(secondary) ?? [])] : [];
  failures.push(Object.freeze({error: secondary, cleanup: Object.freeze(nested)}));
  effectCleanupFailures.set(primary, failures);
}
function setEffectErrorStack(error, value) {
  try { return Reflect.set(error, "stack", value); }
  catch (_failure) { return false; }
}
function snapshotEffectFailure(error) {
  if (isEffectCarrier(error)) return {cleanup: error.cleanup.map(copyEffectFailure), contexts: [...error.contexts]};
  if (!(error instanceof Error)) return undefined;
  return {
    cleanup: [...(effectCleanupFailures.get(error) ?? [])],
    contexts: [...(effectHandlerContexts.get(error) ?? [])],
  };
}
function restoreEffectFailure(error, snapshot) {
  if (isEffectCarrier(error)) {
    error.cleanup = snapshot === undefined ? [] : snapshot.cleanup.map(copyEffectFailure);
    error.contexts = snapshot === undefined ? [] : [...snapshot.contexts];
    return;
  }
  if (!(error instanceof Error)) return;
  if (snapshot === undefined || snapshot.cleanup.length === 0) effectCleanupFailures.delete(error);
  else effectCleanupFailures.set(error, [...snapshot.cleanup]);
  if (snapshot === undefined || snapshot.contexts.length === 0) effectHandlerContexts.delete(error);
  else effectHandlerContexts.set(error, [...snapshot.contexts]);
  if (effectOriginalErrorStacks.has(error)) setEffectErrorStack(error, effectOriginalErrorStacks.get(error));
}
function recordHandlerContext(error, request) {
  if (isEffectCarrier(error)) { if (!error.contexts.includes(request)) error.contexts.push(request); return; }
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
  catch (error) { failed = true; primary = asEffectFailure(error); throw primary; }
  finally {
    const savedFailure = failed ? snapshotEffectFailure(primary) : undefined;
    let cleanupFailed = false;
    let cleanupError;
    effectCleanupDepth++;
    try { yield* effectInvoke(finalizer, [], context); }
    catch (error) { cleanupFailed = true; cleanupError = asEffectFailure(error); }
    finally { effectCleanupDepth--; }
    if (failed) {
      restoreEffectFailure(primary, savedFailure);
      if (cleanupFailed) recordCleanupFailure(primary, cleanupError);
    } else if (cleanupFailed) throw cleanupError;
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
        error = asEffectFailure(error);
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
  } catch (error) { failed = true; primary = asEffectFailure(error); throw primary; }
  finally {
    let cleanupFailed = false;
    let cleanupPrimary;
    function close(target, propagateFailure = false) {
      try {
        const result = failed && propagateFailure ? target.throw(primary) : target.return();
        if (!result.done) throw new TossRuntimeError("Cleanup suspended.", context.location);
      } catch (error) {
        error = asEffectFailure(error);
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
function* effectInspectArray(receiver, context) {
  if (activeArrayInspections.has(receiver)) return "[...]";
  activeArrayInspections.add(receiver);
  try {
    const values = receiver.slice();
    const parts = [];
    for (const value of values) {
      const inspected = yield* effectSend(value, {name: "inspect", arguments: []}, context);
      if (typeof inspected !== "string") throw new TossRuntimeError("inspect must return a string.", context.location);
      parts.push(inspected);
    }
    return "[" + parts.join(", ") + "]";
  } finally { activeArrayInspections.delete(receiver); }
}
function* effectSend(receiver, message, context) {
  const {name, arguments: args} = message;
  ${
    asyncCancellation
      ? `
  if (receiver === effectRoot && name === "onCancel:") return registerEffectCancellationCleanup(args[0], context);
  if (asyncResults.has(receiver) && name === "cancel:") return cancelEffectAsyncTask(receiver, args[0], context);
  `
      : ""
  }
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
  if (Array.isArray(receiver) && (name === "inspect" || name === "toString"))
    return yield* effectInspectArray(receiver, context);
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
  if (name === "print" || name === "dump") {
    const conversion = name === "print" ? "toString" : "inspect";
    const text = yield* effectSend(receiver, {name: conversion, arguments: []}, context);
    if (typeof text !== "string") throw new TossRuntimeError(conversion + " must return a string.", context.location);
    ${
    outputHook === undefined
      ? "console.log(text);"
      : `${outputHook}(text, context.location);`
  }
    return receiver;
  }
  ${sharedDispatchTables ? "" : allowedMessages}
  if (!effectAllowedMessages.has(name))
    throw new TossRuntimeError("Unsupported message in experimental effects compiler: " + name, context.location);
  return send(receiver, message, context);
}
function runEffectProgram(iterator, boundary) {
  let step;
  try { step = iterator.next(); } catch (error) { throw asEffectFailure(error); }
  if (!step.done) {
    const reason = boundary === "JavaScript" ? "Effect cannot cross the JavaScript boundary: " : boundary === "Async" ? "Effect cannot cross the async boundary: " : "Unhandled effect ";
    const error = new TossRuntimeError(reason + keyDescription(step.value.effect) + ".", step.value.location);
    error.effect = step.value.effect;
    error.payload = step.value.payload;
    const failure = asEffectFailure(error);
    try { iterator.throw(failure); }
    catch (cleanupError) { if (cleanupError !== failure) recordCleanupFailure(failure, cleanupError); }
    throw failure;
  }
  return step.value;
}
function getEffectFailureDetails(error) {
  const cleanup = [];
  const active = new Set();
  function collect(record) {
    cleanup.push(isEffectCarrier(record) ? record.value : record.error);
    if (active.has(record)) return;
    active.add(record);
    for (const nested of record.cleanup) collect(nested);
    active.delete(record);
  }
  const carrier = isEffectCarrier(error);
  const hasMetadata = (typeof error === "object" && error !== null) || typeof error === "function";
  const records = carrier ? error.cleanup : hasMetadata ? (effectCleanupFailures.get(error) ?? []) : [];
  for (const failure of records) collect(failure);
  const contexts = carrier ? [...error.contexts] : hasMetadata ? [...(effectHandlerContexts.get(error) ?? [])] : [];
  const cleanupDescriptions = cleanup.map((failure) => {
    try { return String(failure instanceof Error ? failure.message : failure); }
    catch (_failure) { return "<unavailable error>"; }
  });
  const handlerDescriptions = contexts.map((request) =>
    "while handling " + keyDescription(request.effect) + " at " + request.location.file + ":" + request.location.line + ":" + request.location.column);
  return Object.freeze({error: effectFailureValue(error), cleanup: Object.freeze(cleanup), contexts: Object.freeze(contexts), cleanupDescriptions: Object.freeze(cleanupDescriptions), handlerDescriptions: Object.freeze(handlerDescriptions)});
}
function exposeAsyncEffectFailure(state, error, boundary) {
  if (typeof onEffectFailure === "function") {
    if (state.notified) return effectFailureValue(error);
    state.notified = true;
  }
  return exposeEffectFailure(error, boundary);
}
function exposeEffectFailure(error, boundary) {
  if (typeof onEffectFailure !== "function") {
    reportEffectFailures(error);
    return effectFailureValue(error);
  }
  const details = getEffectFailureDetails(error);
  const diagnostic = Object.freeze({
    boundary,
    error: details.error,
    cleanupDescriptions: details.cleanupDescriptions,
    handlerDescriptions: details.handlerDescriptions,
  });
  notifyEffectFailure(diagnostic);
  return details.error;
}
function reportEffectFailures(error) {
  const details = getEffectFailureDetails(error);
  error = details.error;
  if ((typeof error !== "object" || error === null) && typeof error !== "function") return;
  if (details.cleanup.length === 0 && details.contexts.length === 0) {
    if (useEffectCarriers && effectOriginalErrorStacks.has(error)) setEffectErrorStack(error, effectOriginalErrorStacks.get(error));
    return;
  }
  const lines = details.handlerDescriptions.map((description) => "\\n  " + description);
  for (const description of details.cleanupDescriptions) lines.push("\\n  cleanup failure: " + description);
  if (!effectOriginalErrorStacks.has(error)) {
    try { effectOriginalErrorStacks.set(error, error.stack); }
    catch (_failure) { return; }
  }
  setEffectErrorStack(error, effectOriginalErrorStacks.get(error) + lines.join(""));
}
`;
}
