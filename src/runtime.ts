export const runtimeJavaScript = `class TossRuntimeError extends Error {
  constructor(reason, location) {
    super(location.file + ":" + location.line + ":" + location.column +
      ": RuntimeError: " + reason);
    this.name = "TossRuntimeError";
    this.stack = this.name + ": " + this.message;
  }
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

function send(receiver, message, context) {
  const type = Array.isArray(receiver) ? "Array" : receiver === null ? "Nil" : typeof receiver === "boolean" ? "Boolean" : typeof receiver === "number" ? "Number" : typeof receiver === "symbol" ? "Symbol" : typeof receiver === "function" ? "Block" : typeof receiver === "object" ? "Object" : typeof receiver === "string" ? "String" : "Unsupported";
  const messages = type === "Array" ? arrayMessages : type === "Nil" ? nilMessages : type === "Boolean" ? booleanMessages : type === "Number" ? numberMessages : type === "Symbol" ? symbolMessages : type === "Block" ? blockMessages : type === "Object" ? objectMessages : type === "String" ? stringMessages : new Map();
  if (type === "Object" && Reflect.has(receiver, message.name)) {
    const slot = Reflect.get(receiver, message.name);
    if (typeof slot === "function") {
      return invokeBlock(slot, message.arguments, {
        ...context,
        methodReceiver: receiver,
      });
    }
    if (message.arguments.length === 0) return slot;
    throw new TossRuntimeError("Object slot " + JSON.stringify(message.name) + " is not callable.", context.location);
  }
  const implementation = messages.get(message.name) ??
    (type === "Block" && blockKeywordSelector.test(message.name) ? blockKeywordMessage : undefined);
  if (implementation === undefined) {
    throw new TossRuntimeError("Unknown message " + JSON.stringify(message.name) + " for " + type + ".", context.location);
  }
  return implementation(receiver, context, ...message.arguments);
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
  return typeof key === "symbol" ? "#" + Symbol.keyFor(key) : JSON.stringify(key);
}

function fetchBinding(name, context) {
  const key = Symbol.for(name);
  let scope = context.environment;
  while (scope !== null) {
    if (scope.bindings.has(key)) return scope.bindings.get(key);
    scope = scope.parent;
  }
  throw new TossRuntimeError("Unbound name " + JSON.stringify(name) + ".", context.location);
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
