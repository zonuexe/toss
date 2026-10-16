export const runtimeJavaScript = `class TossRuntimeError extends Error {
  constructor(reason, location) {
    super(location.file + ":" + location.line + ":" + location.column +
      ": RuntimeError: " + reason);
    this.name = "TossRuntimeError";
    this.stack = this.name + ": " + this.message;
  }
}

function send(receiver, message, context) {
  const type = typeof receiver === "symbol" ? "Symbol" : typeof receiver === "function" ? "Block" : "String";
  const messages = type === "Symbol" ? symbolMessages : type === "Block" ? blockMessages : stringMessages;
  const implementation = messages.get(message.name) ??
    (type === "Block" && blockKeywordSelector.test(message.name) ? blockKeywordMessage : undefined);
  if (implementation === undefined) {
    throw new TossRuntimeError("Unknown message " + JSON.stringify(message.name) + " for " + type + ".", context.location);
  }
  return implementation(receiver, context, ...message.arguments);
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
  return receiver(...args);
}

function writeOutput(receiver, conversion, context) {
  const text = send(receiver, {name: conversion, arguments: []}, context);
  if (typeof text !== "string") {
    throw new TossRuntimeError(conversion + " must return a string.", context.location);
  }
  console.log(text);
  return receiver;
}`;
