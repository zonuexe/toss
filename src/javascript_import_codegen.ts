export function emitJavaScriptImports(specifiers: readonly string[]): string[] {
  return emitJavaScriptImportStatements(specifiers);
}

export function emitJavaScriptImportStatements(
  specifiers: readonly string[],
  aliases: readonly string[] = specifiers.map((_, index) =>
    `__tossJavaScriptImport${index}`
  ),
): string[] {
  return specifiers.map((specifier, index) => {
    const quotedSpecifier = JSON.stringify(specifier);
    return `import * as ${aliases[index]} from ${quotedSpecifier};`;
  });
}

export function javascriptImportMapExpression(
  specifiers: readonly string[],
  aliases: readonly string[] = specifiers.map((_, index) =>
    `__tossJavaScriptImport${index}`
  ),
): string {
  const mapEntries = specifiers.map((specifier, index) =>
    `[${JSON.stringify(specifier)}, ${aliases[index]}]`
  );
  return `new Map([${mapEntries.join(", ")}])`;
}
