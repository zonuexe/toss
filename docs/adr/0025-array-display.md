# ADR-25: Array display

Arrays receive `inspect` and `toString`. Both return brackets containing each
element's `inspect` result, separated by comma and space. Nested arrays recurse;
all elements must answer `inspect` with a string. Missing messages and invalid
conversion results remain runtime errors. The active array inspection path
renders a repeated array as `[...]`, preventing cycles while allowing shared
arrays to render fully at each occurrence.

Using the normal message protocol preserves custom object representations.
Objects without `inspect` and Blocks remain unknown-message errors, as in
ADR-16. A non-string result raises `inspect must return a string.` at the array
send location. Errors inside custom methods keep their body location.

Inspection iterates a shallow snapshot of each array's slots from left to
right. Nested values remain live. `print` and `dump` reuse the standard output
messages, write a newline, and return the original array.

Cycle tracking follows active calls, including custom methods that inspect an
ancestor array. It is cleared after both success and errors. A self-containing
array renders as `[[...]]`; two references to `[1]` render as `[[1], [1]]`.
This bounds cyclic traversal without hiding noncyclic shared values. These
representations are for inspection, not guaranteed to be valid Toss source.

```sh
mise exec -- deno task compile examples/array-display.toss -o out/array-display.js
mise exec -- deno run out/array-display.js
```
