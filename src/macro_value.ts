import type { SourceLocation } from "./diagnostic.ts";
import type { Expression } from "./ast.ts";
import type { MacroTrace, SyntaxNode, SyntaxScope } from "./syntax.ts";

export type MacroValue =
  | null
  | string
  | number
  | boolean
  | symbol
  | MacroBlock
  | MacroNative
  | MacroValue[]
  | MacroObject
  | SyntaxNode;

export type MacroObject = {
  readonly kind: "macroObject";
  readonly slots: Map<string | symbol, MacroValue>;
  readonly prototype: MacroObject | null;
};

export class MacroEnvironment {
  readonly bindings = new Map<symbol, MacroValue>();
  constructor(readonly parent: MacroEnvironment | null = null) {}
  bind(key: symbol, value: MacroValue): MacroValue {
    this.bindings.set(key, value);
    return value;
  }
  fetch(key: symbol, location: SourceLocation): MacroValue {
    if (this.bindings.has(key)) return this.bindings.get(key) ?? null;
    if (this.parent !== null) return this.parent.fetch(key, location);
    throw new TossSyntaxError(
      location,
      `Unbound name ${Symbol.keyFor(key) ?? "<unique>"}.`,
    );
  }
}

export function macroEnvironmentFor(
  context: MacroContext,
  location: SourceLocation,
): MacroEnvironment {
  const scopes = context.scopes ?? new Map([[0, context.environment]]);
  const root = context.rootEnvironment ?? context.environment;
  const id = location.scope?.id ?? 0;
  const existing = scopes.get(id);
  if (existing !== undefined) return existing;
  const environment = new MacroEnvironment(root);
  scopes.set(id, environment);
  return environment;
}

export type MacroBlock = {
  readonly kind: "macroBlock";
  readonly parameters: readonly string[];
  readonly parameterLocations?: readonly SourceLocation[];
  readonly location: SourceLocation;
  readonly body: readonly Expression[];
  readonly captured: MacroEnvironment;
  readonly capturedScopes: Map<number, MacroEnvironment>;
  readonly rootEnvironment: MacroEnvironment;
  readonly capturedContext: MacroContext;
};

export type MacroNative = {
  readonly kind: "macroNative";
  readonly arity: number;
  readonly invoke: (
    args: readonly MacroValue[],
    context: MacroContext,
  ) => MacroValue;
};

export class MacroState {
  readonly inspectingArrays = new Set<MacroValue[]>();
  private remaining = 100000;
  private depth = 0;
  consume(location: SourceLocation): void {
    this.remaining--;
    if (this.remaining < 0) {
      throw new TossSyntaxError(location, "Macro computation limit exceeded.");
    }
  }
  consumeSyntaxNode(location: SourceLocation, depth: number): void {
    if (depth > 128) {
      throw new TossSyntaxError(location, "Macro syntax depth limit exceeded.");
    }
    this.consume(location);
  }
  enter(location: SourceLocation): () => void {
    this.consume(location);
    this.depth++;
    if (this.depth > 128) {
      this.depth--;
      throw new TossSyntaxError(location, "Macro block depth limit exceeded.");
    }
    return () => {
      this.depth--;
    };
  }
}

export type MacroContext = {
  readonly state: MacroState;
  readonly environment: MacroEnvironment;
  readonly scopes?: Map<number, MacroEnvironment>;
  readonly rootEnvironment?: MacroEnvironment;
  readonly location: SourceLocation;
  readonly quotation?: MacroQuotationSettings;
  readonly invocation?: {
    readonly receiver: MacroObject;
    readonly key: string | symbol;
    readonly owner: MacroObject;
  };
  readonly method?: {
    readonly receiver: MacroObject;
    readonly key: string | symbol;
    readonly owner: MacroObject;
  };
};

export type MacroQuotationSettings = {
  readonly introducedScope: SyntaxScope;
  readonly trace: readonly MacroTrace[];
  readonly parseHole?: (group: import("./syntax.ts").SyntaxGroup) => Expression;
};

export function macroRootEnvironment(): MacroEnvironment {
  const environment = new MacroEnvironment();
  environment.bind(Symbol.for("Nil"), null);
  environment.bind(Symbol.for("True"), true);
  environment.bind(Symbol.for("False"), false);
  const object: MacroObject = {
    kind: "macroObject",
    slots: new Map(),
    prototype: null,
  };
  const symbols: MacroObject = {
    kind: "macroObject",
    slots: new Map(),
    prototype: null,
  };
  symbols.slots.set("generateUnique", {
    kind: "macroNative",
    arity: 0,
    invoke: (args, context) => {
      if (args.length !== 0) {
        throw new TossSyntaxError(
          context.location,
          "Message generateUnique takes no arguments.",
        );
      }
      return Symbol();
    },
  });
  environment.bind(Symbol.for("Object"), object);
  environment.bind(Symbol.for("Symbol"), symbols);
  return environment;
}

import { TossSyntaxError } from "./diagnostic.ts";
