import { createInterface } from "node:readline";
import { stderr, stdin, stdout } from "node:process";
import { IncompleteJavaScriptError, TossSyntaxError } from "./diagnostic.ts";
import { readSyntax } from "./syntax_reader.ts";
import type { SyntaxNode } from "./syntax.ts";
import { createAsyncReplSession } from "./repl.ts";

const help = [
  "Toss REPL commands:",
  "  :help    Show this help",
  "  :reset   Clear runtime and local macros",
  "  :cancel  Discard pending multiline input",
  "  :quit    Exit",
].join("\n");

export async function main(): Promise<void> {
  const interactive = Deno.stdin.isTerminal() && Deno.stdout.isTerminal();
  const session = createAsyncReplSession();
  const input = createInterface({
    input: stdin,
    output: stdout,
    terminal: interactive,
    crlfDelay: Infinity,
  });
  let pending = "";
  let hadError = false;
  let interrupted = false;
  let quit = false;
  let fatalShutdown = false;
  let signalInstalled = false;
  let inputClosed = false;
  let quitRequested = false;
  let queue = Promise.resolve();
  let failQueue: (error: unknown) => void = () => {};
  const onInterrupt = (): void => {
    interrupted = true;
    Deno.exitCode = 130;
    input.close();
    stdin.destroy();
    if (signalInstalled) Deno.removeSignalListener("SIGINT", onInterrupt);
    Deno.exit(130);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      failQueue = reject;
      input.on("SIGINT", onInterrupt);
      input.on("line", (line: string) => {
        if (interrupted || quitRequested || fatalShutdown) return;
        if (interactive) {
          input.pause();
          stdin.setRawMode(false);
        }
        if ([":quit", ":exit"].includes(line.trim())) quitRequested = true;
        queue = queue.then(() => processLine(line));
        queue = queue.catch((error: unknown) => {
          fatalShutdown = true;
          failQueue(error);
          input.close();
        });
      });
      input.once("close", () => {
        inputClosed = true;
        if (fatalShutdown || interrupted) return;
        void queue.then(() => {
          if (!interrupted && !quit && pending.trim().length > 0) {
            stderr.write("<repl>: incomplete input at end of file.\n");
            Deno.exitCode = 1;
          }
          if (hadError && !interactive && !interrupted) Deno.exitCode = 1;
          resolve();
        }, reject);
      });
      Deno.addSignalListener("SIGINT", onInterrupt);
      signalInstalled = true;
      input.setPrompt("toss> ");
      if (interactive) input.prompt();
    });
  } finally {
    if (signalInstalled) Deno.removeSignalListener("SIGINT", onInterrupt);
    input.close();
    stdin.destroy();
  }

  async function processLine(line: string): Promise<void> {
    if (interrupted || fatalShutdown) return;
    const command = line.trim();
    if (command === ":help") {
      stdout.write(`${help}\n`);
    } else if (command === ":quit" || command === ":exit") {
      quit = true;
      input.close();
    } else if (command === ":cancel") {
      pending = "";
    } else if (command === ":reset") {
      await session.reset();
      pending = "";
    } else {
      pending += line + "\n";
      const state = completeness(pending);
      switch (state) {
        case "incomplete":
          break;
        case "complete":
        case "invalid": {
          const result = await session.submit(pending);
          pending = "";
          switch (result.kind) {
            case "empty":
              break;
            case "value":
              stdout.write(`=> ${result.display}\n`);
              break;
            case "error":
              stderr.write(`${result.message}\n`);
              hadError = true;
              break;
            default:
              assertNever(result);
          }
          break;
        }
        default:
          assertNever(state);
      }
    }
    if (interactive && !inputClosed && !interrupted && !quit) {
      stdin.setRawMode(true);
      input.setPrompt(pending.length === 0 ? "toss> " : "...> ");
      input.prompt();
      input.resume();
    }
  }
}

function completeness(source: string): "complete" | "incomplete" | "invalid" {
  try {
    const syntax = readSyntax(source, {
      file: "<repl>",
      deferUnclosedGroups: true,
    });
    if (syntax.children.length === 0) return "complete";
    if (hasOpenGroup(syntax.children)) return "incomplete";
    const last = syntax.children.at(-1);
    return last?.kind === "token" && last.spelling === "." &&
        last.flavor === "ordinary"
      ? "complete"
      : "incomplete";
  } catch (error) {
    if (error instanceof IncompleteJavaScriptError) return "incomplete";
    if (
      error instanceof TossSyntaxError &&
      error.reason === "Unterminated string."
    ) {
      return "incomplete";
    }
    if (error instanceof TossSyntaxError) return "invalid";
    throw error;
  }
}

function hasOpenGroup(nodes: readonly SyntaxNode[]): boolean {
  return nodes.some((node) => {
    switch (node.kind) {
      case "group":
        return !node.closed || hasOpenGroup(node.children);
      case "token":
        return node.rawJavaScript?.prefix !== undefined &&
          hasOpenGroup(node.rawJavaScript.prefix);
      default:
        return assertNever(node);
    }
  });
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected REPL variant: ${JSON.stringify(value)}`);
}

if (import.meta.main) await main();
