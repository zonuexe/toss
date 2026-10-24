let callbacks;

export function register(increment, reset, formatCount) {
  if (
    typeof increment !== "function" || typeof reset !== "function" ||
    typeof formatCount !== "function"
  ) {
    throw new TypeError("Toss counter callbacks must all be functions.");
  }
  callbacks = { increment, reset, formatCount };
}

function initializedCallbacks() {
  if (callbacks === undefined) {
    throw new Error(
      "Toss counter is not initialized; import counter.js before using it.",
    );
  }
  return callbacks;
}

export function increment(count) {
  return initializedCallbacks().increment(count);
}

export function reset() {
  return initializedCallbacks().reset();
}

export function formatCount(count) {
  return initializedCallbacks().formatCount(count);
}
