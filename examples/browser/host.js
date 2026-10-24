const status = document.querySelector("#status");
const results = document.querySelector("#results");
const button = document.querySelector("#callback-button");
const records = new Map();
let tossCallback;
let failed = false;

function updateStatus(value, message) {
  if (failed && value !== "fail") return;
  if (value === "fail") failed = true;
  status.dataset.status = value;
  status.textContent = message;
}

function showResult(name, expected, observed) {
  const passed = Object.is(expected, observed);
  const item = document.createElement("li");
  item.dataset.status = passed ? "pass" : "fail";
  item.textContent = `${passed ? "PASS" : "FAIL"} ${name}: expected ${
    String(expected)
  }, observed ${String(observed)}`;
  records.set(name, item);
  results.append(item);
  if (!passed) updateStatus("fail", `FAIL: ${name}`);
}

export function record(name, expected, observed) {
  const previous = records.get(name);
  if (previous) previous.remove();
  showResult(name, expected, observed);
}

export function installCallback(callback) {
  tossCallback = callback;
  record("callback from JavaScript", 42, callback(40));
  button.disabled = false;
}

export function promiseValue(value) {
  return Promise.resolve(value * 2);
}

export function run(callback) {
  Promise.resolve().then(callback).catch(fail);
}

export function complete() {
  const requiredChecks = [
    "arithmetic",
    "Array map",
    "private module closure",
    "JS namespace identity",
    "callback from JavaScript",
    "Async Block and Promise",
  ];
  const passed = requiredChecks.every((name) =>
    records.get(name)?.dataset.status === "pass"
  );
  updateStatus(
    passed ? "pass" : "fail",
    passed
      ? "PASS: all Toss checks completed"
      : "FAIL: required Toss checks are missing or failed",
  );
}

export function fail(error) {
  const item = document.createElement("li");
  item.dataset.status = "fail";
  item.textContent = `FAIL error: ${
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }`;
  results.append(item);
  updateStatus("fail", "FAIL: Toss execution error");
}

let callbackCount = 0;
button.addEventListener("click", () => {
  if (!tossCallback) return;
  callbackCount += 1;
  const input = 40 + callbackCount;
  try {
    record(`button callback #${callbackCount}`, input + 2, tossCallback(input));
  } catch (error) {
    fail(error);
  }
});
