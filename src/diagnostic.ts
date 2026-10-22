export type SourceLocation = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
};

export class TossSyntaxError extends Error {
  override readonly name = "TossSyntaxError";

  constructor(readonly location: SourceLocation, readonly reason: string) {
    super(
      `${location.file}:${location.line}:${location.column}: SyntaxError: ${reason}`,
    );
  }
}
