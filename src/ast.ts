import type { SourceLocation } from "./diagnostic.ts";
import type { SyntaxGroup } from "./syntax.ts";

export type Expression =
  | {
    readonly kind: "block";
    readonly parameters: readonly string[];
    readonly parameterLocations?: readonly SourceLocation[];
    readonly body: readonly Expression[];
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "string";
    readonly value: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "number";
    readonly value: number;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "symbol";
    readonly name: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "fetch";
    readonly name: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "array";
    readonly elements: readonly Expression[];
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "pipeline";
    readonly input: Expression;
    readonly receiver: Expression;
    readonly name: string;
    readonly arguments: readonly Expression[];
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "extend";
    readonly input: Expression;
    readonly entries: readonly {
      readonly key: Expression;
      readonly value: Expression;
      readonly location: SourceLocation;
    }[];
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "send";
    readonly receiver: Expression;
    readonly name: string;
    readonly arguments: readonly Expression[];
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "super";
    readonly arguments: readonly Expression[];
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "import";
    readonly path: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "export";
    readonly value: Expression;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "javascript";
    readonly bindings: readonly {
      readonly name: string;
      readonly value: Expression;
    }[];
    readonly source: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "quotation";
    readonly syntax: SyntaxGroup;
    readonly mode: "literal" | "quasi";
    readonly location: SourceLocation;
  };
