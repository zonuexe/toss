export const runtimeJavaScript = `class TossRuntimeError extends Error {
  constructor(reason, location) {
    super(location.file + ":" + location.line + ":" + location.column +
      ": RuntimeError: " + reason);
    this.name = "TossRuntimeError";
    this.stack = this.name + ": " + this.message;
  }
}

function send(receiver, message, location) {
  const messages = typeof receiver === "symbol" ? symbolMessages : stringMessages;
  const implementation = messages.get(message.name);
  if (implementation === undefined) {
    const type = typeof receiver === "symbol" ? "Symbol" : "String";
    throw new TossRuntimeError("Unknown message " + JSON.stringify(message.name) + " for " + type + ".", location);
  }
  return implementation(receiver, location, ...message.arguments);
}

function fetchBinding(name, location) {
  const key = Symbol.for(name);
  if (!environment.has(key)) {
    throw new TossRuntimeError("Unbound name " + JSON.stringify(name) + ".", location);
  }
  return environment.get(key);
}

function writeOutput(receiver, conversion, location) {
  const text = send(receiver, {name: conversion, arguments: []}, location);
  if (typeof text !== "string") {
    throw new TossRuntimeError(conversion + " must return a string.", location);
  }
  console.log(text);
  return receiver;
}`;
