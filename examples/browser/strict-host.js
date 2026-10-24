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
console.log = (...values) => output.push(values.map(String).join(" "));
try {
  await import("./strict.js");
} catch (error) {
  result("plain Toss program", false, formatError(error));
} finally {
  console.log = originalLog;
}
const tossPassed = result(
  "plain Toss program",
  output.join("\n") === "42",
  `expected 42, observed ${output.join(" ") || "no output"}`,
);

const aotOutput = [];
console.log = (...values) => aotOutput.push(values.map(String).join(" "));
try {
  await import("./aot.js");
  result(
    "AOT %js expression",
    aotOutput.join("\n") === "2",
    `expected 2, observed ${aotOutput.join(" ") || "no output"}`,
  );
} catch (error) {
  result("AOT %js expression", false, formatError(error));
} finally {
  console.log = originalLog;
}

let blockedPassed = false;
try {
  await import("./blocked.js");
  result("user Function constructor", false, "expected CSP to block Function");
} catch (error) {
  const blockedError = cspEvalError(error);
  blockedPassed = blockedError !== undefined;
  result(
    "user Function constructor",
    blockedPassed,
    blockedError === undefined ? formatError(error) : blockedError,
  );
}

const passed = tossPassed && aotOutput.join("\n") === "2" && blockedPassed;
status.dataset.status = passed ? "pass" : "fail";
status.textContent = passed
  ? "PASS: strict host checks completed"
  : "FAIL: strict host verification failed";

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
