import type { SourceLocation } from "./diagnostic.ts";

export type Expression =
  | {
    readonly kind: "string";
    readonly value: string;
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
    readonly kind: "pipeline";
    readonly input: Expression;
    readonly receiver: Expression;
    readonly name: string;
    readonly arguments: readonly Expression[];
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "send";
    readonly receiver: Expression;
    readonly name: string;
    readonly arguments: readonly Expression[];
    readonly location: SourceLocation;
  };
