import type { SourceLocation } from "./diagnostic.ts";
import type { ArithmeticOperator } from "./comparison_operator.ts";

export type Token =
  | {
    readonly kind: "number";
    readonly value: number;
    readonly location: SourceLocation;
  }
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
  | { readonly kind: "importOpen"; readonly location: SourceLocation }
  | { readonly kind: "exportOpen"; readonly location: SourceLocation }
  | { readonly kind: "extendOpen"; readonly location: SourceLocation }
  | { readonly kind: "superOpen"; readonly location: SourceLocation }
  | {
    readonly kind: "javascript";
    readonly prefix: string;
    readonly source: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "fetch";
    readonly name: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "unary";
    readonly name: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "keyword";
    readonly name: string;
    readonly location: SourceLocation;
  }
  | { readonly kind: "period"; readonly location: SourceLocation }
  | { readonly kind: "pipe"; readonly location: SourceLocation }
  | { readonly kind: "openParen"; readonly location: SourceLocation }
  | { readonly kind: "closeParen"; readonly location: SourceLocation }
  | { readonly kind: "arithmeticOpen"; readonly location: SourceLocation }
  | { readonly kind: "arithmeticClose"; readonly location: SourceLocation }
  | { readonly kind: "openBrace"; readonly location: SourceLocation }
  | { readonly kind: "closeBrace"; readonly location: SourceLocation }
  | { readonly kind: "openBracket"; readonly location: SourceLocation }
  | { readonly kind: "closeBracket"; readonly location: SourceLocation }
  | { readonly kind: "arrow"; readonly location: SourceLocation }
  | { readonly kind: "comma"; readonly location: SourceLocation }
  | { readonly kind: "colon"; readonly location: SourceLocation }
  | { readonly kind: "eof"; readonly location: SourceLocation }
  | {
    readonly kind: "arithmeticOperator";
    readonly operator: ArithmeticOperator;
    readonly location: SourceLocation;
  };
