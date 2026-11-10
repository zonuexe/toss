// Experimental vertical slice. This compiler is not part of Toss's public API.
import type { Expression } from "../src/ast.ts";
import { expandProgram } from "../src/macro_compile.ts";
import {
  fileRootSetupLines,
  runtimePreludeLines,
} from "../src/codegen_prelude.ts";

function emit(expression: Expression, scope = "environment"): string {
  const context = `{location: ${
    JSON.stringify(expression.location)
  }, environment: ${scope}}`;
  switch (expression.kind) {
    case "string":
      return JSON.stringify(expression.value);
    case "number":
      return Object.is(expression.value, -0) ? "-0" : String(expression.value);
    case "symbol":
      return `Symbol.for(${JSON.stringify(expression.name)})`;
    case "fetch":
      return `fetchBinding(${JSON.stringify(expression.name)}, ${context})`;
    case "array":
      return `[${
        expression.elements.map((item) => emit(item, scope)).join(", ")
      }]`;
    case "block": {
      if (expression.asynchronous === true) {
        throw new Error(
          "Experimental effects compiler does not support async Blocks.",
        );
      }
      const parameters = expression.parameters.map((_, index) => `arg${index}`);
      const locations = expression.parameterLocations ??
        expression.parameters.map(() => expression.location);
      const bindings = expression.parameters.map((name, index) =>
        `lexicalEnvironment(localScope, ${
          JSON.stringify(locations[index])
        }).bindings.set(Symbol.for(${JSON.stringify(name)}), arg${index});`
      );
      const body = expression.body.map((item, index) =>
        `${index === expression.body.length - 1 ? "return " : ""}${
          emit(item, "localScope")
        };`
      );
      return `((captured) => markEffectBlock(function*(${
        parameters.join(", ")
      }) {
const invocation = this;
const {carrier: localScope} = blockEnvironment(captured, ${
        JSON.stringify(expression.location)
      }, ${JSON.stringify(locations)});
if (invocation?.kind === "tossInvocation") {
  localScope.superContext = invocation.context;
  lexicalEnvironment(localScope, ${
        JSON.stringify(expression.location)
      }).bindings.set(Symbol.for("self"), invocation.context.receiver);
}
${bindings.join("\n")}
${body.length === 0 ? "return null;" : body.join("\n")}
}))(${scope})`;
    }
    case "send":
      return `(yield* effectSend(${emit(expression.receiver, scope)}, {name: ${
        JSON.stringify(expression.name)
      }, arguments: [${
        expression.arguments.map((item) => emit(item, scope)).join(", ")
      }]}, ${context}))`;
    case "pipeline":
      return `(yield* effectPipeline(${emit(expression.input, scope)}, ${
        emit(expression.receiver, scope)
      }, {name: ${JSON.stringify(expression.name)}, arguments: [${
        expression.arguments.map((item) => emit(item, scope)).join(", ")
      }]}, ${context}))`;
    case "super":
      return `(yield* effectParent([${
        expression.arguments.map((item) => emit(item, scope)).join(", ")
      }], ${context}, ${scope}))`;
    case "extend": {
      const entries = expression.entries.map((entry) =>
        `yield* effectSend(extendTarget, {name: "at:put:", arguments: [${
          emit(entry.key, scope)
        }, ${emit(entry.value, scope)}]}, {location: ${
          JSON.stringify(entry.location)
        }, environment: ${scope}});`
      );
      return `(yield* (function*(extendTarget) {
if (extendTarget === null || typeof extendTarget !== "object" || Array.isArray(extendTarget) || isJavaScriptReference(extendTarget)) throw new TossRuntimeError("%extend target must be an Object.", ${context}.location);
${entries.join("\n")}
return extendTarget;
})(${emit(expression.input, scope)}))`;
    }
    case "await":
    case "import":
    case "javascriptImport":
    case "export":
    case "javascript":
    case "quotation":
      throw new Error(
        `Experimental effects compiler does not support ${expression.kind}.`,
      );
    default: {
      const exhaustive: never = expression;
      throw new TypeError(JSON.stringify(exhaustive));
    }
  }
}

