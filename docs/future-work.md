# Future work

These are candidates, not committed APIs or an implementation order.

## Array operations

- `filterMap`: combine transformation and selection in one pass. The callback
  result and the way to skip an element are undecided. Nil is a valid array
  element, so it is not automatically a skip signal.
- `flatMap`: transform elements and flatten the results. The callback result
  type and flattening depth are undecided.
