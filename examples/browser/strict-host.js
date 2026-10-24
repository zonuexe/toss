const status = document.querySelector("#status");
const results = document.querySelector("#results");

function result(name, passed, detail) {
  const item = document.createElement("li");
  item.dataset.status = passed ? "pass" : "fail";
  item.textContent = `${passed ? "PASS" : "FAIL"} ${name}: ${detail}`;
  results.append(item);
  return passed;
}

const output = [];
const originalLog = console.log;
let tossExecutionSucceeded = false;
console.log = (...values) => output.push(values.map(String).join(" "));
try {
  await import("./strict.js");
  tossExecutionSucceeded = true;
} catch (error) {
  result("strict Toss execution", false, formatError(error));
} finally {
  console.log = originalLog;
}
const arithmeticPassed = tossExecutionSucceeded && output.join("\n") === "42";
const tossPassed = result(
  "strict Toss execution",
  arithmeticPassed,
  `expected 42, observed ${output.join(" ") || "no output"}`,
);

let blockedPassed = false;
try {
  await import("./blocked.js");
  result(
    "%js blocked by CSP",
    false,
    "expected EvalError, but the fixture ran",
  );
} catch (error) {
  const blockedError = cspEvalError(error);
  blockedPassed = blockedError !== undefined;
  result(
    "%js blocked by CSP",
    blockedPassed,
    blockedError === undefined ? formatError(error) : blockedError,
  );
}

const passed = tossPassed && blockedPassed;
status.dataset.status = passed ? "pass" : "fail";
status.textContent = passed
  ? "PASS: strict CSP checks completed"
  : "FAIL: strict CSP verification failed";

function cspEvalError(error) {
  if (error instanceof EvalError) return `${error.name}: ${error.message}`;
  if (
    error instanceof Error && error.name === "TossRuntimeError" &&
    error.cause instanceof EvalError
  ) {
    return `${error.name} caused by ${error.cause.name}: ${error.cause.message}`;
  }
  return undefined;
}

function formatError(error) {
  if (!(error instanceof Error)) return String(error);
  if (error.cause instanceof Error) {
    return `${error.name}: ${error.message} (cause: ${error.cause.name}: ${error.cause.message})`;
  }
  return `${error.name}: ${error.message}`;
}
