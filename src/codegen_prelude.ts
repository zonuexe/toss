import {
  blockAsJavaScriptCallback,
  blockValue,
  blockValueWithArguments,
} from "./prelude/block.ts";
import { outputDump, outputPrint } from "./prelude/output.ts";
import { stringInspect, stringToString } from "./prelude/string.ts";
import {
  objectAt,
  objectAtPut,
  objectClone,
  objectPerform,
  objectPerformWithArguments,
} from "./prelude/object.ts";
import {
  symbolBind,
  symbolEquals,
  symbolGenerateUnique,
  symbolInspect,
  symbolToString,
} from "./prelude/symbol.ts";
import { nilInspect, nilToString } from "./prelude/nil.ts";
import { numberMessages } from "./prelude/number.ts";
import { booleanMessages } from "./prelude/boolean.ts";
import { arrayMessages } from "./prelude/array.ts";
import { runtimeJavaScript } from "./runtime.ts";

type PreludeMessage = { readonly name: string; readonly javascript: string };

function messageTable(
  name: string,
  messages: readonly PreludeMessage[],
): string {
  return `const ${name} = new Map([\n${
    messages.map((message) =>
      `  [${JSON.stringify(message.name)}, ${message.javascript}]`
    ).join(",\n")
  }\n]);`;
}

export function runtimePreludeLines(): string[] {
  return [
    '"use strict";',
    messageTable("blockMessages", [blockValue, blockAsJavaScriptCallback]),
    `const blockKeywordSelector = new RegExp(${
      JSON.stringify(blockValueWithArguments.selectorPattern)
    });`,
    `const blockKeywordMessage = ${blockValueWithArguments.javascript};`,
    messageTable("stringMessages", [
      stringToString,
      stringInspect,
      outputPrint,
      outputDump,
    ]),
    messageTable("numberMessages", numberMessages),
    messageTable("booleanMessages", booleanMessages),
    messageTable("arrayMessages", arrayMessages),
    messageTable("symbolMessages", [
      symbolToString,
      symbolInspect,
      symbolEquals,
      outputPrint,
      outputDump,
      symbolBind,
    ]),
    messageTable("nilMessages", [
      nilToString,
      nilInspect,
      outputPrint,
      outputDump,
    ]),
    messageTable("objectMessages", [
      objectClone,
      objectAt,
      objectAtPut,
      objectPerform,
      objectPerformWithArguments,
      outputPrint,
      outputDump,
    ]),
    runtimeJavaScript,
  ];
}

export function fileRootSetupLines(imports: readonly string[] = []): string[] {
  return [
    "const environment = {bindings: new Map(), parent: null, root: null, scopes: new Map(), superContext: undefined};",
    "environment.root = environment; environment.scopes.set(0, environment);",
    "let moduleExport = null;",
    `const moduleImports = new Map([${imports.join(", ")}]);`,
    "const objectRoot = Object.create(null);",
    'environment.bindings.set(Symbol.for("Object"), objectRoot);',
    "const symbolRoot = Object.create(null);",
    `Object.defineProperty(symbolRoot, "generateUnique", {value: ${symbolGenerateUnique}, writable: true, enumerable: true, configurable: true});`,
    'environment.bindings.set(Symbol.for("Symbol"), symbolRoot);',
    'environment.bindings.set(Symbol.for("Nil"), null);',
    'environment.bindings.set(Symbol.for("True"), true);',
    'environment.bindings.set(Symbol.for("False"), false);',
  ];
}
