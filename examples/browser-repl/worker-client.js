export function createWorkerClient(createWorker, callbacks) {
  let worker;
  let generation = 0;
  let nextRequestId = 0;
  let pending;
  let ready = false;

  function startWorker() {
    generation += 1;
    const workerGeneration = generation;
    const current = createWorker();
    worker = current;
    ready = false;
    current.addEventListener("message", (event) => {
      if (workerGeneration !== generation) return;
      const message = event.data;
      if (message?.type === "ready") {
        ready = true;
        callbacks.onReady(true);
        return;
      }
      if (message?.type === "output" && typeof message.text === "string") {
        callbacks.onOutput(message.text);
        return;
      }
      if (message?.type === "fatal" && typeof message.message === "string") {
        const operation = pending?.operation;
        ready = false;
        pending = undefined;
        callbacks.onPending(false, operation);
        callbacks.onReady(false);
        callbacks.onWorkerError(message.message);
        return;
      }
      if (message?.type === "complete" && message.requestId === pending?.id) {
        const operation = pending.operation;
        pending = undefined;
        callbacks.onComplete(operation, message.result);
        callbacks.onPending(false, operation);
      }
    });
    current.addEventListener("error", (event) => {
      if (workerGeneration !== generation) return;
      const operation = pending?.operation;
      ready = false;
      pending = undefined;
      callbacks.onPending(false, operation);
      callbacks.onReady(false);
      callbacks.onWorkerError(event.message || "Worker execution failed.");
    });
    current.addEventListener("messageerror", () => {
      if (workerGeneration !== generation) return;
      const operation = pending?.operation;
      ready = false;
      pending = undefined;
      callbacks.onPending(false, operation);
      callbacks.onReady(false);
      callbacks.onWorkerError("The Worker returned an unreadable message.");
    });
    callbacks.onReady(false);
  }

  function request(operation, payload = {}) {
    if (!ready || pending !== undefined) return false;
    const requestId = ++nextRequestId;
    pending = { id: requestId, operation };
    callbacks.onPending(true, operation);
    try {
      worker.postMessage({ ...payload, type: operation, requestId });
    } catch (error) {
      pending = undefined;
      callbacks.onPending(false, operation);
      callbacks.onWorkerError(
        error instanceof Error
          ? error.message
          : "Unable to send a message to the Worker.",
      );
      return false;
    }
    return true;
  }

  function reload() {
    const operation = pending?.operation;
    worker?.terminate();
    ready = false;
    pending = undefined;
    callbacks.onPending(false, operation);
    startWorker();
  }

  function dispose() {
    generation += 1;
    pending = undefined;
    ready = false;
    worker?.terminate();
  }

  function updateSources(sources) {
    if (!ready) return false;
    try {
      worker.postMessage({ type: "sources", sources });
      return true;
    } catch (error) {
      callbacks.onWorkerError(
        error instanceof Error
          ? error.message
          : "Unable to send virtual sources to the Worker.",
      );
      return false;
    }
  }

  startWorker();
  return Object.freeze({
    submit: (source) => request("submit", { source }),
    reset: (sources) => request("reset", { sources }),
    updateSources,
    reload,
    dispose,
  });
}

export function bindWorkerPageLifecycle(client, page, onRestore) {
  page.addEventListener("pagehide", () => client.dispose());
  page.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    onRestore();
    client.reload();
  });
}
