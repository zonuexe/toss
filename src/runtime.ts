export const runtimeJavaScript = `class TossRuntimeError extends Error {
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
const javascriptReferenceMessages = new Map([
  ["toString", function() { return "<js>"; }],
  ["inspect", function() { return "<js>"; }],
  ["print", function(receiver, context) { return writeOutput(receiver, "toString", context); }],
  ["dump", function(receiver, context) { return writeOutput(receiver, "inspect", context); }],
]);

function isJavaScriptReference(value) { return hostValues.has(value); }

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
  if (isJavaScriptReference(value)) return hostValues.get(value);
  if (typeof value === "function") throw new TossRuntimeError("Toss Blocks cannot be passed directly to JavaScript.", context.location);
  if (typeof value === "bigint") throw new TossRuntimeError("Unsupported Toss value for JavaScript.", context.location);
  if (typeof value === "number" && !Number.isFinite(value)) throw new TossRuntimeError("Unsupported Toss value for JavaScript.", context.location);
  return value;
}

function evaluateJavaScript(source, values, context, names) {
  const nativeValues = values.map((value) => toJavaScript(value, context));
  let result;
  try {
    let privateName = "__tossJsValues";
    while (source.includes(privateName) || names.includes(privateName)) privateName += "_";
    const declarations = names.map((name, index) => "const " + name + " = " + privateName + "[" + index + "];").join("\\n");
    const evaluator = Function(
      privateName,
      "\\\"use strict\\\";\\n" + declarations +
        "\\nreturn (function(){\\\"use strict\\\"; return (" + source +"); }).call(void 0);",
    );
    result = Reflect.apply(evaluator, undefined, [nativeValues]);
  } catch (error) {
    throw new TossRuntimeError("JavaScript expression threw.", context.location, {cause: error});
  }
  return fromJavaScript(result, context);
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
  const carrier = {bindings: new Map(), parent: captured, root, scopes,
    superContext: captured.superContext};
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
  return {carrier, local, scopes};
}

function invokeBlock(receiver, args, context) {
  if (receiver.length !== args.length) {
    throw new TossRuntimeError("Block expects " + receiver.length + " argument(s), received " + args.length + ".", context.location);
  }
  return Reflect.apply(receiver, context.methodReceiver, args);
}

function writeOutput(receiver, conversion, context) {
  const text = send(receiver, {name: conversion, arguments: []}, context);
  if (typeof text !== "string") {
    throw new TossRuntimeError(conversion + " must return a string.", context.location);
  }
  console.log(text);
  return receiver;
}`;
