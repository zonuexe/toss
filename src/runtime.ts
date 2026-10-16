export const runtimeJavaScript = `class TossRuntimeError extends Error {
  constructor(reason, location) {
    super(location.file + ":" + location.line + ":" + location.column +
      ": RuntimeError: " + reason);
    this.name = "TossRuntimeError";
    this.stack = this.name + ": " + this.message;
  }
}

function send(receiver, message, context) {
  const type = receiver === null ? "Nil" : typeof receiver === "symbol" ? "Symbol" : typeof receiver === "function" ? "Block" : typeof receiver === "object" ? "Object" : typeof receiver === "string" ? "String" : "Unsupported";
  const messages = type === "Nil" ? nilMessages : type === "Symbol" ? symbolMessages : type === "Block" ? blockMessages : type === "Object" ? objectMessages : type === "String" ? stringMessages : new Map();
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
