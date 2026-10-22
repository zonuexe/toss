export function emitJavaScriptImports(specifiers: readonly string[]): string[] {
  if (specifiers.length === 0) return [];
  const imports = specifiers.map((specifier, index) => {
    const quotedSpecifier = JSON.stringify(specifier);
    return `import * as __tossJavaScriptImport${index} from ${quotedSpecifier};`;
  });
  const mapEntries = specifiers.map((specifier, index) =>
    `[${JSON.stringify(specifier)}, __tossJavaScriptImport${index}]`
  );
  return [
    ...imports,
    `const javascriptImportNames = new Map([${mapEntries.join(", ")}]);`,
  ];
}
