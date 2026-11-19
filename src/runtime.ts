import { runtimeAsyncJavaScript } from "./runtime_async.ts";
import { runtimeJavaScriptAot } from "./runtime_javascript_aot.ts";
import { runtimeJavaScriptCallback } from "./runtime_javascript_callback.ts";
import { effectDiagnosticRuntime } from "./effect_diagnostics.ts";
import { runtimeAsyncInvocation } from "./runtime_async_invocation.ts";
import { runtimeAsyncOwnership } from "./runtime_async_ownership.ts";

export function runtimeJavaScript(
  outputHook?: string,
  includeDiagnostics = false,
  includeOwnedTasks = false,
): string {
  const outputCall = outputHook === undefined
    ? "console.log(text);"
    : outputHook + "(text, context.location);";
  return `class TossRuntimeError extends Error {
  constructor(reason, location, options) {
    super(location.file + ":" + location.line + ":" + location.column +
      ": RuntimeError: " + reason + formatMacroTrace(location.trace));
    this.name = "TossRuntimeError";
    this.stack = this.name + ": " + this.message;
    if (options !== undefined) this.cause = options.cause;
  }
}

function formatMacroTrace(trace) {
  return (trace ?? []).map((entry) => "\\n  expanded " + entry.name +
    " at " + entry.invocation.file + ":" + entry.invocation.line + ":" +
    entry.invocation.column + " (defined at " + entry.definition.file + ":" +
    entry.definition.line + ":" + entry.definition.column + ")").join("");
}

const hostValues = new WeakMap();
const hostReferences = new WeakMap();
const javascriptCallbacks = new WeakMap();
const javascriptReferenceMessages = new Map([
  ["toString", function() { return "<js>"; }],
  ["inspect", function() { return "<js>"; }],
  ["print", function(receiver, context) { return writeOutput(receiver, "toString", context); }],
  ["dump", function(receiver, context) { return writeOutput(receiver, "inspect", context); }],
]);
${runtimeAsyncJavaScript(includeOwnedTasks)}
${runtimeJavaScriptCallback(includeDiagnostics, includeOwnedTasks)}
${runtimeJavaScriptAot}
${
    includeOwnedTasks
      ? runtimeAsyncOwnership(
        includeDiagnostics ? "effectDiagnosticHost" : "undefined",
        true,
      ) + runtimeAsyncInvocation
      : ""
  }
${
    includeDiagnostics || includeOwnedTasks
      ? `
function withEffectBoundary(body) { return body(); }
${includeDiagnostics ? effectDiagnosticRuntime : ""}
const noEffectDescriptions = Object.freeze([]);
function reportHostFailure(error, boundary) {
  ${
        includeOwnedTasks
          ? "const exposed = effectFailureValue(error);"
          : "const exposed = error;"
      }
  ${
        includeDiagnostics
          ? `
  if (onEffectFailure !== undefined) {
    notifyEffectFailure(Object.freeze({
      boundary, error: exposed, cleanupDescriptions: ${
            includeOwnedTasks
              ? "ownedCleanupDescriptions(error)"
              : "noEffectDescriptions"
          },
      handlerDescriptions: noEffectDescriptions,
    }));
  }
  `
          : ""
      }
  return exposed;
}
`
      : ""
  }

function isJavaScriptReference(value) { return hostValues.has(value) || asyncResults.has(value); }

function fromJavaScript(value, context) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    const previous = hostReferences.get(value);
    if (previous !== undefined) return previous;
    const reference = Object.freeze(Object.create(null));
    hostValues.set(reference, value);
    hostReferences.set(value, reference);
    return reference;
  }
  throw new TossRuntimeError("Unsupported JavaScript result type " + typeof value + ".", context.location);
}

function toJavaScript(value, context) {
  const entry = asyncResults.get(value);
  if (entry !== undefined) {
    ${
    includeOwnedTasks
      ? `// The observation slot holds true for an internal wait or the public Promise.
    const previous = entry.observation;
    if (previous !== undefined && previous !== true) return previous;
    entry.observation = true;`
      : `const previous = hostValues.get(value);
    if (previous !== undefined) return previous;`
  }
    const promise = (${
    includeOwnedTasks ? "entry.promise" : "entry"
  }).then((result) => {
      ${
    includeDiagnostics
      ? "try { return toJavaScript(result.value, context); } catch (error) { throw reportHostFailure(error, 'promise'); }"
      : "return toJavaScript(result.value, context);"
  }
    }${
    includeOwnedTasks
      ? ", (error) => { throw exposeOwnedAsyncFailure(entry, error, 'promise'); }"
      : includeDiagnostics
      ? ", (error) => { throw reportHostFailure(error, 'promise'); }"
      : ""
  });
    ${
    includeOwnedTasks
      ? "entry.observation = promise;"
      : "hostValues.set(value, promise);"
  }
    hostReferences.set(promise, value);
    return promise;
  }
  if (isJavaScriptReference(value)) return hostValues.get(value);
  if (typeof value === "function") throw new TossRuntimeError("Toss Blocks cannot be passed directly to JavaScript.", context.location);
  if (typeof value === "bigint") throw new TossRuntimeError("Unsupported Toss value for JavaScript.", context.location);
  if (typeof value === "number" && !Number.isFinite(value)) throw new TossRuntimeError("Unsupported Toss value for JavaScript.", context.location);
  return value;
}

const activeArrayInspections = new Set();

function inspectArray(receiver, context) {
  if (activeArrayInspections.has(receiver)) return "[...]";
  activeArrayInspections.add(receiver);
  try {
    const values = receiver.slice();
    return "[" + values.map((value) => {
      const inspected = send(value, {name: "inspect", arguments: []}, context);
      if (typeof inspected !== "string") {
        throw new TossRuntimeError("inspect must return a string.", context.location);
      }
      return inspected;
    }).join(", ") + "]";
  } finally {
    activeArrayInspections.delete(receiver);
  }
}

function slotOwner(receiver, key) {
  let owner = receiver;
  while (owner !== null && !Object.hasOwn(owner, key)) owner = Object.getPrototypeOf(owner);
  return owner;
}

function invokeSlot(receiver, key, owner, args, context) {
  const slot = Reflect.get(owner, key, receiver);
  if (typeof slot === "function") {
    return invokeBlock(slot, args, {
      ...context,
      methodReceiver: {kind: "tossInvocation", context: {receiver, key, owner}},
    });
  }
  if (args.length === 0) return slot;
  throw new TossRuntimeError("Object slot " + keyDescription(key) + " is not callable.", context.location);
}

function send(receiver, message, context) {
  ${
    includeOwnedTasks
      ? `
  if (receiver === ownedEffectRoot) {
    switch (message.name) {
      case "spawn:": return spawnOwnedEffectTask(message.arguments[0], context);
      case "onCancel:": return registerEffectCancellationCleanup(message.arguments[0], context);
      case "hostOperation:": return startOwnedHostOperation(message.arguments[0], context);
      case "hostOperation:abortWaitMs:": return startOwnedHostOperation(message.arguments[0], context, message.arguments[1]);
    }
  }
  if (message.name === "cancel:" && asyncResults.has(receiver)) {
    return cancelEffectAsyncTask(receiver, message.arguments[0], context);
  }
  `
      : ""
  }
  if (isJavaScriptReference(receiver)) {
    const implementation = javascriptReferenceMessages.get(message.name);
    if (implementation === undefined) throw new TossRuntimeError("Unknown message " + keyDescription(message.name) + " for JS reference.", context.location);
    if (message.arguments.length !== 0) throw new TossRuntimeError("JS reference message does not accept arguments.", context.location);
    return implementation(receiver, context);
  }
  const type = Array.isArray(receiver) ? "Array" : receiver === null ? "Nil" : typeof receiver === "boolean" ? "Boolean" : typeof receiver === "number" ? "Number" : typeof receiver === "symbol" ? "Symbol" : typeof receiver === "function" ? "Block" : typeof receiver === "object" ? "Object" : typeof receiver === "string" ? "String" : "Unsupported";
  const messages = type === "Array" ? arrayMessages : type === "Nil" ? nilMessages : type === "Boolean" ? booleanMessages : type === "Number" ? numberMessages : type === "Symbol" ? symbolMessages : type === "Block" ? blockMessages : type === "Object" ? objectMessages : type === "String" ? stringMessages : new Map();
  const key = message.name;
  const owner = type === "Object" ? slotOwner(receiver, key) : null;
  if (owner !== null) {
    return invokeSlot(receiver, key, owner, message.arguments, context);
  }
  const implementation = typeof key === "string" ? messages.get(key) ??
    (type === "Block" && blockKeywordSelector.test(key) ? blockKeywordMessage : undefined) : undefined;
  if (implementation === undefined) {
    throw new TossRuntimeError("Unknown message " + keyDescription(key) + " for " + type + ".", context.location);
  }
  return implementation(receiver, context, ...message.arguments);
}

function pipelineSend(input) {
  return (receiver, message, context) =>
    send(receiver, {name: message.name, arguments: [...message.arguments, input]}, context);
}

function parentSend(args, context, scope) {
  const method = scope.superContext;
  if (method === undefined) throw new TossRuntimeError("%super requires a method invocation context.", context.location);
  const owner = Object.getPrototypeOf(method.owner);
  const parentOwner = slotOwner(owner, method.key);
  if (parentOwner !== null) {
    return invokeSlot(method.receiver, method.key, parentOwner, args, context);
  }
  const implementation = typeof method.key === "string" ? objectMessages.get(method.key) : undefined;
  if (implementation === undefined) throw new TossRuntimeError("Unknown parent message " + keyDescription(method.key) + ".", context.location);
  const expected = (method.key.match(/:/g) ?? []).length;
  if (args.length !== expected) throw new TossRuntimeError("Message " + keyDescription(method.key) + " expects " + expected + " argument(s), received " + args.length + ".", context.location);
  return implementation(method.receiver, context, ...args);
}

function numberArgument(value, context) {
  if (typeof value !== "number") throw new TossRuntimeError("Number argument required.", context.location);
  return value;
}

function arrayIndex(receiver, index, context) {
  if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) {
    throw new TossRuntimeError("Array index must be a nonnegative safe integer.", context.location);
  }
  if (index >= receiver.length) {
    throw new TossRuntimeError("Array index is out of bounds.", context.location);
  }
}

function blockArgument(value, context) {
  if (typeof value !== "function") throw new TossRuntimeError("Block argument required.", context.location);
  return value;
}

function finiteNumber(value, context) {
  if (!Number.isFinite(value)) throw new TossRuntimeError("Number result must be finite.", context.location);
  return value;
}

function keyDescription(key) {
  if (typeof key !== "symbol") return JSON.stringify(key);
  const name = Symbol.keyFor(key);
  return name === undefined ? "#<unique>" : "#" + name;
}

function fetchBinding(name, context) {
  const key = Symbol.for(name);
  let scope = lexicalEnvironment(context.environment, context.location);
  while (scope !== null) {
    if (scope.bindings.has(key)) return scope.bindings.get(key);
    scope = scope.parent;
  }
  throw new TossRuntimeError("Unbound name " + JSON.stringify(name) + ".", context.location);
}

function lexicalEnvironment(carrier, location) {
  const id = location.scope?.id ?? 0;
  const existing = carrier.scopes.get(id);
  if (existing !== undefined) return existing;
  const root = carrier.root ?? carrier;
  const selected = {bindings: new Map(), parent: root, root, scopes: carrier.scopes,
    superContext: carrier.superContext};
  carrier.scopes.set(id, selected);
  return selected;
}

function blockEnvironment(captured, location, parameters) {
  const scopes = new Map(captured.scopes);
  const root = captured.root ?? captured;
  const carrier = {root, scopes, superContext: captured.superContext};
  const blockId = location.scope?.id ?? 0;
  const parent = scopes.get(blockId) ?? lexicalEnvironment(captured, location);
  const local = {bindings: new Map(), parent, root, scopes,
    superContext: captured.superContext};
  scopes.set(blockId, local);
  for (const parameter of parameters) {
    const id = parameter.scope?.id ?? 0;
    if (id === blockId) continue;
    const previous = scopes.get(id) ?? lexicalEnvironment(captured, parameter);
    const parameterScope = {bindings: new Map(), parent: previous, root, scopes,
      superContext: captured.superContext};
    scopes.set(id, parameterScope);
  }
  return carrier;
}

function discardValueSend(receiver, message, context) {
  ${
    includeOwnedTasks
      ? `
  if (asyncBlockFunctions.has(receiver)) {
    return invokeBlock(receiver, message.arguments, context, true);
  }
  `
      : ""
  }
  return send(receiver, message, context);
}

function invokeBlock(receiver, args, context, discardResult) {
  if (receiver.length !== args.length) {
    throw new TossRuntimeError("Block expects " + receiver.length + " argument(s), received " + args.length + ".", context.location);
  }
  ${
    includeOwnedTasks
      ? `
  if (asyncBlockFunctions.has(receiver)) return invokeOwnedAsyncBlock(receiver, args, context, discardResult);
  const task = taskForContext(context);
  const invocation = task === undefined ? context.methodReceiver : {...context.methodReceiver, asyncTask: task};
  return Reflect.apply(receiver, invocation, args);
  `
      : `
  const result = Reflect.apply(receiver, context.methodReceiver, args);
  return asyncBlockFunctions.has(receiver) ? asyncResult(result) : result;
  `
  }
}

function writeOutput(receiver, conversion, context) {
  const text = send(receiver, {name: conversion, arguments: []}, context);
  if (typeof text !== "string") {
    throw new TossRuntimeError(conversion + " must return a string.", context.location);
  }
  ${outputCall}
  return receiver;
}`;
}
