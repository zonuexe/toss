import type { Statement } from "./parser.ts";
import { stringPrint } from "./prelude/string.ts";
import { runtimeJavaScript } from "./runtime.ts";

export function generate(statements: readonly Statement[]): string {
  const lines = ['"use strict";'];
  if (statements.some((statement) => statement.messages.length > 0)) {
    lines.push(
      stringPrint.javascript,
      `const stringMessages = new Map([[${
        JSON.stringify(stringPrint.name)
      }, print]]);`,
      runtimeJavaScript,
    );
  }
  for (const statement of statements) {
    lines.push("{", `  let receiver = ${JSON.stringify(statement.value)};`);
    for (const message of statement.messages) {
      lines.push(
        `  receiver = send(receiver, ${JSON.stringify(message.name)}, ${
          JSON.stringify(message.location)
        });`,
      );
    }
    lines.push("}");
  }
  return lines.join("\n") + "\n";
}