const experimentalRuntime = `
const effectBlocks = new WeakSet();
const effectResumeStates = new WeakMap();
const effectCleanupFailures = new WeakMap();
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
  let done = false;
  function* drive(step) {
    while (!step.done) {
      const request = step.value;
      const owner = slotOwner(handler, request.effect);
      if (owner === null) { step = iterator.next(yield request); continue; }
      const selected = Reflect.get(owner, request.effect, handler);
      if (typeof selected !== "function" || !effectBlocks.has(selected))
        throw new TossRuntimeError("Handler case must be a synchronous Block.", request.location);
      const state = {active: true, suspended: false, used: false};
      const resume = markEffectBlock(function*(value) {
        if (!state.active || state.suspended || state.used) throw new TossRuntimeError("Invalid resume.", request.location);
        state.used = true;
        return yield* drive(iterator.next(value));
      });
      effectResumeStates.set(resume, state);
      const selectedIterator = effectInvoke(selected, [request.payload, resume], {
        ...context, methodReceiver: {kind: "tossInvocation", context: {receiver: handler, key: request.effect, owner}}
      });
      const delegate = {
        [Symbol.iterator]() { return this; },
        next(value) { state.suspended = false; const step = selectedIterator.next(value); state.suspended = !step.done; return step; },
        throw(error) { state.suspended = false; const step = selectedIterator.throw(error); state.suspended = !step.done; return step; },
        return(value) { state.suspended = false; const step = selectedIterator.return(value); state.suspended = !step.done; return step; },
      };
      try { return yield* delegate; }
      finally { state.active = false; }
    }
    done = true;
    return step.value;
  }
  let failed = false;
  let primary;
  try { return yield* drive(iterator.next()); }
  catch (error) { failed = true; primary = error; throw error; }
  finally {
    if (!done) {
      try { iterator.return(); }
      catch (error) { if (failed) recordCleanupFailure(primary, error); else throw error; }
    }
  }
}
function* effectParent(args, context, scope) {
  const method = scope.superContext;
  if (method === undefined) throw new TossRuntimeError("%super requires a method invocation context.", context.location);
  const owner = slotOwner(Object.getPrototypeOf(method.owner), method.key);
  if (owner === null) throw new TossRuntimeError("Missing parent method in experimental compiler.", context.location);
  const block = Reflect.get(owner, method.key, method.receiver);
  if (typeof block !== "function") throw new TossRuntimeError("Parent slot must be a Block.", context.location);
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
      if (typeof block !== "function") return send(receiver, message, context);
      throw new TossRuntimeError("Unsupported native method in experimental effects compiler.", context.location);
    }
  }
  const allowed = new Set(["bind:", "clone", "at:", "at:put:", "add:", "subtract:", "multiplyBy:", "divideBy:", "remainder:", "negated", "equals:", "lessThan:", "greaterThan:", "lessThanOrEqual:", "greaterThanOrEqual:", "length", "print", "not"]);
  if (!allowed.has(name) || (name === "print" && typeof receiver === "object" && receiver !== null))
    throw new TossRuntimeError("Unsupported message in experimental effects compiler: " + name, context.location);
  return send(receiver, message, context);
}
function runEffectProgram(iterator) {
  const step = iterator.next();
  if (!step.done) {
    iterator.return();
    throw new TossRuntimeError("Unhandled effect.", step.value.location);
  }
  return step.value;
}
function reportEffectFailures(error) {
  if (!(error instanceof Error)) return;
  const failures = effectCleanupFailures.get(error);
  if (failures === undefined) return;
  error.stack += failures.map((failure) => "\\n  cleanup failure: " + (failure instanceof Error ? failure.message : String(failure))).join("");
}
`;

export function compileExperimentalEffects(
  source: string,
  file: string,
): string {
  const expressions = expandProgram(source, { file });
  const body = expressions.map((expression) => `${emit(expression)};`).join(
    "\n",
  );
  return [
    "(() => {",
    ...runtimePreludeLines(),
    ...fileRootSetupLines(),
    experimentalRuntime,
    'environment.bindings.set(Symbol.for("Effect"), effectRoot);',
    `try { runEffectProgram((function*() {\n${body}\n})()); } catch (error) { reportEffectFailures(error); throw error; }`,
    "})();",
  ].join("\n");
}
