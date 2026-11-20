# Effects and effect handlers: exploration plan

Status: design and feasibility exploration. No syntax or behavior in this note
is implemented or committed as a public language contract. ADR-0 states the
direction; ADR-1 permits runtime support. The examples in the language tour are
illustrative, not an accepted specification.

Run `deno task effects:probe` to execute the exploratory probes together. Some
probes intentionally confirm incorrect behavior in narrowly patched generated
artifacts; their PASS means the limitation was reproduced, not that the Toss
feature is implemented. The probes are separate from the production test suite.

## Goal and sequence

Toss should be able to request an operation, handle it around a computation, and
resume that computation with a value. Resource cleanup should be reliable when
control leaves a protected computation. Start exploring now, and decide whether
to implement only after a prototype demonstrates the trade-offs.

1. Describe concrete synchronous scenarios and candidate semantics (below).
2. Design cleanup alongside effects; assess whether a synchronous `ensure:` for
   normal returns and runtime errors can be delivered independently without
   prejudging its behavior with resumable effects.
3. Prototype synchronous, one-shot resumption across nested Toss calls. Compare
   approaches and their impact on generated code, ordinary programs, the REPL,
   separate runtime output, source locations, and interoperability. Measure
   representative code size and runtime cost before choosing a strategy.
4. Only then specify and implement a minimal public feature, with executable
   integration tests and an ADR for any consequential architectural choice.
5. Extend the design to async Blocks, `%await`, concurrent computations, JS
   callbacks and Promise rejections as separate work. Do not assume that a
   synchronous dynamic handler stack works across asynchronous suspension.

These are ordering gates, not calendar dates. The async work is not a
prerequisite for beginning the synchronous prototype, but its compatibility must
be assessed before committing to a design that prevents it.

## Initial scenarios

The examples describe observable behavior, not Toss syntax:

- A computation requests `FileNotFound`; the nearest matching handler resumes it
  with a default configuration. The request expression produces that value, and
  the computation continues exactly once from the request site.
- An inner handler does not match `FileNotFound`; an enclosing matching handler
  receives it. With no matching handler, execution reports an unhandled effect
  with the request's source location.
- A matching handler returns a value without resuming. The protected computation
  does not continue after the request; the handler's value becomes the result of
  the whole handling expression.
- A handler attempts to resume twice, or to resume after it has returned. Both
  are errors in the proposed first slice. Test the diagnostic and ensure the
  computation cannot run twice.
- A protected resource is released on normal completion, runtime failure, and
  abandonment by a handler. Also test a request that is resumed: cleanup must
  not run prematurely while the protected computation is merely suspended. The
  agreed sections below define ordering and failure precedence.

## Scope of decisions

The agreements below define the intended initial synchronous behavior. Their
implementation feasibility and detailed diagnostics still need verification;
they do not claim that the feature is already implemented. Later async support,
error inspection and optimization are separate work.

## Agreed: handler lookup during a case and resumption

A selected handler is inactive while its case body runs. Requests from the case
body look for an outer matching handler, unless the case body installs another
handler itself. When the case resumes the protected computation, the selected
handler is active again for that computation. Thus another matching request from
the resumed computation can be handled by the same handler. If no active handler
matches a request, it is unhandled. Other agreed sections define the interface
and result; implementation remains open.

## Agreed: resume and handler results

Resume supplies the value of the suspended request and returns the result of the
resumed protected computation to the case body. The case may continue executing;
its final value becomes the handling expression's result. If the case returns
without resuming, its value is likewise the result and the suspended computation
is abandoned. Resume is one-shot and handler-scoped; detailed error reporting
remains open.

## Agreed: effect identity

Both named and unique Toss Symbols can identify effects. Matching uses the
existing Symbol equality rules: named Symbols with the same name match, while
unique Symbols match only the same identity. A library can share a named Symbol
for a conventional effect or expose a unique Symbol to avoid name collisions.
Handler registration and payload are specified below.

## Agreed: effect payload

Each effect request carries one payload, which may be any Toss value. Use Nil
when there is no additional information; use an Object when multiple fields are
needed. The effect's provider and consumers define the payload's meaning; the
language does not inspect its contents. Handler cases receive the payload and
resume capability. Invocation syntax remains undecided.

## Agreed: handler registration and delegation

A handler is a Toss Object whose Symbol keys identify effects and whose values
are case Blocks. Case lookup follows ordinary Object prototype delegation,
allowing inherited cases and overrides. If no slot matches, lookup proceeds to
the next outer handler. A matching non-Block slot is an error, as specified
below.

## Agreed: cleanup failures during ordinary completion or failure

If the protected computation fails and cleanup also fails, preserve the body
error as primary and retain cleanup errors as associated information. If the
body succeeds but cleanup fails, propagate a cleanup error. When multiple
cleanups are due, run all of them from inner to outer even if some fail, and
retain each failure. The error representation and display remain open, as do
failure precedence during effect abandonment or an unhandled effect.

## Agreed: cleanup failure on abandonment

When a case returns without resuming, abandon the suspended computation and run
its pending cleanups. If any cleanup fails, the handling expression fails rather
than returning the case value. Run all pending cleanups from inner to outer; the
first cleanup failure is primary and later failures are retained as associated
information. This does not decide how errors are represented or how cleanup
interacts with an unhandled effect or a case that itself fails.

## Agreed: unhandled effects and cleanup

An effect with no active matching handler becomes an unhandled-effect error.
Unwind the exited scopes and run their cleanups from inner to outer. Preserve
the unhandled-effect error as primary if cleanup also fails, retaining cleanup
failures as associated information. The error retains the effect identity and
request source location. The payload is retained but omitted from default
output.

## Agreed: handler failure and cleanup

If a case fails before resuming, abandon its suspended computation and run
pending cleanups. The case error remains primary; retain cleanup failures as
associated information. If the case fails after resume returns, propagate its
error without repeating the resumed computation or any completed cleanup.
Failure during resumption propagates through the resume call after cleanup.

## Agreed: resume lifetime and usage

Each resume capability may be called at most once and only while its handler
case invocation is active. A second call or a call after the case has returned
fails with a runtime error without running the suspended computation. Each
subsequent effect request receives its own capability. Asynchronous or
multi-shot resumption requires a separate design decision.

## Agreed: invalid handler cases

If case lookup finds a matching Symbol slot but its value is not a Block,
including Nil, report a runtime error rather than trying an outer handler. This
also applies to a slot inherited through the prototype. Only an absent slot
permits lookup to continue outward. Diagnostic details remain open.

## Agreed: effects during cleanup

In the initial synchronous version, performing an effect while cleanup is
executing is prohibited, including effects from indirect calls. A runtime check
must detect the request before dispatch or suspension. Treat the violation as a
cleanup failure: continue other pending cleanups and apply the agreed primary
and associated error rules. An effect handled entirely within a function called
by cleanup is also prohibited in this first version. Whether to allow effects in
cleanup later is a separate design decision.

## Agreed: unhandled-effect payload

An unhandled-effect error retains the original payload but does not include it
in default error output. How Toss code or a JavaScript host can inspect that
payload remains a separate decision; retaining it does not imply an inspection
interface in the initial release.

## Agreed: handler case arguments

Invoke a matching case Block with exactly two arguments in this order: the
payload, then the resume capability. Pass Nil as the payload when no extra
information is needed. The effect identity selects the case and is not passed as
an additional argument. Enforce the existing exact Block arity rule.

## Agreed: requesting an effect

Use `raise:with:` on the Effect object to request an effect, supplying its
Symbol identity and payload explicitly. Pass Nil for no additional information.
This name distinguishes effect requests from the existing Object `perform:`
message for dynamic message dispatch. Use the ordinary Prelude binding
`$Effect`; normal lexical shadowing applies. Its representation and the
implementation of suspension remain undecided.

## Agreed: applying a handler

Send `handleWith:` to a zero-argument Block with the handler Object as its
argument. Run that Block with the handler installed; normal completion returns
the Block's result, while requests follow the agreed lookup and case rules. To
protect an invocation requiring arguments, wrap the invocation in a
zero-argument Block. Exact error diagnostics and runtime implementation remain
open.

## Agreed: invoking resume

A case invokes its resume capability with `value:` and one argument. That
argument becomes the result of the suspended `raise:with:`; the `value:` call
returns the result of the resumed computation. Whether the capability is
represented as an ordinary Block or a dedicated value is an implementation
question; its agreed one-shot and lifetime restrictions apply either way.

## Agreed: ensure result

Send `ensure:` to a zero-argument protected Block with a zero-argument cleanup
Block. If both complete normally, the expression returns the protected Block's
result and ignores the cleanup Block's result. Cleanup failure follows the
agreed error precedence rules. Effect-related behavior remains subject to the
other decisions in this document.

## Agreed: mutable handler objects

Look up the matching case against the handler Object and its current prototype
chain each time an effect is raised. Mutations after `handleWith:` starts affect
later lookups; do not snapshot the cases. A case already selected continues
executing even if its slot is subsequently changed. The next request performs a
fresh lookup.

## Agreed: handler validation

Validate that the handler is a Toss Object before invoking the protected Block.
Reject Arrays, Blocks, JS references and other non-Objects without running the
protected Block. Do not validate all slots in advance; validate a selected case
when its effect is raised, reflecting the Object's current state. This does not
change ordinary evaluation of the receiver and arguments before the message is
invoked.

## Agreed: initial execution boundaries

The initial version supports synchronous Toss call chains. An effect must not
cross a JavaScript call boundary or an `%await` suspension to reach a handler;
report a clear error rather than incorrectly invoking a handler across either
boundary. Whether a handler installed and fully used inside a Toss callback
invoked by JavaScript is feasible will be checked in the prototype. This scope
does not decide how async Blocks interact with handlers in a later version.

## Agreed: request argument evaluation and validation

Evaluate the receiver and arguments using ordinary message-send order before
validating the effect identity. If argument evaluation fails, stop normally;
otherwise reject a non-Symbol identity after payload evaluation, without raising
an effect or invoking a handler. Earlier side effects remain visible.

## Agreed: handler and prototype lookup order

Search each active handler's own slots and prototype chain before moving to the
next outer handler. Consequently, an inherited case in an inner handler wins
over an own case in an outer handler. An invalid matching slot is an error,
including when it is inherited; it does not fall through outward.

## Agreed: handler case receiver

Invoke a selected case as a method with the handler Object as its receiver.
Within the case, `self` is the actual handler Object passed to `handleWith:`,
even when the case slot is inherited. The case retains its lexical environment
and receives the payload and resume capability as its two explicit arguments.
Parent calls follow the agreed ADR-36 rules; prototype feasibility remains to be
verified.

## Agreed: ensure validation

After ordinary evaluation of the receiver and argument expressions, validate
that both the protected receiver and the cleanup are zero-argument Blocks before
invoking the protected Block. Reject a non-Block or wrong arity without starting
the protected computation. Effects of evaluating the expressions remain visible.
Async Block eligibility is a separate decision.

## Agreed: async protected and cleanup Blocks

The initial synchronous `handleWith:` rejects an async protected Block before
running it. Synchronous `ensure:` likewise rejects an async protected Block or
async cleanup Block before running the protected computation. A later async
design must define completion, await, failure and cancellation separately.
Handler case Blocks are a separate decision.

## Agreed: async handler cases

The initial synchronous handler rejects an async case Block when selected,
before invoking its body. As with other case validation, do not inspect every
slot at handler installation time. Async cases require a separate design for
completion and resume lifetime.

## Agreed: synchronous Blocks returning async results

When a synchronous protected Block returns an async result, synchronous
`ensure:` runs cleanup as soon as that Block returns and then returns the async
result; it does not wait for async completion. Synchronous `handleWith:` also
ends its scope when its protected Block returns and returns the async result. An
async Block invocation is itself a boundary: even before its first await, an
effect cannot cross it to an enclosing synchronous handler. Whether a
synchronous handler installed and fully used within the async Block can work
will be checked in the prototype.

## Agreed: parent calls from handler cases

A selected handler case has ordinary method parent-call context. `%super(...)`
uses the existing ADR-36 rules, including the exact Symbol key, selected slot
owner, actual handler receiver, live parent lookup, and explicit arguments. A
case may pass its payload and resume capability to the parent case; sharing the
capability does not relax its one-shot lifetime. Prototype feasibility remains
to be verified.

## Agreed: failure of a resumed computation

If the resumed computation fails, run its pending cleanups before propagating
the error through the `resume value:` call. Preserve cleanup failures according
to the agreed precedence rules. A failed resume is still consumed and cannot be
called again. With no language-level exception handling, the error ordinarily
propagates out of the case; future exception handling is a separate decision.

## Agreed: independent handler installations

Each `handleWith:` invocation creates a distinct handler installation even if
multiple invocations use the same Object. While a selected case runs, the
selected installation is inactive; an outer installation using the same Object
remains eligible. The installations reference the same mutable Object, so each
lookup sees its current slots and prototype. Skipped inner installations are
suspended as described below.

## Agreed: skipped inner handlers during a case

When an outer handler is selected, handler installations inside it belong to the
suspended computation. They are not active while that outer case body runs.
Requests made by the case body search beyond the selected handler (plus any
handlers explicitly installed inside the case body). Resuming reinstates the
suspended inner installations and the selected installation for the resumed
computation. This rule also applies when installations share one Object.

## Agreed: nested handler abandonment

If a case raises another effect and an outer handler returns without resuming,
abandon all suspended computations within that outer installation, including the
case body and the computation it was handling. Run pending cleanups in
inner-to-outer order and invalidate their outstanding resume capabilities.
Cleanup failures follow the agreed abandonment precedence rules.

## Agreed: handler case validation failure

If a selected case is not a Block, is async, or has the wrong arity, report a
runtime error before executing its body. Abandon the suspended protected
computation and run its pending cleanups. Preserve the validation error as
primary and retain cleanup failures as associated information. Earlier effect
request argument evaluation is not rolled back.

## Agreed: resume values

Resume accepts any Toss value and supplies the same value as the result of the
suspended request, preserving identity. An async result or JS reference is
passed as a value; resume does not implicitly await or convert it.

## Agreed: synchronous calls across Toss modules

A synchronous Toss function may raise an effect handled by an enclosing Toss
handler in another module. Handler selection follows the dynamic call chain, not
the module where the function was defined. JavaScript and async boundaries
remain subject to their own restrictions. Effects during module initialization
and their interaction with module caching are a separate decision.

## Agreed: effects during module initialization

A handler may resume an effect raised during synchronous module initialization;
if initialization then finishes successfully, cache its export normally. If a
handler abandons that initialization, record an initialization failure and do
not retry it on subsequent imports; later imports report that initialization was
interrupted. The original handling expression may still return the case's value
if cleanup succeeds. Preserve the existing cache semantics for completed
initialization failures; error representation remains to be specified.

## Agreed: re-entry into suspended module initialization

An initialization suspended by an effect remains in the running state. An import
of that module from its handler case fails with the existing initialization
re-entry error; it does not expose partial exports or start a second
initialization. If that error escapes the case, apply the agreed handler
failure, cleanup and module initialization failure rules.

## Agreed: REPL handler scope

A REPL session may retain handler Objects as ordinary values across cells, but a
`handleWith:` installation ends with its protected call and does not persist
into a later cell. On failure, run pending cleanups and end the installation;
outstanding resume capabilities cannot be used in a later cell. Earlier side
effects remain according to the existing REPL rules.

## Agreed: Prelude Effect value

The Prelude binding `$Effect` supplies a dedicated value whose `raise:with:`
implementation is not user-replaceable. The binding itself follows ordinary
lexical name lookup and can be shadowed; sending a message to a shadowing value
follows that value's ordinary behavior. The value representation and runtime
implementation remain open and must be checked against the Object model.

## Agreed: cleanup returning an async result

A synchronous cleanup Block may return an async result as an ordinary value;
`ensure:` ignores the cleanup result and does not wait for it. Later async
failure is not a synchronous cleanup failure. Awaiting resource release requires
a separately designed async cleanup feature.

## Agreed: handler cases returning async results

If a synchronous case returns an async result without resuming, abandon the
suspended computation, run pending cleanups, and return the async result without
waiting, provided cleanup succeeds. The case has returned, so a resume saved for
later async work is no longer valid. A case that already resumed likewise
returns an async result as an ordinary value. Later async failure is not a
synchronous case failure.

## Agreed: runtime errors are not effects

Existing Toss runtime errors are not automatically converted into effect
requests. An explicit `raise:with:` using `#Error` is an ordinary effect, but
does not intercept unbound-name, wrong-arity or other existing runtime errors.
Runtime errors propagate under existing rules, with `ensure:` cleanup as agreed.
Language-level exception handling remains a separate design.

## Agreed: extent of resumption

Resume continues the suspended computation through nested calls and returns only
when the protected Block of the selected `handleWith:` completes (or fails). Its
result is the Block's result, not merely the result of the function that raised
the effect. Run cleanups as their respective scopes exit before resume returns.
Effects raised during that computation follow the agreed deep handler rules.

## Agreed: resume execution boundaries

In the initial synchronous version, invoking an outer resume capability across
an async Block invocation or JavaScript call boundary is an error, even if its
case is still active and the async Block has not yet reached its first await.
Whether an installation and its resume can be used entirely inside such a
boundary is to be verified in the prototype.

## Agreed: module abandonment with cleanup failure

If a handler abandons module initialization and cleanup within that
initialization fails, the initial handling expression propagates the cleanup
failure under the abandonment rules. Cache an initialization-interrupted error
for the module, retaining failures of its initialization cleanups as associated
information. Later imports report the cached interruption without rerunning the
initializer or cleanups. The cache error and initial propagated error have
different purposes and need not be the same error object.

## Agreed: module failure caused by a handler error

If an effect raised during module initialization reaches a handler whose case
fails, cache the case error as the module's initialization failure. Run pending
cleanups and retain their failures as associated information. Subsequent imports
rethrow the same cached error, consistent with ADR-37, without retrying. This
differs from a case that returns normally without resuming, which records an
initialization-interrupted error.

## Agreed: resume while a case is suspended

A case's resume capability cannot be invoked while that case is suspended by
another effect, even if the capability was passed to an outer case. Report an
error. If the outer case resumes the suspended case, its capability becomes
usable again, subject to the existing one-shot and boundary restrictions. Normal
calls within the running case, including explicit parent calls, are not by
themselves a suspension.

## Agreed: cleanup failure diagnostics

Default CLI and REPL diagnostics display the primary error first, followed by
associated cleanup failures in their execution order, inner to outer. Include
available source locations for each failure. Continue to omit an unhandled
effect's payload from default output. Exact formatting and programmatic error
inspection are separate decisions.

## Agreed: diagnostics for handler failures

Keep the actual failing handler or resumed-code location as the primary error
location. Default diagnostics also identify the effect and request location
being handled, including nested handling context when applicable. Do not show
payloads by default. Exact presentation, retained diagnostic representation and
programmatic inspection remain open.

## Agreed: resume and JavaScript conversion

The initial version rejects conversion of a resume capability to JavaScript,
including `asJSCallback`, even if its internal representation is a Block. This
does not alter conversion of ordinary Blocks or passing JS references as resume
values. A later interop design may revisit the restriction.

## Agreed: resume misuse diagnostics

Report a resume misuse at the invalid invocation location, including repeated,
expired, suspended-case and unsupported-boundary calls. Where available, include
the original effect identity and request location as context without displaying
the payload. Detailed diagnostic formatting remains open.

## Agreed: resume argument evaluation

Evaluate the receiver and argument under ordinary message-send rules before
checking resume validity. If argument evaluation fails, propagate that error; do
not invoke or validate resume. Earlier side effects remain visible.

## Candidate synchronous semantics for the first prototype

The following is a concrete proposal to test, not a committed language contract.
The pseudocode names describe concepts; they do not define syntax.

- A request has an effect identity, a payload, and a source location. Identity
  and payload follow the agreements above. A handling expression installs a set
  of cases only while running its protected computation.
- Find the nearest active matching case in the dynamic call chain. A nonmatching
  handler is skipped, not removed from the suspended computation. A missing
  match raises an unhandled-effect error at the request site.
- Invoke the selected case with the payload and a one-shot resume capability.
  While its case body is running, that handler is not active for requests made
  directly by the case body: those requests can be handled by an outer handler.
  Explicitly installed handlers inside the case body still apply.
- Calling resume with a value makes the suspended request return that value. The
  protected computation continues with its handler active again (a deep
  handler), including handlers skipped during the original lookup. A subsequent
  request can therefore be handled normally, including by the same handler.
- Resume returns the result of the resumed computation to the case body. The
  case body may then do more work; its final result is the handling expression's
  result. If it returns without resuming, that result is also the handling
  expression's result and the suspended computation is abandoned.
- Each individual resume capability can be invoked at most once and only during
  its case invocation. A second or late call is a runtime error; it must never
  execute the suspended computation again. A subsequent request has its own
  capability. Runtime failures propagate rather than silently becoming effect
  requests.

For example, if the protected computation requests a number and then adds 1, a
case that resumes with 10 receives 11 from resume. If it then returns 22, the
handling expression produces 22. A later request made by that same resumed
computation is handled by the installed handler again. By contrast, a request
made directly inside the case body is offered to an outer handler.

## Candidate cleanup behavior

For an `ensure:`-like protected computation, evaluate the cleanup once when that
computation actually exits normally, fails, or is abandoned. Suspending to
invoke a handler is not an exit. When a handler declines to resume, unwind
abandoned scopes from inner to outer before the handling expression completes.
If a handler resumes, cleanup belonging to the resumed computation runs when
that scope exits, before resume returns to the handler. Cleanups outside the
handling expression run only when their own scopes exit.

A useful observable trace for a resource inside the handling expression is:
`acquire, request, handler-before, resume, body-end, cleanup, handler-after`.
Without a resume it is `acquire, request, handler, cleanup`. These traces are
proposed acceptance cases; they do not settle whether abandonment cleanup runs
immediately when a case returns or through another internal mechanism.

Cleanup failure precedence and the initial prohibition on effects during cleanup
are specified above. Verify these rules against any independently implemented
`ensure:` before shipping it.

## Decisions needed before a public interface

- Detailed error representation and diagnostics, including how retained errors
  and unhandled-effect payloads may eventually be inspected.
- How to preserve cleanup and errors across aborts, nested handlers and host
  boundaries, including errors thrown during cleanup.
- Whether a synchronous-only initial feature can provide clear diagnostics at
  unsupported async and JavaScript callback boundaries, without silently
  violating the semantics above.

## Feasibility check: JavaScript generators

A small local JavaScript probe confirmed that `yield*` can propagate a request
through nested generator functions, resume it with a value, and abandon it via
`return()`. It also confirmed the central integration problem: calling a
generator from an ordinary JavaScript function returns an iterator, not the Toss
value the caller expects. Propagating suspension therefore requires cooperation
or transformation across intervening calls; changing only the request and
handler implementations is insufficient for that approach.

A second standalone JavaScript probe confirmed the agreed basic traces for a
generator protected by `try/finally`: resumption completed the body and cleanup
before returning its result to the handler, and `return()` ran cleanup on
abandonment. It did not test nested handlers, Toss dispatch, module caching,
error aggregation, async or JS interop.

This is evidence about one mechanism, not a Toss prototype or proof that another
approach is impossible. Investigate generator conversion, CPS/state machines,
and constrained explicit suspension against the same scenarios. Account for
handler nesting, cleanup, message dispatch, callbacks into JS, async
interaction, code size and unaffected code paths. In particular, assess what
happens when a Toss computation enters host JavaScript and that JavaScript calls
back into Toss; a native JS stack cannot simply be captured by these mechanisms.

## Long-term candidate: static specialization

This is a medium- to long-term investigation, not part of the initial design or
a gate for the synchronous prototype. No production-only optimization is
assumed.

An idea for evaluation, not a design premise: development could use a general
runtime implementation while a production compiler specializes handlers that it
can prove statically. Both modes must preserve the same observable behavior,
including handler selection, evaluation order, resumption, cleanup and errors;
unknown cases must retain a correct general implementation. Optimization can
also apply during development when useful; mode alone is not evidence that a
handler is statically known.

This resembles compile-time macro expansion in its potential to remove runtime
indirection, but a runtime handler can depend on values and dynamic call paths.
Ordinary syntax expansion cannot by itself capture a continuation across
arbitrary calls. Toss's dynamic message dispatch, mutable objects, separate
modules and JS callbacks may prevent a compiler from proving which handler or
callee applies. A handler selected statically does not by itself eliminate the
cost of preserving the continuation. ADR-0's optional type annotations do not
currently provide the effect information used by some published optimizers.

Published work suggests specialization is technically plausible:
[Efficient
compilation of algebraic effect handlers](https://doi.org/10.1145/3485479) uses
type-and-effect information and function specialization to reduce handler
overhead in an Eff-to-OCaml compiler; it is not a result for Toss or JS. The
[Tracing Just-in-Time Compilation for Effects and Handlers](https://se.informatik.uni-tuebingen.de/publications/gaissert2025tracing.pdf)
paper describes ahead-of-time restrictions including statically known handlers
and separate compilation. These results motivate an experiment, not a promise of
low overhead for Toss.

If a general prototype exists, compare it with a specialized variant on the same
programs: a known local handler, a handler selected at runtime, nested handlers,
a handler crossing a module call, and a JS callback boundary. Check result
values, side-effect and cleanup order, unhandled effects and source locations in
both modes. Measure compilation time, generated size and runtime, including a
program with no effects. Reject specialization as an initial implementation
strategy if it requires changing semantics, cannot fall back for unknown cases,
or its complexity outweighs measured gains. Reconsider later if representative
use cases and measurements justify it.

## Candidate: standard libraries backed by effects

Investigate standard Toss interfaces for time, networking, file access and
similar host services, with operations represented as effect requests and host
behavior supplied by handlers. Test handlers could supply deterministic values
or an in-memory implementation. This is an idea, not an accepted interface,
default-handler decision, security boundary or implementation commitment.

Start with a synchronous clock operation as an end-to-end candidate. A handler
can call a host API and resume after that call returns; this is distinct from
letting an effect or resume cross a JS callback boundary. Specify identity,
value representation, test and host handlers, and missing-handler behavior in
the prototype before generalizing.

For HTTP and file I/O, evaluate the constraints of the initial synchronous
handler design separately. A handler may synchronously resume with an async
result which callers later await, but the handler installation then ends; it
does not automatically handle asynchronous completion, rejection, retries or
cancellation. Do not claim parity with async effect middleware without a
separate design. Define host portability, errors and authorization before adding
production adapters. Direct `%js` or other host access bypasses these
interfaces, so handlers alone are not a sandbox.

Static effect tracking in a checker separate from the compiler is a possible
future investigation, deferred independently of the runtime and library design.
Do not assume a checker, a static guarantee, or a particular compiler/checker
architecture in the initial prototype.

## Deferred investigation: local mutation and static checking

Explore region-like local mutation and an optional static checker separately
from the runtime handler design. Neither a region feature nor a checker,
analysis architecture, effect taxonomy or annotation syntax is decided. Flix
regions statically track region-associated mutable values and reject escaping
references; see [Flix regions](https://doc.flix.dev/regions.html).

Candidate scenarios include local mutation used to construct a result; returning
a region-owned mutable value; saving it through a captured closure, an outer
Object, a callback or a JS reference; and mutating pre-existing input. Contrast
these with copying or freezing data before return, accounting for nested values
and aliases. Reading externally mutable values and unknown method calls also
need analysis. Runtime `ensure:` and handlers do not themselves prove that
references cannot escape or that a computation is pure.

Treat arbitrary `%js` conservatively in any future checker: nondeterminism alone
may be too narrow because JS can mutate external state, perform I/O, retain
references, invoke callbacks or throw. `%jsImport` initialization and other host
boundaries also need consideration. A hypothetical unknown or host effect could
conservatively include such behavior; its exact meaning is open. An explicitly
unchecked assumption may be explored separately, but checker results that depend
on it should not be represented as unconditional proofs. Such assumptions must
not silently justify transformations that change program behavior; whether any
optimization may use them is a separate decision. Flix itself documents
[unchecked effect casts](https://doc.flix.dev/unchecked-casts.html) as an unsafe
facility.

## Generator experiment: nested handlers

Run `node experiments/effects-one-shot.mjs` to exercise an isolated JavaScript
generator model. It verifies resumption returning the protected result to the
case, cleanup before the case continues, nested case abandonment with inner to
outer cleanup, and repeated or expired resume rejection. The generator handler
and every participating call cooperate explicitly using `yield*`.

This is not generated Toss code and does not establish integration feasibility.
It does not implement dynamic Object/prototype lookup, `self`/`%super`, module
caching, locations, error aggregation, or async or JS boundaries. In particular
native `finally` failure can replace an earlier exception, contrary to the
agreed error aggregation rules; a production implementation needs explicit
handling. Cleanup that yields is rejected by this experiment. Compare this
approach with other continuation representations before drawing performance
conclusions.

## Experiment: existing Toss `map:` boundary

Run `deno run --allow-run experiments/effects-codegen-boundary.mjs`. The probe
compiles a real Toss `map:` program and runs the generated JavaScript. The
unmodified output prints the two callback values and then the first result.
Changing only that generated Block to a generator causes neither callback body
to run and prints `[object Object]` for the iterator stored as the first result.
The probe patches only an in-memory experimental artifact; it does not change
the compiler or runtime. It demonstrates silent incorrect behavior, not merely a
type mismatch or a failure diagnostic.

The current path is generated Block -> `invokeBlock` (`Reflect.apply`) -> `send`
-> generated expression; `map:`, `filter:`, `reduce:with:`, Boolean branches and
other Prelude operations invoke Blocks and immediately consume their returned
values. A generator approach must propagate suspension through all participating
callers and these Prelude operations, preserving evaluation order, exact arity,
method receiver and parent-call context, source positions, cleanup and module
initialization. A synchronous generator cannot directly capture and resume an
arbitrary intervening JavaScript stack. Supporting a separately compiled runtime
and REPL also requires a coherent protocol at those boundaries. These are
implementation obligations, not proof of a specific transformation strategy.

Selective CPS or a state-machine translation could instead represent the rest of
each computation explicitly and cooperate with message dispatch and Prelude
callbacks. It shares the need to propagate suspension through participating
calls and to delimit host/async boundaries; it does not gain static knowledge of
dynamic calls for free. Whole-program conversion may be simpler to reason about
but could affect code size, runtime overhead and interop. Selective conversion
needs a sound way to handle dynamically selected methods and Blocks without
silently treating a suspending result as an ordinary Toss value.

The next experiment should drive the same callback-under-`map:` scenario with an
actual effect through a transformed call path, then test a dynamically selected
inherited method and cleanup on abandonment. Compare generated size, ordinary
no-effect behavior and overhead with the baseline. Neither generator nor CPS is
selected by this investigation.

The generator model also includes a manually transformed analogue of `map:`: it
snapshots the input and delegates to each callback. The experiment confirms that
requests can resume twice on separate iterations with left-to-right order, and
that abandonment on the first iteration prevents the second callback and runs
enclosing cleanup. This is not the existing Prelude implementation and it does
not yet translate Toss expressions or dynamically dispatched methods.

A further manually transformed dynamic-send probe selects a Symbol-keyed
inherited generator method with `Reflect.get`, preserves the child receiver via
`Reflect.apply`, and resumes an effect inside the method. It checks the receiver
idea only: it does not exercise Toss method lookup, `%super`, error locations or
the actual runtime.

## Experiment: cooperative map in generated Toss output

Run `deno run --allow-run experiments/effects-codegen-map.mjs`. This probe
compiles a real Toss `map:` program and patches the generated JavaScript in
memory: it changes the callback and `map:` to generators, injects a synthetic
request into the callback, and adds a fixed experimental driver around `map:`.
The driver resumes each request with twice its payload. The generated program
prints `2`, `4`, `2`, demonstrating the cooperative callback path.

The same patch fails for an ordinary callback because the generator `map:` tries
to delegate to a plain value. A further experiment explicitly marks the
transformed callback in a WeakSet and branches in `map:`; both the transformed
and ordinary callback then produce their expected output. The explicit marker
avoids identifying an arbitrary Toss result as a generator by its properties.

This hard-coded driver is not `handleWith:` and does not propagate a request
through the caller of `map:`. The probe injects a JavaScript yield, not a Toss
`raise:with:`. It does not solve dynamic methods, callbacks captured in Objects,
parent calls, cleanup, errors, module initialization, host boundaries, or effect
propagation through other Prelude operations. Its string patches deliberately
assert their expected shape, so compiler changes cause the probe to fail rather
than silently changing the experiment. No compiler or runtime source is changed.

## Experiment: suspended handler lifetime

The generator model initially permitted an outer handler to invoke the resume
capability of an inner case suspended by another request. A negative assertion
reproduced the violation. The model now tracks whether each case is suspended
while relaying a request and rejects use of its resume until that case is
resumed. The experiment checks both rejection while suspended and successful use
after the outer handler resumes the case. This bookkeeping remains isolated
experimental machinery, not a Toss runtime implementation.

## Experiment: preserving cleanup failures

Run `node experiments/effects-cleanup-errors.mjs`. A naive JavaScript
`try/finally` demonstrably replaces a body failure with a cleanup failure. An
isolated generator experiment explicitly retains cleanup failures alongside the
original Error object and confirms inner-to-outer ordering; it also confirms
that abandonment with two cleanup failures reports the first and retains the
second.

The experiment accepts Error objects only and associates metadata using a
WeakMap. That is not an adequate production error model: JavaScript can throw
arbitrary values, the same Error object can be reused across separate failures,
and Toss diagnostics, causes and external runtime interfaces need defined
behavior. It does not integrate with the handler prototype, module caching or
CLI/REPL diagnostics. A per-failure representation and treatment of foreign
thrown values must be designed before integrating this technique.

The cleanup probe also compares a per-failure envelope. It keeps separate
cleanup records when the identical Error object is thrown in two independent
executions, and can retain primitive thrown values including `undefined`. Unlike
attaching metadata to a reused Error, this models a failure occurrence. The
experiment throws the envelope internally, however, so it is not drop-in
compatible with Toss: ADR-37 requires later imports to rethrow the same cached
error, while ADR-38 and JS callback tests preserve the original JS thrown value
as `cause`. A future boundary design must preserve these observable identities
and diagnostic data. The experiment does not establish how to expose associated
cleanup failures without losing either identity or failure-specific metadata.

## Experiment: module initialization boundary

Run `deno run --allow-run experiments/effects-module-boundary.mjs`. A real
compiled two-module program imports the same module twice; normally it prints
its initialization side effect once and returns the cached export twice. When
only the generated imported-module initializer is changed into a generator, the
actual initializer body never executes: the existing `initializeModule` caches
the iterator as a successful export. Both imports receive that iterator.

Therefore transforming module bodies alone silently breaks the existing cache
contract. A cooperative implementation must retain the `running` state while
suspended, commit the export only after successful completion, and record
failure or interruption on the appropriate exits, including cleanup failure.
This experiment does not implement those transitions, test module re-entry while
suspended, or choose a continuation representation.

## Experiment: module state while suspended

Run `node experiments/effects-module-state.mjs`. This isolated cooperative state
model verifies that an initializer remains running during suspension, rejects
re-entry, caches the completed export, records abandonment as an interruption,
and rethrows the same original error after an ordinary failure.

An additional test first exposed a distinction lost by a naive generator
`catch`: if cleanup fails during generator `return()`, the cache incorrectly
records that cleanup failure as an ordinary initialization failure. The model
now explicitly marks a delegated `return()` as abandonment: it propagates the
cleanup failure to the current caller but caches a separate interruption with
that failure attached. The delegated-caller case is also tested.

This mechanism is only a small state model. It does not integrate with generated
Toss modules or handlers, represent multiple cleanup failures, implement the
full error-envelope design, handle arbitrary iterator protocols or verify
async/JS boundaries. It assumes cleanup itself cannot suspend and does not
establish a production API.

## Experiment: cooperative generated module initialization

Run `deno run --allow-run experiments/effects-codegen-module.mjs`. This patches
an actual compiled two-module artifact in memory: both initializers, import
calls and `initializeModule` cooperate as generators, and a fixed test driver
handles one synthetic request in the imported initializer. The test checks that
while suspended the imported module is running, a re-entrant import fails, and
after resumption the module initializes once and both imports obtain its export.

A second execution makes the driver abandon the suspended computation. The
naively transformed real module runtime incorrectly keeps the module marked
running, so a later import reports re-entry instead of interruption. This
negative result motivates an explicit abandonment transition such as the
isolated state-model experiment, but that model has not been integrated here.
The probe does not implement Toss effect syntax, handlers, cleanup error
aggregation, async/JS boundaries or a general compiler transformation.

The generated-module probe additionally patches `initializeModule` with a
`finally` transition from running to a cached interruption on abandonment. For
an initializer with no failing cleanup, the subsequent import then reports an
interruption, while the same patch preserves normal completion and caching. This
is not a complete solution: an initializer cleanup failure enters the existing
`catch` before `finally` and still needs explicit abandonment context and error
aggregation. No production generator transform is introduced.

The same generated-module probe now also tries an explicit abandonment-aware
iterator adapter. With one synthetic cleanup failure in the imported module, the
original caller receives that cleanup error and a later import receives a cached
interruption carrying the cleanup failure. This is a patched generated artifact,
not a general compiler or runtime implementation. The experiment uses one
JavaScript Error and does not implement nested cleanup aggregation, stable
public diagnostics, actual Toss handlers, or async and JS boundary enforcement.
A no-cleanup-failure run also confirms normal completion with this adapter.

## Experiment: explicit JS and async boundaries

Run `node experiments/effects-boundaries.mjs`. A small lookup-only model resets
its dynamic handler context on entry to an explicit boundary and restores it on
return. The tests check that an outer handler is unavailable inside the
boundary, a handler installed locally is available, and the outer context is
restored afterward. An async Block analogue checks the boundary both before and
after its first await, including a locally installed synchronous handler.

This is not a continuation implementation or Toss integration. The boundary is
called manually, so it does not establish that all JS callback, async Block,
REPL and host entry points can be identified or instrumented. The toy process
uses global mutable state and provides no guarantee for overlapping execution,
multiple runtime instances, or arbitrary host re-entry. Effects intentionally
fail as unhandled in this model; the agreed distinct boundary diagnostics and
resume restrictions remain unimplemented.

The abandonment-aware generated-module adapter was also exercised with a failure
after resumption: the first caller receives the original Error and a later
import rethrows the same Error object. This checks the existing ordinary
module-failure identity contract for that synthetic path only; it does not
resolve failure-specific cleanup metadata or JavaScript boundary conversion.

## Experiment: generated inherited method and parent call

Run `deno run --allow-run experiments/effects-codegen-super.mjs`. A real Toss
program defines a child override that invokes `%super`, and its inherited parent
method reads `$self` from the actual child receiver. The baseline prints 10. The
in-memory patch transforms those two Blocks, explicitly delegates the parent
call, injects a synthetic request in the parent and drives it at the top-level
send. Resuming with twice the argument produces 13, confirming receiver and
parent lookup on this one generated path. Removing delegation at `%super` causes
the returned iterator to be treated as a normal Object and fails.

This is a fixed source-specific patch, not a general effect transformation. It
does not cover Symbol-keyed handler cases, selected-slot-owner changes during
suspension, all dynamic sends, cleanup, async/JS boundaries, or handler lookup.
The handler is a fixed test driver, not Toss `handleWith:`.

## Experiment: case mutation while suspended

The one-shot generator model now checks a handler case that suspends while an
outer case replaces its registration. When the outer case resumes it, the
already-selected case finishes; a subsequent request selects the new case. This
exercises live case lookup and preserves the selected callable in a Map-based
model. It does not test Toss Object prototype mutation or actual generated
handler dispatch.

## Experiment: generated Toss Block as a handler case

Run `deno run --allow-run experiments/effects-codegen-handler.mjs`. A real Toss
source creates a handler Object inheriting a Symbol-keyed case Block. In a
fixed-shape in-memory rewrite, `map:` and its callback cooperate with a
synthetic request, and a small experimental driver selects the case through
Toss's actual `slotOwner` and `invokeSlot`. The case receives payload and
resume, reads `$self` from the actual child handler Object, and resumes. The
resulting mapped values are 11 and 12.

The source does not use implemented `raise:with:` or `handleWith:`: the test
inserts a JavaScript yield and automatically installs one hard-coded handler
around the `map:` dispatch. Both relevant Toss Blocks and the `resume` call are
specifically rewritten. The original driver handles synchronous resumption only;
it does not support outward requests from a case, unhandled-effect diagnostics,
async/JS boundaries or general dispatch. Its recursive driver has no proven
stack or performance properties. This is one concrete integration path, not an
accepted implementation strategy.

The generated handler probe additionally constructs an alternate case that
returns without resuming. A synthetic `finally` around the patched `map:` runs
when the driver explicitly closes the suspended iterator, and the handler value
is returned afterward. A failing cleanup propagates instead of that value. This
is one synthetic cleanup; it does not implement Toss `ensure:`, failure
aggregation, cleanup during handler failure, or interruption of an imported
module. The initial success path and the alternate abandonment path use separate
in-memory patches.

## Experiment: stack use across repeated resumptions

The generated-handler probe includes a stress case with 10,000 sequential
requests. On the tested Deno runtime, its recursive driver overflows the JS call
stack. A separate in-memory driver for cases that resume exactly once stores
pending case generators in an explicit Array and completes the same case. A
second check confirms that code after resume runs in nested order before the
final mapped values are returned.

This is a feasibility comparison, not a benchmark or a general implementation.
The iterative driver does not implement cases that abandon, cleanup, case-raised
effects, expired capabilities, module initialization, boundaries or diagnostic
rules; it uses a synthetic request protocol that would need robust internal
identity and validation. It allocates pending case frames and no memory or
performance measurements have been made. The observed stack limit is specific to
the tested runtime, not a language guarantee.

The generated-handler probe extends the explicit pending-case stack with a
limited non-suspending abandonment path. It tests immediate abandonment,
abandonment on a later request while an earlier case is waiting, cleanup
execution, and 10,000 successful resumptions. A negative case showed that a
cleanup failure originally skipped cleanup of an earlier suspended case. A
further experimental variant throws that failure into the pending case
iterators, causing their synthetic `finally` blocks to run in order.

A remaining negative case has both the abandoned computation's cleanup and an
outer handler cleanup fail: native generator unwinding replaces the first error
with the second, contradicting the agreed primary-error rules. The variant does
not integrate the separate per-failure error model and is not production-ready.
It also does not cover handler-originated effects, arbitrary errors while a
handler is running, invalid/expired resume calls, real Toss `ensure:`, module
state, or JS/async boundaries. These tests use synthetic JavaScript `finally`
and source-specific in-memory rewrites.

The generated-handler probe combines the explicit pending-case unwind with a
per-failure envelope for the synthetic two-cleanup failure. It retains the
original cleanup failure and the outer handler cleanup failure, and the 10,000
request success case still completes. The probe prints the associated error
separately to prove retention; its output order is not the agreed diagnostic
format.

This narrow technique treats a new error produced while injecting an earlier
failure as an associated cleanup error. That assumption is only justified by the
synthetic test and is not generally established for arbitrary handler code or
host callbacks. The temporary envelope also changes the thrown value within the
experiment. It does not establish JS cause identity, per-module caching, actual
Toss `ensure:`, exact source locations or a supported error interface.

The generated-handler probe also compiles a second Toss source where a child
handler overrides the Symbol-keyed case and calls `%super($payload, $resume)`.
With both cases and the parent call patched to cooperate, the inherited case
still sees the child as `$self`, resumes each request and produces 11 and 12.
This uses existing runtime `invokeSlot` and `parentSend` behavior; it remains a
source-specific patch with a fixed handler driver, not the public feature.

## Experimental AST compiler and runtime slice

`experiments/effects-compiler.ts` uses the actual Toss syntax reader and macro
expander and generates a cooperative generator program from a restricted set of
AST forms. It reuses the existing emitted runtime for lexical Environments,
Object slots, Block arity, method receiver and parent-call context, while an
experimental adapter in `experiments/effects-runtime.ts` handles effect
requests, `handleWith:`, Block calls, Boolean branches, repetition, Array
`map:`, `filter:` and `reduce:with:`, `%extend` and synchronous `ensure:`. It
introduces no public compiler option or production Prelude. Run
`deno run --allow-run experiments/effects-compiler-test.mjs`, or the
`effects:probe` task, to check actual Toss source for dynamic method calls, map,
nested handlers, resumption and abandonment, inherited handler cases, `%super`,
invalid resume lifetimes, source position, evaluation order and unhandled
effects.

This is a vertical slice, not the complete agreed design. It deliberately
rejects quotation at runtime and unsupported AST forms. It permits only a small
set of Prelude messages; unsupported messages fail rather than silently invoking
a callback without propagating suspension. Cleanup failures are recorded
experimentally using a WeakMap keyed by Error, which cannot correctly
distinguish independent failures that reuse the same Error and does not handle
arbitrary thrown values. Its diagnostic formatting is provisional. JS and async
boundary behavior is experimental; it does not yet implement REPL integration,
separate runtimes, tree-shaking, or a full set of diagnostics. The `Effect`
binding and syntax are experimental and must not be treated as released
behavior. These limits are deliberate until the runtime protocol and failure
representation are integrated and verified.

The AST compiler slice now uses an explicit pending-case stack within each
handler rather than recursively invoking the driver on resume. Its Toss-source
scenarios include 10,000 sequential resumptions, a later handler abandoning
through an earlier resumed case, cleanup of a suspended case and body, and
nested cleanup failures. This does not establish bounded stack use for deeply
nested Blocks or nested `handleWith:` scopes, nor does it solve the weakly keyed
error metadata, module, interop or unsupported syntax limitations above.

`experiments/effects-compiler-conformance.mjs` compares 34 supported programs
without effect requests against the production compiler, including lexical
bindings, evaluation order, collection snapshots, inherited methods, `%super`,
extension, and selected runtime failures with their source locations. It checks
observable output and diagnostics for those cases only, not general equivalence.
It is included in `deno task effects:probe`.

The AST/runtime slice now constructs an unhandled-effect error before closing
the suspended computation, retains effect identity and payload on that error,
and reports cleanup failures after the primary error without displaying the
payload. A regression test also covers nested cleanup failures; provisional
formatting walks nested cleanup records in execution order. The existing WeakMap
and Error-only representation limitations still apply.

## Experimental module compilation and runtime

`compileExperimentalEffectsSources` accepts a virtual source map, uses existing
Toss import analysis and graph validation, and emits generator-based module
initializers. Its experimental module runtime maintains running, completed,
failed and interrupted states across effect suspension. The module test runs
real Toss sources through resumption and cached imports, abandonment,
initialization re-entry, cleanup failure, missing dependencies and static
cycles. It instruments generated test artifacts to confirm cached identity for
handler failure and unhandled effects, and interruption metadata after a cleanup
failure; there is not yet a language-level catch to observe those cases.

The slice rejects unsupported messages. It does not implement filesystem module
resolution, REPL module loading, JS module output, an external runtime,
source-map support, or production compilation. Error metadata is still
Error-keyed and experimental. Static dependency collection and validation reuse
existing modules, but the prototype does not claim parity across every loader
edge case.

The AST slice now registers the actual built-in `generateUnique` method for each
module root rather than treating it as an unsupported native method. Tests cover
matching a unique effect Symbol, rejecting a different unique Symbol without
displaying its payload, and sharing a unique Symbol through a module export.
Arbitrary native methods remain unsupported in this experimental path.

The experimental runtime also records handler request context on errors: the
original failure remains primary, and default output identifies the handled
effect and request location without printing payloads. Toss-source tests cover
nested handler contexts and ordering. The context table currently shares the
same Error-keying and repeat-reporting limitations as cleanup metadata; it is
not a final diagnostic representation.

`deno task effects:demo` runs `experiments/effects-demo.toss` with the isolated
experimental compiler. It demonstrates two handled requests and cleanup using
simulated time and file contents; it does not access a real clock or file
through an effect library. The same demo is checked by `effects:probe`.

The experimental runtime supports `perform:` and `perform:withArguments:`
through cooperative dispatch, including Symbol and unique-Symbol method keys.
Tests compare ordinary dynamic dispatch and error validation with the standard
compiler, and exercise an effect raised by the dynamically selected method.
Prelude fallbacks remain subject to the slice's explicit supported-message
restrictions; not all runtime messages have been adapted.

## Experimental JavaScript boundary

The AST slice compiles `%js` using the existing ahead-of-time evaluator
collection and supports synchronous `asJSCallback` adapters for effect-aware
Blocks. A fresh boundary is installed for each JavaScript entry and callback.
Requests that escape a callback fail at that boundary; a handler entirely inside
the callback can handle its own requests. Resuming across the boundary and
converting a resume capability to a JS callback are rejected. A boundary token
also guards a resume hidden inside an Object passed to `%js`.

`experiments/effects-js-boundary-test.mjs` tests these paths, callback identity
and argument conversion, errors during cleanup, and preservation of a JS thrown
value as `cause`. Callback errors are formatted before being passed into JS so
that cleanup information is retained if the existing JS-expression wrapper adds
a cause. The underlying error records are still Error-keyed; arbitrary host
re-entry, broader async host behavior and public runtime integration remain
unverified. `%js` still executes arbitrary host JavaScript, and passing nested
Toss Blocks through object properties has no supported callback contract under
ADR-38.

The experimental compiler now passes the execution boundary through Block
invocation context as well as through the synchronous host-entry guard.
Generator steps restore their caller's boundary after each delegation. This
supports the experimental async boundary described below, where a single mutable
global cannot identify the invocation after another task runs. General
concurrency guarantees remain unverified. The existing JS boundary, nested
resume, ordinary-program and module probes continue to pass.

## Experimental async boundary

The AST slice emits async Blocks as ordinary async functions, using the existing
async-result envelope and `awaitToss` conversion. Synchronous effect operations
inside those Blocks run under a fresh async boundary. A handler installed wholly
within the async Block can handle its own requests; requests and resume
capabilities cannot cross from the async Block to an outer synchronous handler,
even before the first await. Async Blocks are rejected as synchronous handlers,
`handleWith:` bodies, and `ensure:` bodies or cleanups. Synchronous Blocks may
return async results without implicitly waiting, as specified above.

`experiments/effects-async-boundary-test.mjs` covers startup and wait ordering,
handlers before and after await, simultaneous async invocations,
non-assimilation of Toss Objects with a `then` slot, promise identity and
rejection causes, cleanup timing, and boundary errors with cleanup details.
Async generator compilation was rejected in this experiment because delegation
can assimilate a Toss Object's `then` slot. The implementation still lacks JS
module imports, full host/re-entrant concurrency validation, async effect
handlers, cancellation, REPL integration and production runtime integration.

The experimental compiler also emits static `%jsImport` namespace imports using
the standard compiler's collection and alias logic. Tests cover eager
initialization from an otherwise unused Toss module, failure before Toss side
effects, shared namespace identity, an imported JavaScript function calling back
into Toss, and ordinary behavior against the standard compiler. Relative JS
specifiers remain rejected according to the existing parser rules. Static host
initialization is outside the synchronous Toss handler scope.

## Experimental cached-error metadata isolation

The module/runtime slice snapshots cleanup failures and handler contexts when a
module initialization fails, and restores that snapshot when the cached error is
re-thrown. This prevents cleanup or handler context added by a later caller from
being inherited by the next caller, while preserving the same Error identity and
retaining cleanup that actually occurred during module initialization. Tests
exercise repeated JS callbacks, module-local plus caller-local cleanup, and
handler contexts. They also verify that a read-only or throwing `stack` property
cannot replace the original cached error during formatting.

This is a targeted cache fix, not a complete occurrence-based error model.
Metadata is still keyed by Error, snapshots contain references to nested error
records, and re-entrant/concurrent reuse needs further study. If a host makes
`stack` unwritable or unreadable, the runtime preserves the original error and
its internal records but cannot reliably rewrite that host-visible stack; the
stack may be stale or omit associated failures. A non-mutating diagnostics
interface is required before claiming general error-reporting guarantees.

The experimental runtime now has an internal non-mutating failure-details
operation that returns the original error, a fresh list of associated cleanup
errors in execution order, and a fresh list of handler contexts. A test exposes
it only in a generated test artifact and verifies that a read-only frozen stack
still permits the current module and caller cleanup details to be inspected
without changing error identity. This is not a public Toss or JS API; lifetime,
concurrent access and presentation need further design. Normal stack formatting
remains best-effort when the host prevents reading or writing `stack`.

The production virtual-source compiler and the experimental compiler now share
the same internal source-graph preparation, including macro-library imports. The
experimental module probe checks that shared macros can generate an effect
request, that consumer roots remain independent, and that missing macro
libraries fail during compilation. The production compiler retains its existing
public API and generation path; this does not enable effects in that compiler.

A further module probe checks nested failed-module caches that share the same
Error object: re-importing the inner module retains its own cleanup record but
not cleanup added by the outer module. This validates that pair of cache
snapshots; it does not establish correctness for arbitrary host re-entry or
concurrent failure propagation.

During `ensure:` cleanup, a JS callback may re-enter a failed module and restore
its cached metadata on the same Error object. The experimental runtime now saves
the outer failure's metadata before running cleanup and restores it afterwards,
before recording any new cleanup failure. A regression probe covers this case;
it does not prove isolation for every re-entrant or concurrent error occurrence.

The JS and async boundary probes additionally pass `undefined` and a Proxy whose
property/prototype access throws as the original JS throw or Promise rejection.
The experimental boundary preserves the original value as `cause` without
inspecting the Proxy. This covers these paths only; the internal cleanup records
still do not constitute a general arbitrary-value failure model.

## Preliminary generator cost measurement

`deno task effects:benchmark` compares complete embedded artifacts from the
normal and experimental compilers on ordinary message dispatch and Array `map:`
callbacks. It also measures handled requests in the experimental compiler.
Every run checks its result. Compilation is excluded; each timed invocation
includes artifact runtime initialization. The script reports three warmups and
the median of seven samples in one Deno process.

An initial run on Deno 2.9.7 / V8 15.0.245.2, macOS arm64, measured the
experimental artifact at about 1.8 times the size and about five times the
execution time of the standard artifact for each ordinary workload. These are
small, local microbenchmarks, not a production performance guarantee. They do
not measure cold process startup, external runtime output, memory, other engines,
or representative applications. Repeated and broader measurements are needed.

The result makes unconditional generator conversion a poor default to adopt
without further evidence. Before production integration, compare approaches
that retain ordinary execution where possible while preserving propagation
through dynamic method calls and callback-taking Prelude methods. The existing
probes demonstrate why converting only visibly effectful Blocks is not enough;
no optimization or public compiler mode is selected by this measurement.

### Direct sends for known numeric receivers

An opt-in experimental emitter now sends a small allowlist of numeric Prelude
messages directly through the existing synchronous `send` when the receiver is
a numeric literal. Arguments are still evaluated by the cooperative emitter
first, so an argument can suspend and resume. `times:` is excluded because it
invokes a Block; dynamic receivers remain on the cooperative path because an
Object method with the same selector can raise an effect. Both single-source
and virtual-module experimental compilation accept this internal option.

The differential probe covers an effect in a numeric argument, a dynamic method
inside a `map:` callback, an effect in `times:`, async awaiting, module
initialization, and normal numeric errors and source locations. It is evidence
for those cases, not a general proof of equivalence. The allowlist must be
revisited if numeric Prelude methods acquire callback or effect behavior.

In one local run of the benchmark above, literal numeric dispatch fell from
6.61 ms to 3.26 ms (standard compiler: 1.14 ms). The existing `map:` workload
has a dynamic numeric receiver and generated identical code with both options;
observed timing differences there are measurement noise, not an optimization.
The handled-effect workload likewise emitted identical code. This candidate
therefore reduces a narrow part of the overhead but does not resolve the cost
of cooperative Block calls or dynamic dispatch. It remains off by default.

### Shared dispatch allowlist

The cooperative dispatcher previously constructed the same allowlist of
supported primitive messages on every fallback send. An opt-in experimental
runtime variant constructs it once per artifact instead. It retains the same
generator calls, dynamic slot lookup, callback invocation and boundary logic; it
does not infer whether a Block or method is effect-free. The allowlist is
private to the artifact and is not exposed through Toss or its JS evaluators.

The benchmark now includes a dynamically selected method and an effect raised
through a dynamic method inside `map:`. In one Deno 2.9.7 / V8 15.0.245.2 macOS
arm64 run, the shared-table variant reduced the ordinary `map:` workload from
9.25 ms to 6.83 ms and dynamic method workload from 10.18 ms to 7.93 ms; the
normal compiler took 1.81 ms and 3.10 ms respectively. The effectful `map:`
workload measured 5.61 ms versus 5.14 ms; a direct resumption workload showed
little improvement. A second run while other tests were running measured the
effectful `map:` workload at 5.02 ms versus 5.44 ms, so it does not support a
reliable improvement for that case. These are local microbenchmarks with fixed
variant order and do not establish a general speedup or effect-request cost.

The experimental suite compares both variants on ordinary programs, synchronous
handler cases including 10,000 resumptions, and JS and async boundary cases. It
also combines this option with direct numeric sends in a virtual-module effect
test. The options remain disabled by default. The remaining overhead includes
generator delegation, per-invocation boundary wrappers and dynamic dispatch;
removing boundary work without proving behavior under re-entry and async
suspension would risk changing semantics.

### Generator boundary-step experiment

An opt-in variant replaces the closure created for each delegated generator
`next`, `throw` or `return` with a shared helper. Each operation still installs
the invocation's boundary and restores the previous one in `finally`. The
delegate and its `yield*` protocol remain in place; this tests one allocation
strategy, not elimination of generator delegation. A negative probe bypasses
the delegate altogether and demonstrates that a local async handler after
`%await` then rejects a valid resume because its boundary is wrong.

`deno task effects:benchmark-boundary` alternates two variants, both using the
shared dispatch table, with eight warmups and 30 paired samples per workload.
On Deno 2.9.7 / V8 15.0.245.2 on macOS arm64, two runs measured paired median
candidate/baseline ratios of 1.00 and 1.01 for ordinary map callbacks, 1.00 and
1.00 for dynamic methods, and 1.35 and 0.81 for effectful dynamic callbacks.
The effectful result varies too much to establish an improvement, and the
ordinary workloads show no meaningful gain. The additional helper also grows
the artifact. Do not adopt this variant on current evidence; it remains an
off-by-default experiment to make the comparison reproducible. This is not a
claim about other engines or larger programs.

The differential suite also exercises the variant on synchronous handler and
cleanup scenarios, re-entry into a cached failed module, JS boundary checks and
concurrent async callbacks. These cases do not prove arbitrary re-entry or solve
the pre-existing error-occurrence isolation limitations.

### Shared generator delegate methods

Another opt-in variant uses one delegate class per artifact. Each invocation
still creates its own delegate containing its iterator and boundary, but the
`next`, `throw`, `return` and iterator methods are shared on the prototype.
Each method installs that delegate's boundary and restores the previous one in
`finally`, including when nested host callbacks re-enter Toss. The native
`yield*` protocol is retained so that interruption and cleanup continue to
drive the underlying iterator. This is separate from the direct-step helper
above and remains disabled by default.

`deno task effects:benchmark-delegate` compares this variant with the original
delegate, with shared dispatch tables enabled in both. On Deno 2.9.7 / V8
15.0.245.2 on macOS arm64, three runs with alternating order and 30 paired
samples gave candidate/baseline median ratios of 0.87, 0.82 and 0.83 for the
ordinary map workload and 0.76, 0.76 and 0.76 for dynamic method calls. The
effectful callback workload varied from 0.68 to 1.07, so it does not establish
a reliable improvement there. These are local microbenchmarks with complete
artifact initialization, not representative application or memory measurements.

The differential tests cover synchronous requests, resume, abandonment and
cleanup, a callback that re-enters a local handler before resuming its outer
handler, failed-module re-entry, JS boundaries and concurrent async calls. They
do not prove all host re-entry patterns or establish performance on other JS
engines. This candidate merits further investigation before any default or
production decision.

### Cross-engine checks for the shared delegate

`deno task effects:probe-engines` compiles the same four scenarios with both
delegates and executes each artifact in Node and Bun: nested JS callback
re-entry followed by outer resumption, concurrent async handlers, abandonment
cleanup, and cached-module failure re-entry with cleanup details. It checks the
expected output independently for each variant and host. It requires both
executables on PATH; it is separate from the Deno-only probe suite.

`deno task effects:benchmark-engines` compiles identical artifacts once and
runs them under both hosts. It uses eight warmups, 30 alternating paired samples
and the same three workloads as the Deno delegate benchmark. On macOS arm64,
two runs on Node 26.13.0 / V8 14.6 gave candidate/baseline ratios of 0.80 and
0.75 for map, 0.72 and 0.72 for dynamic methods, and 0.73 and 1.07 for
effectful callbacks. Bun 1.3.14 / JavaScriptCore gave 0.86 and 0.85, 0.85 and
0.83, and 0.82 and 0.89 respectively. Bun reports a compatibility V8 version;
the benchmark records its WebKit revision instead of treating that as its
engine. These results support further study across engines but are still local
microbenchmarks; the fluctuating Node effectful result is inconclusive.

### Experimental external effect runtime

The experimental compiler can now emit a static import of an experimental
effect runtime module, for both single-source programs and virtual-source
module graphs. The asset provides a factory, so every artifact receives its
own effect boundary, handler data, module cache and Prelude runtime. The
generated code reads the active boundary through a function rather than
capturing the initial value; this matters when module initialization or a
Block call happens inside a nested JS or async boundary. Embedded generation
continues to be available. The earlier statements that this slice does not
support an external runtime describe the state before this experiment.

The experimental asset is fingerprinted using the existing production hash
function. A generated artifact checks the fingerprint, factory and required
bridge values before running Toss code. Runtime options that change the asset
change its fingerprint. This is a compatibility check, not an integrity check.
As with ordinary static ESM imports, host modules initialize before the artifact
performs its runtime check. This is not the production runtime format or a
public API; choosing the final bridge, diagnostics and versioning remains work.

The probe compares embedded and external execution of handled effects, cleanup,
JS re-entry, async handlers, static JS imports and module initialization. It
also checks a mismatched or malformed runtime and that two artifacts using one
asset have independent module caches. A small sample produced 47,906 bytes of
embedded code versus 6,580 bytes of application code plus a 45,094-byte shared
runtime asset. This illustrates the size tradeoff only; it is not a loading or
performance benchmark. The pre-existing limited Prelude coverage, error-record
isolation and production/REPL integration remain unresolved.

The cross-engine probe also runs the same scenarios with an external runtime
file in both Node and Bun, with both delegate variants. A large `data:` URL
used in an initial test failed to resolve on Bun 1.3.14, so the portable probe
uses temporary `.mjs` files and removes them afterwards. This observation does
not imply that all `data:` URLs fail on Bun.

### Cooperative display and diagnostic snapshots

The experimental runtime now handles Array `inspect` and `toString` by
cooperatively sending `inspect` to each element. It retains the standard
runtime's snapshot and cycle-detection behavior and clears its active inspection
state on normal completion, error or abandonment. `print` and `dump` likewise
send their conversion messages cooperatively, so an Object's custom conversion
can request an effect. The experimental output still uses its existing console
path; this does not establish integration with REPL output hooks. Ordinary
display programs are compared with the standard compiler, and effect probes
cover resumption, mutation during suspension and abandonment in embedded and
external runtime modes.

The internal non-mutating failure-details operation now returns a frozen
snapshot object with frozen cleanup and handler-context arrays. A regression
test retains the first snapshot while the same cached Error is reused in a
second callback: each list keeps its own caller's cleanup and both retain the
original Error identity. This is shallow: the Errors and request objects inside
the lists remain references, and internal metadata is still keyed by Error.
It is not a general occurrence-based error model or a public diagnostics API;
arbitrary re-entry, nested mutable records and concurrent propagation still
need a design before production integration.

### Experimental REPL output and occurrence snapshots

An isolated effect REPL probe now retains a lexical environment across cells
and uses the same output-hook convention as the ordinary REPL for cooperative
`print` and `dump`. It wraps output-handler failures in a Toss runtime error
with the original cause and preserves cleanup details. It also tests async
output, resumed custom inspection, and the isolation of compiled `%js`
evaluators from the runtime closure. It is not the public REPL: imports,
exports, persistent macro declarations, REPL module loading, interactive
control and the full existing session protocol are not implemented here.

Failure-details snapshots additionally capture frozen cleanup and handler
description strings at observation time. A later mutation of a referenced
Error or request location does not rewrite those captured descriptions, while
the original Error references and JS causes remain available. Separate REPL
failures wrapping the same host Error are tested with different cleanup errors.
This improves a diagnostic snapshot, not the underlying failure-occurrence
model: records are still keyed by Error, snapshots are taken at explicit
observation boundaries, and independently overlapping occurrences of the same
Error can still interfere before observation. A per-occurrence carrier and its
interaction with JS identity, cached module errors and async propagation still
need to be established before production integration.

The standalone occurrence experiment now extends the earlier envelope model
with failed-module cache templates, host-boundary unwrapping, re-entry while an
outer cleanup is running, and two overlapping async failures. Each reuse of a
cached template gets a distinct carrier and copied cleanup graph, while the
host receives the identical original thrown value. Captured carrier snapshots
retain their own structure when a later carrier is modified. A private WeakSet
marks carriers without inspecting a foreign thrown value; the probe checks an
`undefined` throw and a Proxy that throws on property or prototype access.

This remains a standalone JavaScript model, not the generated Toss module,
handler, REPL, or async runtime. In particular it does not yet establish how
carriers travel through every generated call, where async and JS boundaries
unwrap them, how real module interruption is represented, or how cycles and
arbitrary overlapping cleanup graphs are handled. Error values inside a
snapshot are identity-preserving references, not deep-frozen host objects. The
experiment therefore narrows the integration questions; it does not complete
occurrence isolation in Toss.

An actual Toss module regression exposed a narrower leak: an outer module's
cleanup recorded an inner module's cached Error, and a later unrelated caller
added cleanup information to that inner Error. Re-importing the outer module
then incorrectly displayed the later caller's cleanup. The experimental runtime
now records an immutable snapshot of a cleanup Error's associated cleanup
records when associating it with the primary failure. It still retains the
original Error objects. Traversal follows occurrence records rather than
deduplicating by Error identity, so two appearances of the same Error can keep
different nested cleanup records. Embedded and external runtime modes and both
delegate variants exercise the regression, along with Node and Bun.

This fixes that nested-association leak, not the complete occurrence model.
Top-level handler and cleanup metadata are still stored in WeakMaps keyed by
Error, and an overlapping reuse can interfere before a nested record is
captured. The standalone carrier model above is not integrated into generated
Toss code; JS boundaries, arbitrary throws and module/async lifetime still need
a unified implementation and tests before claiming general isolation.

### Experimental carrier through generated code and boundaries

An opt-in `failureCarriers` variant now carries a privately branded failure
occurrence through the experimental generator runtime. A carrier keeps the
original thrown value, cleanup occurrences and handler contexts; branding uses
a WeakSet without inspecting a foreign value. The generated invocation and
handler paths preserve an existing carrier rather than wrapping it again. A
failed module caches a copy of its carrier and returns another copy for each
subsequent import, while all copies retain the same original Error identity.
Module interruption retains its own failure record and cleanup.

JS callback, top-level and experimental REPL boundaries expose the original
value rather than the carrier. An async Block keeps its carrier on the internal
Toss Promise so another Toss `%await` can retain its metadata. A separate host
Promise rejects with the original value, including for an unobserved rejection;
when Toss awaits the internal result, the host-side rejection is observed to
avoid a spurious unhandled-rejection event. This adds a Promise and associated
bookkeeping per async result in this variant. This behavior needs further
review for host scheduling, late observation, cancellation and performance.

Tests compare the variant with the existing runtime on synchronous handler and
cleanup scenarios, JS and async boundaries, including hostile foreign values.
The carrier-specific probe exercises cached-error identity, re-entry during
cleanup, module interruption, REPL diagnostics, an async-to-async await chain,
and two concurrent async uses of one cached module Error with different cleanup
records. Test-only instrumentation observes the separate internal occurrences;
it is not a public diagnostics interface. Embedded and external runtime forms
are covered. Node and Bun additionally run the cross-engine boundary probes,
including unhandled async rejection exposing an Error rather than a carrier.

The original Error's writable `stack` is still shared when identity is shared:
later reports can replace its displayed details. A snapshot taken at the
boundary retains its own descriptions, but there is no public host API for
retrieving the correct snapshot of an arbitrary occurrence. Frozen or hostile
stack properties remain best-effort. More generally this experimental variant
has not established all mixed host re-entry, primitive throw, module and async
interleavings or exception paths; it is disabled by default and does not alter
the ordinary Toss compiler or runtime. `deno task effects:benchmark-carrier`
offers a paired microbenchmark, not a release performance guarantee.

Two local runs of that benchmark on Deno 2.9.7 / V8 15.0.245.2, macOS arm64,
gave carrier/baseline paired median ratios of 0.99 and 1.19 for ordinary map,
1.07 and 1.00 for dynamic methods, and 1.12 and 1.49 for the effectful callback
workload. The variation and small workloads prevent a general conclusion;
the potential cost in the effectful case warrants investigation. These runs
do not measure the additional async Promise or failure-heavy workloads.

### Async host observation timing

The original carrier prototype converted the public Promise by chaining from a
separate observation Promise. An ordinary fulfilled async callback then ran one
microtask later than the existing runtime in a differential test. The prototype
now attaches the host-facing conversion directly to the internal Promise and
marks the separate unhandled-rejection observer as observed. Toss `%await` also
marks that observer as observed while continuing to await the internal carrier.
If neither path observes the result, the observer still exposes the original
error to the host's unhandled-rejection mechanism.

Differential probes now compare callback ordering for fulfillment, rejection,
and nested Toss `%await` in Deno, Node and Bun, for embedded and external
runtime forms. Additional Deno cases check repeated awaits of the same result,
JS Promise identity, shared rejection identity, late observation, and absence
of an extra unhandled rejection when Toss consumes the failure. This covers
those event sequences, not every host scheduling interleaving. The separate
observer Promise and mutable Error stack limitations remain, and this remains
an off-by-default experiment rather than production integration.

### Host diagnostics by failure occurrence

The experimental compiler accepts `failureObserverImport` with
`failureCarriers: true`. The host module exports `onEffectFailure`. Embedded
artifacts and the external runtime factory both pass this observer to the
runtime instance. The experimental REPL also accepts the function directly.
The observer receives the boundary kind, the original thrown value, and frozen
arrays of cleanup and handler descriptions captured for that exposure. With an
observer configured, the runtime leaves the original error's stack alone.

The runtime calls the observer before throwing the original value or rejecting
the host Promise. Observer failures leave that value intact. The observer runs
across a fresh JS boundary and can re-enter Toss through a callback. An async
result is reported once when exposed to the host, including when an initially
unobserved failure is consumed later. An internal await keeps carrying the
failure without publishing a diagnostic at that point. Distinct async results
can report separately even when their original Error is identical.

The regression probe covers a reentrant observer, two concurrent async
callbacks, and a late Promise consumer of the same rejection. The diagnostics
remain distinct while JS catches or receives the original cached Error. The
record and its description arrays are immutable, while its `error` field
retains the original object and its mutability. Node and Bun probes also verify
that an external runtime delivers the original Promise rejection value and
its cleanup description to the observer. The hook is experimental.
The following section records the later observer contract and interruption
checks.

### Host observer contract and interruption ordering

Hosts can type their module exports with `EffectDiagnosticHost`,
`EffectFailureDiagnostic` and `EffectObserverError` from the compiler package.
The experimental compiler's `failureObserverImport` loads a module with a
required `onEffectFailure` function and an optional `onEffectObserverError`
function. The embedded runtime, external runtime and experimental REPL use
the same validation and dispatch code. Invalid exports prevent the Toss entry
from running. The external runtime setup reports factory initialization errors
with the underlying error as its cause.

Observers run at the host boundary in which the failure is reported and may
return a Promise-like value. Execution does not await the observer. On a
synchronous throw or a rejected return value, the optional secondary hook
receives a frozen record with the original diagnostic, original cause and
`kind` of `throw` or `rejection`. Without a secondary hook the observer error
is discarded. A throw or rejection from the secondary hook is also discarded.
In every case the original Toss failure retains its identity, and the runtime
does not retry notification. Each hook enters a fresh JS effect boundary.

The interruption probe exercises a synchronous handler returning without
resuming, including inside an async Block after `%await`. Successful cleanup
produces no failure diagnostic. When module cleanup fails, inner and outer
cleanup run before the Promise failure notification. A later import reports
the cached initialization interruption with the cleanup failures attached.
Both embedded and external runtime forms exercise this sequence. Cancellation
of a pending async Block or host Promise still requires a language and runtime
contract. The compiler package exports the host types for integration work.
At that stage, diagnostic execution used the experimental backend.

### Ordinary compiler integration and a cancellable wait

The ordinary AOT compiler accepts `CompileOptions.failureObserverImport`,
also available as the CLI's `--failure-observer-import`. The module is resolved
with the artifact's other static imports. Both embedded and external runtimes
use the existing host observer contract. The ordinary compiler reports entry
failures, synchronous JavaScript callback failures and rejections of Toss
async results converted to host Promises. Before task ownership, ordinary
diagnostics carried empty handler and cleanup description arrays. A failure
that crosses several host boundaries can produce several diagnostics.
The external runtime fingerprint changes with this runtime interface.

The cancellation probe uses an explicit `AbortSignal` for a single wait.
Aborting that wait leaves other subscribers and the shared operation running.
The adapter observes the underlying operation even if it settles after the
wait was cancelled. A Toss async Block can await the resulting Promise. The
probe runs asynchronous host cleanup before rejecting the Promise being
awaited and verifies the order: cleanup start, cleanup end, boundary
diagnostic, then the JavaScript rejection handler. Toss's existing await
diagnostic retains the cancellation reason as its cause.

A native Promise has no cancellation operation. Stopping host work requires
an explicit cooperative API such as an operation that accepts an
`AbortSignal`. A second probe waits for the cooperative operation itself to
reject, so its own cleanup completes before the host diagnostic. For a future
Toss-owned async Block, the candidate contract is
to make cancellation observable at a suspension point, unwind cleanup in
reverse registration order, and publish the terminal diagnostic after
cleanup. A cleanup failure should be associated with the cancellation
occurrence while retaining its original reason. The wait adapter only
demonstrates explicit wait cancellation and successful asynchronous host
cleanup. The language-level cancellation operation, ownership of cancellation
and async cleanup failure semantics remain open.

### Cancellation of a Toss-owned async invocation

The experimental compiler accepts `asyncCancellation: true` with
`failureCarriers: true`. An invocation has its own task state and its async
result is the cancellation handle. Sending `cancel: reason` to that result
returns true for the first accepted request and false for subsequent requests
or a completed invocation. The runtime observes cancellation while suspended
at `%await`, before continuing from an await, or before publishing completion
if JavaScript requests cancellation during a reentrant call. Synchronous
execution between checkpoints can continue. A request stops the wait of this
invocation. The awaited Promise or separately invoked async Block can continue,
including when another caller waits for it. A late rejection of the detached
wait remains observed by the runtime.

`$Effect onCancel: cleanup` registers a zero-argument Block in the active async
invocation. The runtime runs registered Blocks in reverse order only on
cancellation. It awaits async cleanup in a separate effect boundary, so the
cancelled task's request cannot interrupt that cleanup. Cleanup may fail.
The cancellation diagnostic retains an `Async Block cancelled.` error with
the first reason as its `cause`. Each cleanup failure is attached to this
occurrence in execution order, and remaining cleanup still runs. The terminal
diagnostic is emitted after cleanup and before the host rejection is delivered.
Successful and ordinary failing invocations discard the cancellation-only
registrations. A cleanup that never settles leaves cancellation pending.

The probe covers embedded and external runtime output, repeated cancellation,
a shared host Promise, two failing cleanups including an async cleanup,
an unobserved rejection, and cancellation reentering from JavaScript after
an await. Node.js and Bun also run an external-runtime probe with a failing
async cleanup. The option and messages are experimental.

### Owned children and cooperative host operations

In the experimental cancellation mode, `$Effect spawn: block` starts a
zero-argument async Block as a child of the active invocation and returns
its async result. Ordinary Block calls and `%await` do not create ownership.
`$Effect hostOperation: factory` calls a JavaScript function with the active
task's `AbortSignal` and returns a host Promise reference. A factory's
Promise must settle after any host cleanup the parent needs to wait for.

Cancellation marks all reachable owned tasks before firing abort listeners,
so a listener that re-enters Toss cannot replace an accepted reason in a
descendant. Abort signals carry that reason. The parent joins children in spawn
order and pending host operations in registration order, then runs its own
cancellation cleanup in reverse registration order. Actual cleanup across
siblings or host operations may overlap. A child's cancellation contributes
its associated cleanup failures to the parent's diagnostic. A host rejection
identical to the abort reason adds no second failure. A different rejection
from an operation still tracked during cancellation is associated with the
parent failure. The parent publishes its terminal diagnostic after all joins
and cleanup, with the original reason as `cause`.

Callers can use `%await` to wait for a child's result. A child explicitly
exposed to JS retains its own Promise reporting boundary. Native host work
can ignore the signal. By default, if the operation never settles, parent
cancellation remains pending, as with a cleanup Block that never returns.

The regression probe cancels a parent with a child, a grandchild and a
cooperative host operation. It compares the signal reason by identity,
re-enters Toss from an abort listener, holds cleanup open, and checks the
order and contents of the eventual diagnostic. Deno exercises embedded and
external runtime forms. Node and Bun exercise the external runtime with an
owned child and an abort-aware host operation.

### Scope exit with owned work

A successful async Block body now waits for all owned children and host
operations before returning its value. An ordinary Block invocation creates
no ownership. A child or host failure is retained for the scope-exit join
even if it settled before the body returned. During that join the first
observed failure stops the remaining owned work regardless of spawn order.
Earlier child failures do not preempt a still-running parent body.

When the body already failed, its failure remains primary. An implicit join
that fails uses the child failure or a host operation error with the original
JS rejection as its cause. Remaining children receive cancellation, and
registered host operations receive the primary error as their abort reason.
By default, the parent waits for their settlement before publishing the
failure. A child's cancellation cleanup errors become associated failures in
the parent diagnostic. The parent runs its own `onCancel:` registrations only
when the parent itself was cancelled. For ordinary failures, the runtime copies the
failure carrier before adding associations, so a separately observed child
does not acquire the parent's additional failures.

An operation that ignores its `AbortSignal` keeps the scope open by default.
The probes hold such an operation open beyond the child's failed cleanup and
verify that there is no parent diagnostic or rejection yet. Releasing the
operation lets the parent report the original failure along with the
associated cleanup failure and then reject. Separate tests verify that a
normal return stays pending until both the owned child and host operation
finish. These semantics apply to the experimental cancellation mode.

### Explicit deadline for host settlement after abort

`$Effect hostOperation: factory abortWaitMs: 50` gives that host Promise up
to 50 milliseconds to settle after the task issues its abort signal. The
budget is an integer from 0 through 2,147,483,647 milliseconds. A zero budget
allows settlement before the zero-delay timer fires, including an immediate
rejection from an abort listener. Timers depend on event loop progress. If the
same task registers the same Promise more than once, the longest requested wait
applies, including an unbounded wait when a registration omits the budget.

The deadline applies after explicit cancellation or ordinary failure aborts
the operation. A successful scope and an explicit `%await` still wait for
the operation normally. Host deadlines run concurrently with child cleanup.
When a timer wins, the runtime stops waiting for that operation and records
the deadline and registration location as an associated failure. The parent
retains its primary error and waits for child cleanup and its own applicable
cleanup before publishing the diagnostic. A host rejection received before
the deadline follows the usual cleanup reporting rules.

The host operation may keep running after its deadline. The runtime observes
any later rejection to prevent an unhandled rejection and leaves the parent
diagnostic unchanged. Code holding the original Promise can still observe
its eventual settlement. A deadline for host settlement never bounds Toss
cleanup Blocks.

### Optional observer for late host failures

In the experimental cancellation mode, the module configured by
`failureObserverImport` may also export `onLateHostOperationFailure`.
It still provides `onEffectFailure`, which can be a no-op when the host
only needs late failures. The experimental compiler exports the
`ExperimentalEffectDiagnosticHost` and `LateHostOperationFailure` types.
The function receives a frozen record with the original rejection value
(`cause`), the signal's reason (`abortReason`), the budget in milliseconds
(`abortWaitMs`), and the registration's frozen `location` with file, line,
and column. The original values retain their identity. The hook fires once
per timed-out Promise in the owning task if it eventually rejects. A
fulfillment or a rejection that wins the race against the timer does not
notify this hook. Without the export, late rejections remain observed
without a notification.

The hook runs when the late rejection is observed, in a fresh JS effect
boundary. It can run during child cleanup or after the parent has reported.
The runtime does not await the hook, and discards its throws or rejected
return values without calling `onEffectObserverError`. The parent diagnostic
still fires once after child cleanup and includes the deadline failure
alongside any cleanup failures. It holds the original primary failure and
is independent of the late rejection. The embedded and external experimental
runtimes accept the same observer export.

### Ordinary compiler and runtime integration

The ordinary compiler, bundled modules, and REPL now expose the same
task ownership messages on `$Effect` and `cancel:` on async results.
An async Block owns only the children started by `$Effect spawn:` and the
Promises registered with `$Effect hostOperation:` in its invocation.
Synchronous Toss helpers use the caller's task, including across bundled
modules. Ordinary async calls and reentrant JavaScript callbacks do not
inherit that ownership. Successful scope exit waits for owned work.
Failure or cancellation aborts the remaining work, subject to each
host operation's optional `abortWaitMs:`, and waits for Toss cleanup.

The ordinary compiler's `failureObserverImport` option and the CLI's
`--failure-observer-import` accept the same optional
`onLateHostOperationFailure` export. The compiler package exports
`EffectDiagnosticHost` and `LateHostOperationFailure` for host modules.
The runtime keeps cleanup and deadline failures with their occurrence
until reporting the original error at the JS boundary. A parent's async
result reports once after its children finish cleanup. Waiting for a
child internally does not publish a separate child diagnostic. The late
hook can fire independently, including during child cleanup.
Regenerate external runtime modules with the matching compiler.

### Cost of async Blocks without owned work

The benchmark in `experiments/async-ownership-benchmark.mjs` compiles the
same async Blocks against each supplied checkout. It times sequential
calls through a JS callback and reports the median of seven 50,000-call
samples after warmup. The host Promise case reuses an already-fulfilled
Promise. These measurements include the Toss-to-JS callback boundary.

On Deno 2.9.7 on arm64 macOS, a comparison of `a52fd39` before integration,
`19e8601` after integration, and the optimized runtime gave the following
times in nanoseconds per call.

| Runtime | Block body | Before integration | After integration | Optimized |
| --- | --- | ---: | ---: | ---: |
| Embedded | Return a value | 1194 | 1648 | 1190 |
| Embedded | Await a plain value | 1114 | 2169 | 1526 |
| Embedded | Await a JS Promise | 1273 | 2217 | 1622 |
| Embedded | Await a Toss async result | 2008 | 4925 | 2583 |
| External | Return a value | 1307 | 1766 | 1225 |
| External | Await a plain value | 1299 | 1964 | 1624 |
| External | Await a JS Promise | 1389 | 2548 | 2064 |
| External | Await a Toss async result | 2193 | 4132 | 2570 |

Ownership tables are allocated on first use. Synchronously completed
results keep their Promise without registering a live task. The runtime
only installs a rejection forwarder for an unobserved failure carrier.
Waiting on a reference uses one cancellation latch, and awaiting another
Toss async result uses its internal Promise directly. A plain value still
suspends at the generated `await`. In this run a direct return was near the
pre-integration time, while the await cases still cost 17–49% more.

### Host Promise wait costs

The ordinary runtime now delivers the JS result directly into the task's
cancellable wait. The host operand still uses JavaScript's native `await`,
including for cross-realm Promises and thenables. The generated Toss
continuation clears the wait and checks cancellation before consuming the
result. This removes a Promise relay and repeated JS reference lookups.
An owned host rejection still retains its original cause and registration
identity so that it is recorded only once if it becomes the primary failure.

The benchmark adds one Block that waits eight times on the same fulfilled
Promise and one that waits on a fresh Promise fulfilled in a microtask. The
fresh Promise case includes allocating and scheduling that Promise. These
are medians in nanoseconds per Block call on Deno 2.9.7 on arm64 macOS,
compared in the same run against `a52fd39` and `6d088dc`.

| Runtime | Block body | Before integration | Previous | Direct delivery |
| --- | --- | ---: | ---: | ---: |
| Embedded | Return a value | 1073 | 1197 | 1207 |
| Embedded | Await a plain value | 1076 | 1439 | 1333 |
| Embedded | Await a Toss async result | 2091 | 2393 | 2520 |
| Embedded | Await a fulfilled JS Promise | 1432 | 1764 | 1619 |
| Embedded | Await a fulfilled JS Promise eight times | 1961 | 2977 | 2481 |
| Embedded | Await a fresh pending JS Promise | 2008 | 2409 | 2305 |
| External | Return a value | 1387 | 1352 | 1276 |
| External | Await a plain value | 1346 | 1539 | 1509 |
| External | Await a Toss async result | 2380 | 2499 | 2411 |
| External | Await a fulfilled JS Promise | 1519 | 1840 | 1599 |
| External | Await a fulfilled JS Promise eight times | 2096 | 3192 | 2614 |
| External | Await a fresh pending JS Promise | 2162 | 2525 | 2460 |

The difference between the eight-wait and one-wait cases, divided by
seven, estimates the cost per additional fulfilled JS Promise wait within
the same Block. Embedded runtime estimates were 76, 173, and 123 ns across
the three versions. External runtime estimates were 82, 193, and 145 ns.
This separates repeated wait cost from most of the callback and task setup
cost, while still including the Toss operand lookup.

### Awaiting another Toss async Block

The prior embedded result for a synchronously completing Block was about
5% slower at `a6b723b` than at `6d088dc`. That increase did not recur
in three new Deno processes. The paired medians were 3222 → 2481,
3059 → 2855, and 2585 → 2450 ns per call. The measurements used Deno 2.9.7
on arm64 macOS and the benchmark's `--toss-await` selection.

The ordinary runtime used a cancellable Promise relay even for a
completed Toss async result. It can now await the internal Promise
directly once the producer has finished. The generated continuation
still checks cancellation before using the result. The result box has
its own `then: undefined` so a host-supplied prototype getter cannot
delay settlement. A task in failure cleanup remains registered until
cleanup finishes, even though it has closed to further cancellation.
Awaiters of that task can still cancel their own wait.

The table reports the median of three independent run medians, in ns per
Block call. The relay control includes the completion-state and result-box
fixes and restores the relay for every Toss result. In the suspension
case the inner Block awaits a plain value before returning.

| Runtime | Workload | Before integration (`a52fd39`) | Previous (`a6b723b`) | Relay control | Direct wait |
| --- | --- | ---: | ---: | ---: | ---: |
| Embedded | Await synchronous completion | 1956 | 2365 | 2380 | 2230 |
| Embedded | Await after suspension | 1960 | 2755 | 2889 | 2955 |
| Embedded | Invocation only | 2150 | 2182 | 2218 | 2158 |
| External | Await synchronous completion | 2060 | 2533 | 2507 | 2727 |
| External | Await after suspension | 2411 | 3047 | 3014 | 2879 |
| External | Invocation only | 2286 | 2304 | 2124 | 2172 |

The embedded direct wait for synchronous completion saved 6–17% in
each paired comparison with the relay control. External measurements for
that case changed direction across runs. The suspended case still uses a
relay, and its measurements differed across runs and runtime forms.

### Awaiting a pending Toss result

The benchmark's `--pending-toss-await` selection splits this path into
three cases. One inner Block suspends with `%await(42)` and the outer
Block joins it. A second inner Block awaits a fresh host Promise that
settles via a microtask. The invocation control starts the first inner
Block and returns from the outer Block without joining it.

Three independent runs on Deno 2.9.7 on arm64 macOS compared
`a52fd39`, `a6b723b`, and `d0f4110`. For the plain suspension, the
paired changes from `a6b723b` to `d0f4110` were −1%, +21%, and +3%
with the embedded runtime and −3%, +1%, and −14% with the external
runtime. The prior direction of the difference varied between runs.
All six measurements of `d0f4110` were slower than `a52fd39` for that
workload.

A second comparison used a temporary build differing from `d0f4110`
only in the pending Toss path. It returned the producer's Promise
directly, bypassing the cancellation relay. The direct-delivery trial
instead registered waiting tasks with the producer, delivered its
result at completion, and removed individual registrations on
cancellation. Here are the medians of three independent run medians in
ns per outer Block call.

| Runtime | Workload | Before integration | Current relay | No-relay control | Direct delivery with Set |
| --- | --- | ---: | ---: | ---: | ---: |
| Embedded | Await after suspension | 2249 | 2857 | 2742 | 3077 |
| Embedded | Await a Block with pending host input | 3231 | 3708 | 3762 | 3860 |
| Embedded | Suspended invocation only | 1967 | 2242 | 2344 | 2251 |
| External | Await after suspension | 2510 | 3208 | 3419 | 3063 |
| External | Await a Block with pending host input | 3418 | 4254 | 4108 | 4293 |
| External | Suspended invocation only | 2187 | 2418 | 2506 | 2540 |

Without the relay, the embedded plain-suspension case saved 1–4% in
each paired run, while the external results changed direction. Most
of the pre-integration gap remained even in that control. The
invocation-only case also measured slower than before integration.
The no-relay build failed the shared-wait regression because the
cancelled waiter's cleanup could not start before producer settlement.

A separate direct-delivery trial used one inline waiter slot and
allocated a Set only for additional waiters. Against the current
relay, its paired changes ranged from −11% to +9% for the embedded
plain-suspension case and from −5% to +12% for the external equivalent.
Its median pending-host-input time increased in both runtime forms.
The trials provided no repeatable throughput improvement across the
pending workloads. The shared-wait regression also verifies that a
second waiter still receives the producer's value while the first
waiter's cleanup is held open, and that the first waiter's original
reason is reported once after cleanup.

### Async Block startup and result registration

`--async-start` compares invocation of an inner Block that returns
immediately, invocation of one that suspends once, and invocation plus
waiting for that suspension. The invocation-only controls include the
outer JS callback boundary. The suspension uses a Toss value, so the
case has no host Promise allocation or conversion.

The comparison uses three cumulative changes. Block startup returns the
scope carrier directly and removes the unused bindings Map on that
carrier. The ordinary runtime then passes the task itself as the
async invocation record and initializes its observer fields with the
rest of the task. Finally, a single registry associates each result
with the task that carries its private Promise. Both Toss awaits and JS
conversion can find the Promise and task with one lookup. Completed
results keep the existing task record, whose cleanup and ownership state
has already been released.

In three runs on Deno 2.9.7 on arm64 macOS, the cumulative variants
gave the following medians of run medians for awaiting an inner Block
that suspends once, in ns per outer Block call. The first registry trial
stored a raw Promise for immediate results and the task for pending ones.

| Runtime | Before integration | Before this change | Scope startup only | Shared invocation and task record | Registry with mixed entries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Embedded | 2183 | 2942 | 3479 | 2608 | 2229 |
| External | 2416 | 3132 | 2912 | 3298 | 2526 |

The standalone startup and task stages changed direction by runtime.
Consolidating the registry improved this workload in both forms. The
mixed registry made the external invocation-only controls slower, and
that effect persisted with one variant per Deno process. The version
with a uniform registry entry for all results improved the suspension
and await workload in three further paired runs against `f6533f7`.
Its elapsed time fell by 32–39% for embedded and 22–28% for external.
The invocation-only controls varied between runs.

The following same-run comparison used the adopted uniform registry
alongside `a52fd39` and `f6533f7`. Values are medians in ns per outer
Block call. Absolute timings varied between runs.

| Runtime | Workload | Before integration | Before this change | Uniform registry |
| --- | --- | ---: | ---: | ---: |
| Embedded | Await after suspension | 2389 | 3216 | 2911 |
| Embedded | Suspended invocation only | 2146 | 2549 | 2579 |
| Embedded | Immediate invocation only | 4903 | 4493 | 4890 |
| External | Await after suspension | 5232 | 5950 | 5447 |
| External | Suspended invocation only | 3648 | 3772 | 4301 |
| External | Immediate invocation only | 3297 | 3406 | 3571 |

An async method copies its method context into the lexical scope at
startup and releases the temporary reference on the task record. Tests
cover receiver and parent-send bindings after suspension, host Promise
identity, cancellation of a shared wait, and publication of the original
failure after child cleanup.

### Async launches whose results are discarded

The benchmark's `--launch-only` selection measures the two invocation
controls without the await workload. In three separate Deno 2.9.7
processes per version on arm64 macOS, the external suspended launch
measured 2092 → 2278, 2091 → 2042, and 2223 → 2589 ns from `f6533f7`
to `5ae7977`. Two runs reproduced a slowdown. The median rose by 9%,
with paired changes from −2% to +16%.

A retention control used the same result record and lookup in both
builds. On completion of an initially pending task, one build kept the
task pointer in the record and the other cleared it. The external
suspended-launch median dropped from 2628 to 2207 ns, with a 7–23%
reduction across the paired runs. The embedded medians were 2427 and
2456 ns, and the paired changes varied in direction. These controls
measure execution time for short-lived results.

A direct `value` or `value:` family send used as a statement can now
launch an async Block without constructing and registering a Toss
result reference. The compiler marks only sends whose value is unused.
The runtime checks that the receiver is an async Block and validates
the arguments at the same invocation point. The task keeps its private
Promise for failure reporting and can still own children and host
operations. A discarded failure still reports the original error
after owned cleanup and is exposed as an unhandled rejection.

The registration control used the same direct dispatch but allocated
and registered the result before discarding it. Medians of three run
medians follow, in ns per outer Block call.

| Runtime | Inner Block | Before integration (`a52fd39`) | Before this change (`5ae7977`) | Direct dispatch with registration | Without result registration |
| --- | --- | ---: | ---: | ---: | ---: |
| Embedded | Suspends once | 2193 | 2235 | 2053 | 1619 |
| Embedded | Returns immediately | 2155 | 2158 | 2118 | 1622 |
| External | Suspends once | 2138 | 2356 | 2166 | 1693 |
| External | Returns immediately | 2306 | 2416 | 2578 | 1672 |

For external suspended launches, skipping registration saved 21–36%
in each paired comparison with the same direct dispatch. The new
regression test runs a discarded invocation in both runtime forms,
holds its owned child's cleanup open, and checks the single original
diagnostic and the rejection after cleanup completes.

### Retaining completed async results

An observable async result now has a compact registry entry holding its
native Promise and the observer state. The entry points to the active
task while the invocation is pending, including during failure cleanup.
Completion detaches the task. A result that completes synchronously
starts with a detached entry. The original value or failure stays in
the native Promise, and the shared notification flag still prevents a
second diagnostic if JS exposes a result after an unobserved rejection.
The runtime continues to cache the public JS Promise for each result.

The retained-results benchmark stores 100,000 Toss result references
whose Blocks each suspend once. It lets all Blocks complete, runs GC,
reads each retained result through Toss `%await`, then hands each result
to JS for the first time. It subtracts heap usage measured after warmup
and clearing the store. The memory numbers are incremental V8 heap
bytes divided by the number of stored results. They include the store
and registry overhead.

The table gives medians of five fresh processes per version and runtime
on Deno 2.9.7 on arm64 macOS. The previous build is `f7ee9eb`.

| Runtime | Metric | Previous | Compact entry |
| --- | --- | ---: | ---: |
| Embedded | Completed heap, bytes/result | 529 | 449 |
| Embedded | Heap after JS exposure, bytes/result | 863 | 783 |
| Embedded | Launch and settle, ns/result | 1543 | 1551 |
| Embedded | Later Toss await, ns/result | 2088 | 2087 |
| Embedded | First JS exposure and await, ns/result | 1311 | 1266 |
| External | Completed heap, bytes/result | 529 | 449 |
| External | Heap after JS exposure, bytes/result | 863 | 782 |
| External | Launch and settle, ns/result | 1515 | 1521 |
| External | Later Toss await, ns/result | 2101 | 2073 |
| External | First JS exposure and await, ns/result | 1302 | 1235 |

The benchmark is available as
`deno run --allow-read --v8-flags=--expose-gc experiments/async-retained-results-benchmark.mjs . external 100000`.
The regression suite verifies that repeated Toss waits and JS
exposure of a completed result preserve object and Promise identity.
It also covers the original rejection value, cancellation propagation,
and notification after child cleanup, including later exposure of a
previously unobserved rejection.

### Public Promise cache and round-trip registration

The retained-results benchmark also reads every result through its cached
public JS Promise. It separates the incremental heap after first exposure
from the heap occupied by completed Toss results before exposure.

Three matched control runs per runtime used 100,000 retained results.
The cache-only control kept the public Promise and its original cache.
The next control added the reverse registration that maps a host Promise
back to its original Toss result. The previous runtime also registered
the public Promise in the generic Toss-to-JS reference map.

| Exposure configuration | Incremental heap, bytes/result |
| --- | ---: |
| Public Promise and original cache | 87 |
| Cache and JS-to-Toss registration | 253 |
| Cache and both reference registrations, previous runtime | 334 |

The marginal differences were 166 bytes for adding the reverse
registration and 81 bytes for adding the duplicate forward registration
in this workload. These differences include V8's table capacity and other
retained heap overhead. The cache-only build serves as a measurement
control because it cannot recover the original reference on a JS round
trip.

The ordinary runtime now stores the public Promise in the result entry.
The existing observation slot represents an unobserved result, an
internal observer, or the public Promise. The JS-to-Toss registration
continues to recover the exact original async result. The experimental
runtime uses its generic forward reference map as the cache.

The final comparison used five fresh Deno 2.9.7 processes per version
and runtime on arm64 macOS, with `f3b7e9f` as the previous runtime.
Memory values are incremental V8 heap bytes per retained result.
The timing values are nanoseconds per result and include the JS
callback and await.

| Runtime | Metric | Previous | Combined cache |
| --- | --- | ---: | ---: |
| Embedded | Completed heap before exposure, bytes | 449 | 449 |
| Embedded | Heap after exposure, bytes | 783 | 620 |
| Embedded | Launch and settle, ns | 1546 | 1572 |
| Embedded | Later Toss await, ns | 2037 | 1493 |
| Embedded | First JS exposure and await, ns | 1246 | 835 |
| Embedded | Cached JS exposure and await, ns | 535 | 518 |
| External | Completed heap before exposure, bytes | 449 | 447 |
| External | Heap after exposure, bytes | 783 | 618 |
| External | Launch and settle, ns | 1561 | 1519 |
| External | Later Toss await, ns | 2068 | 1500 |
| External | First JS exposure and await, ns | 1217 | 827 |
| External | Cached JS exposure and await, ns | 538 | 514 |

The exposure increment fell from 334 to 171 bytes in both forms.
Regression tests expose a Promise while the task is still pending,
pass it back into Toss before and after completion, and check that
repeated exposure returns that same Promise. The rejection tests
verify the original error and the absence of a duplicate diagnostic
on later exposure.

### JavaScript-only retention and the reverse map

The retained-results benchmark accepts `javascript` as its fourth
argument. It keeps the public Promises in a JS array and clears the
Toss result store before measuring heap and returning each Promise
to Toss. The default `toss` mode keeps the Toss store instead. Both
modes retain 100,000 results that suspended once and fulfilled.

The no-reverse control removes the public Promise's JS-to-Toss
registration. The split-map trial stores that association in a
dedicated WeakMap. These measurements used Deno 2.9.7 on arm64 macOS
and report medians of three fresh processes per configuration, in
incremental heap bytes per stored result after publication.

| Runtime | Retained by | Previous (`17b5544`) | No reverse map entry | Dedicated reverse map | Release internal Promise |
| --- | --- | ---: | ---: | ---: | ---: |
| Embedded | Toss | 620 | 497 | 620 | 572 |
| External | Toss | 620 | 497 | 620 | 571 |
| Embedded | JS only | 613 | 93 | 613 | 564 |
| External | JS only | 614 | 93 | 614 | 566 |

With a Toss reference still present, removing the reverse association
saved 123 bytes per result in this workload. When only JS held the
public Promise, it also made the original Toss reference and state
collectible. Its 520–521 byte difference includes that retained graph
and the reverse map overhead. The no-reverse control loses the
identity needed for Toss messages and cancellation on the returned
reference. In both runtime forms, the control failed the regression's
array update because the round trip produced a generic JS reference.
The dedicated map gave the same retained heap as the generic map.

On publishing a successful Toss result, the ordinary runtime now
keeps the original boxed Toss value in the result entry and releases
its settled internal Promise. The reverse map still returns the
original reference. The public Promise remains cached. Rejected
results retain their original internal rejection for diagnostics and
identity. Successful results accounted for the 48–49 byte reduction
in the table.

The elapsed times below are medians in ns per result, including the
callback and await. For Toss-held results, the repeated read is a
cached JS exposure. For JS-only results it is a round trip back through
Toss `%await`. The compact successful result uses a boxed value at
that await, which still suspends before resuming the Block.

| Runtime | Retained by | First JS exposure, previous → new | Repeated read, previous → new |
| --- | --- | ---: | ---: |
| Embedded | Toss | 796 → 873 | 563 → 545 |
| External | Toss | 901 → 873 | 568 → 577 |
| Embedded | JS only | 872 → 894 | 1904 → 2042 |
| External | JS only | 859 → 904 | 1858 → 2042 |

The regression fixture only hands out the public Promise. It returns
that Promise to Toss after completion and mutates the original Toss
Array. A second case sends a pending Promise back to cancel its owned
task and checks the original reason, one diagnostic after child
cleanup, and the same public Promise and Error on re-exposure.

### Round-trip await of a compact result

The JS-only benchmark now times an identity-checked re-exposure without
an await, then measures Blocks with one and eight Toss awaits of the same
incoming Promise. Await timings are medians of five samples of 20,000
reads per process. The heap snapshots still cover 100,000 promises that
stay reachable only from JS.

The earlier 7–10% difference was 4–6% on the one-await path in this
series. Re-exposure without an await showed no corresponding increase.
With Node 26.13.1 V8 Promise hooks, 10,000 repetitions of one compiled
round trip created 40,000 Promises at `17b5544` and 50,000 at
`a256362`. The awaited operand at `17b5544` was the retained native
Promise. At `a256362`, JavaScript takes its Promise resolution path for
the non-Promise result box.

An observation-only control skipped the idempotent observation update
for a compact result. A second trial saved the box in the calling task
and awaited a shared fulfilled Promise. The continuation retrieved the
box, cleared the suspension slot, and checked cancellation. The latter
trial removed the extra allocation in the same Node probe, reporting
40,000 Promises in 10,000 round trips.

These are medians of five fresh Deno 2.9.7 processes per version and
runtime on arm64 macOS, in ns per callback for elapsed times and
incremental bytes per retained result for heap.

| Runtime | Version | Re-expose without await | One await | Eight awaits | Heap after reads |
| --- | --- | ---: | ---: | ---: | ---: |
| Embedded | Retain native Promise (`17b5544`) | 368 | 1386 | 1698 | 613 |
| Embedded | Compact result (`a256362`) | 351 | 1438 | 1802 | 566 |
| Embedded | Observation-only control | 378 | 1785 | 1939 | 566 |
| Embedded | Shared Promise trial | 381 | 1402 | 1896 | 566 |
| External | Retain native Promise (`17b5544`) | 372 | 1410 | 1782 | 613 |
| External | Compact result (`a256362`) | 357 | 1488 | 1829 | 565 |
| External | Observation-only control | 360 | 1421 | 1795 | 565 |
| External | Shared Promise trial | 385 | 1540 | 1744 | 565 |

The shared Promise passes the cancellation checks and preserves the
47–48 bytes per result saved by compaction after reads. Its throughput
changed direction across workloads and runtime forms. The regression
suite now also verifies that awaiting a compact JS result suspends long
enough for an accepted cancellation to prevent resumption and publish
one diagnostic after cleanup.

### Generated waits for compact results

The follow-up separated the runtime resume branch from saving a result
on the task. The branch-only control adds the token comparison at
resumption to the compact runtime. The runtime-slot trial also stores the
box on the task and waits on a shared fulfilled Promise. Two emitter
trials choose the await target before suspension. One uses the task
slot for the box and the other uses a local variable in the generated
async Block. Those two trials use the same classification and
suspension path.

The control timings are medians in ns per callback from five fresh
Deno 2.9.7 processes per runtime and version on arm64 macOS. Each
benchmark retained 100,000 results from JS only.

| Runtime | Variant | One await | Eight awaits |
| --- | --- | ---: | ---: |
| Embedded | Compact result baseline | 1392 | 1726 |
| Embedded | Runtime resume comparison only | 1424 | 1799 |
| Embedded | Runtime branch and task slot | 1341 | 1703 |
| Embedded | Generated branch and task slot | 1469 | 1750 |
| Embedded | Generated branch and local, runtime helpers | 1447 | 1668 |
| External | Compact result baseline | 1357 | 1791 |
| External | Runtime resume comparison only | 1419 | 1820 |
| External | Runtime branch and task slot | 1371 | 1669 |
| External | Generated branch and task slot | 1356 | 1708 |
| External | Generated branch and local, runtime helpers | 1382 | 1714 |

The extra resume comparison measured 2–5% slower on the one-await
medians. Moving the box between the task and a local with the same
generated branch had mixed results. Neither control gives a portable
per-operation cost because branch placement and storage interact
with optimization and the rest of the async path.

The adopted emitter reads the compact result marker and the shared
fulfilled Promise directly. Each generated activation keeps its own
scratch locals. The two branches await either the normal awaitable
or the shared Promise before using the saved box. Both go
through the ordinary resumption check. The marker uses the existing
result-entry slot for the task or box, so it adds no per-result field.

In a separate series of five paired runs per runtime, the adopted
emitter produced these medians.

| Runtime | One await, previous → new | Eight awaits, previous → new | Heap after reads, bytes/result |
| --- | ---: | ---: | ---: |
| Embedded | 1393 → 1409 | 1757 → 1632 | 566 → 566 |
| External | 1407 → 1375 | 1729 → 1610 | 565 → 565 |

The eight-await case improved in five of five embedded runs and four
of five external runs. The one-await changes were small. In the same
series, the external ordinary Toss await before exposure was
1514 → 1550 ns, and launch and settle was 1486 → 1583 ns. The embedded
corresponding measurements were 1563 → 1517 and 1497 → 1514 ns.

Node 26.13.1 V8 Promise hooks on the generated embedded fixture counted
`50000 → 40000` Promise creations for 10,000 one-await callbacks and
`190000 → 110000` for 10,000 eight-await callbacks. Regressions also
exercise nested awaits, concurrent invocations, and awaits in an
extension while compact results are returned from JS.

### Launch and settlement with generated waits

The retained-results benchmark splits launch into the synchronous store
loop and the time from its end to the next timer turn. The latter
includes the continuations of the started Blocks and timer overhead.
The fixture compiles and warms up before timing launch. Each started
Block suspends once at `%await(42)`.

The controls cross the emitter and runtime from `4ae0319` and
`961b183`. The emitter-only control supplies the new marker and tick
to the previous runtime, which still returns its previous awaitable
shapes. The runtime-only control returns the box directly to the
previous emitter when reading a compact result. That adapter is never
taken by the launch fixture's literal await. The external module
bridge matches each control's runtime exports.

The table reports median ns per launched result across seven fresh
Deno 2.9.7 processes per case on arm64 macOS, with 100,000 results per
process and rotating variant order. The component medians are
calculated separately.

| Runtime | Variant | Launch and settle | Store loop | Drain to timer |
| --- | --- | ---: | ---: | ---: |
| Embedded | Previous | 1546 | 1441 | 105 |
| Embedded | Emitter only | 1560 | 1449 | 108 |
| Embedded | Runtime only | 1538 | 1433 | 90 |
| Embedded | Both | 1519 | 1421 | 98 |
| External | Previous | 1578 | 1488 | 90 |
| External | Emitter only | 1578 | 1458 | 115 |
| External | Runtime only | 1558 | 1469 | 97 |
| External | Both | 1589 | 1489 | 99 |

The earlier external launch increase of about 7% did not recur in this
series. The full change raised the external launch median by 0.7%,
and was slower than the previous version in three of seven paired
runs. The two controls were within 1.3% of the previous external
launch median. The phase measurements show how much of the elapsed
time falls within the store loop, with no consistent attribution of
the earlier gap to either component.

A trial that skipped only the compact-result branch for known ordinary
operands still boxed the operand and looked it up in the runtime. It
changed the launch median from 1526 to 1482 ns in embedded output and
from 1511 to 1525 ns in external output. Six of seven paired external
runs were slower, so this trial was dropped.

The adopted emitter specializes numeric and string literals. It checks
for accepted cancellation before suspending on the existing shared
fulfilled Promise, then supplies the literal to the ordinary resumption
check. The operand needs no result lookup and does not need a box until
resumption. The emitter still takes the compact result path for values
returned from JS. The runtime source and its result entry layout stay
the same.

A second comparison across seven fresh processes in each runtime
alternated runtime order and rotated the four variants. JS held the
100,000 public Promises after exposure. Times are median ns per result
for launch and ns per callback for reads. Heap is incremental V8 heap
bytes per result after the round trips.

| Runtime | Variant | Launch and settle | Store loop | Drain to timer | One await | Eight awaits | Heap |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Embedded | Before compaction (`17b5544`) | 1535 | 1426 | 96 | 1338 | 1650 | 614 |
| Embedded | Before generated compact waits (`4ae0319`) | 1463 | 1377 | 88 | 1339 | 1669 | 566 |
| Embedded | Generated compact waits (`961b183`) | 1508 | 1406 | 96 | 1313 | 1611 | 563 |
| Embedded | Shared tick for literals | 1400 | 1332 | 72 | 1400 | 1586 | 566 |
| External | Before compaction (`17b5544`) | 1502 | 1402 | 100 | 1301 | 1669 | 613 |
| External | Before generated compact waits (`4ae0319`) | 1469 | 1382 | 95 | 1351 | 1783 | 565 |
| External | Generated compact waits (`961b183`) | 1517 | 1418 | 98 | 1347 | 1554 | 565 |
| External | Shared tick for literals | 1401 | 1321 | 78 | 1380 | 1567 | 565 |

In this series the external launch median at `961b183` was 3.3%
above `4ae0319`, with six of seven paired runs slower. The size
of the gap varied between series. The shared tick reduced launch in
all seven pairs in each runtime against `961b183`. An independent
seven-pair comparison measured 1518 → 1421 ns embedded and
1519 → 1437 ns external. With eight awaits, the final medians kept
a 5% embedded and 12% external improvement over `4ae0319`.
One-await medians rose by 7% embedded and 2% external against
`961b183` in the four-variant series. Those callbacks still use
the same dynamic await emitter. The JS-only retained heap stayed
48 bytes below the pre-compaction result in both runtime forms.

### Isolated round-trip waits

The retained-results benchmark accepts a fifth argument to select the
scenario. `launch` times only the producer's store loop and continuations.
`one` and `eight` prepare, settle and expose the results before timing
only the selected reader, in separate processes. After exposure the
Toss store is cleared and the benchmark checks that re-exposure returns
the identical public Promise. `all` retains the original mixed workload
and heap measurements. The optional sixth argument `dynamic` changes
the producer's `%await(42)` to `%await($input)` with the same value.
This control compiles without the literal optimization in either version.

For example, from the repository root:

```sh
deno run --allow-read --v8-flags=--expose-gc \
  experiments/async-retained-results-benchmark.mjs \
  . embedded 100000 javascript one literal
```

The comparison used `961b183` and `36aa1fb` in alternating version
and runtime order on arm64 macOS with Deno 2.9.7. Each process retained
100,000 results. Reader timings are the median of five 20,000-callback
samples per process. Each variant in the one-await literal comparison
ran in 11 fresh processes per runtime. The newer version was slower
in six pairs in each runtime. The paired median changes were +1.4%
embedded and +2.9% external, with individual pairs moving in both
directions. Medians across processes were 1321 → 1301 ns embedded and
1294 → 1257 ns external.

The dynamic producer control ran in nine fresh processes per version
and runtime. Across pairs its median changes were +2.1% embedded
and −0.9% external, with substantial spread in both runtime forms.

Seven new-process pairs per runtime timed launch and the eight-await
reader separately. The rows report medians across processes.

| Isolated scenario | Embedded, previous → current | External, previous → current |
| --- | ---: | ---: |
| Launch and settle, ns/result | 2379 → 2126 | 2295 → 1953 |
| Eight awaits, ns/callback | 2321 → 2416 | 2407 → 2409 |
| Heap after eight awaits, bytes/result | 580 → 580 | 579 → 579 |

Launch improved in six embedded pairs and all seven external pairs.
The isolated eight-await medians were 4.1% higher embedded and within
0.1% external relative to the already optimized `961b183`. The paired
eight-await changes varied in both directions.

Comparing generated modules byte for byte found the same runtime
source for both versions. With the literal producer the only
difference in either runtime form was the producer's await
expression. With the dynamic producer the entire generated modules
matched.

In the original mixed workload the one-await medians were 1431 → 1475
ns embedded and 1373 → 1609 ns external. The newer version was slower
in all seven external pairs. In a separate series, warming the
one-await callback with 5,000 extra reads after exposure and just
before timing changed the external comparison to 1303 → 1313 ns,
with four of seven pairs slower. An interleaved external-only repeat
cycled through both versions with and without the extra warmup. The
paired median was +5.0% with the original sequence and −6.8% with
the extra warmup. The observed gap depends on the measurement
sequence. These comparisons do not isolate a specific V8 optimization
or collection event, and the isolated reads did not show a stable
regression. No additional compiler or runtime change was made.

The rows below use the original mixed workload. Each cell is the
median of five fresh processes measured in a series that also
included the pre-compaction version.

| Mixed workload | Embedded | External |
| --- | ---: | ---: |
| Launch and settle, `4ae0319` → `36aa1fb`, ns/result | 1719 → 1667 | 1644 → 1466 |
| Eight awaits, `4ae0319` → `36aa1fb`, ns/callback | 1870 → 1890 | 1926 → 1687 |
| Heap after reads, `17b5544` → `36aa1fb`, bytes/result | 614 → 566 | 613 → 565 |

A separate seven-pair run of the isolated eight-await scenario
measured `4ae0319` → `36aa1fb` at 1805 → 1591 ns embedded and
1796 → 1631 ns external. The paths still show an improvement in
isolation against the version from before generated compact waits.
The mixed embedded run did not reproduce that improvement.

### V8 tiering and collection during mixed reads

The benchmark accepts two more optional arguments. The seventh is the
number of extra one-await callbacks to run after publication in the
mixed JS-retention scenario. It defaults to zero. The eighth accepts
`on` for phase markers. A terminal or pseudo-terminal keeps the V8
tiering messages in order with the markers.

```sh
deno run --allow-read \
  --v8-flags=--expose-gc,--trace-opt,--trace-deopt,--trace-gc-nvp \
  experiments/async-retained-results-benchmark.mjs \
  . external 100000 javascript all literal 5000 on
```

This follow-up used the same Deno 2.9.7 build and arm64 macOS. External
one-await compares `961b183` to `36aa1fb`. Embedded eight-await
compares `4ae0319` to `36aa1fb`. The timed process medians use five
batches of 20,000 reads after preparing 100,000 public Promises. The
table reports medians across processes in ns per callback. The default
run used seven pairs per condition. The two flag controls used five.

| V8 setting | External one await, no extra warmup | External one await, 5,000 extra | Embedded eight awaits |
| --- | ---: | ---: | ---: |
| Default | 1354 → 1423 | 1407 → 1331 | 1855 → 1655 |
| Young semi-spaces fixed at 64 MiB | 1634 → 1656 | 1499 → 1564 | 1870 → 1751 |
| Maglev and TurboFan disabled | 2130 → 2162 | 2084 → 2154 | 3411 → 3466 |

The external default-setting result changed direction when comparing
medians across processes. The median of the within-pair changes was
+3.6% without the extra reads and +3.1% with them. This differs from
the earlier interleaved run. Under default settings the eight-await
embedded improvement appeared again in the mixed workload. Disabling
both optimizing tiers removed it in this series. That control changes
optimization throughout the fixture and does not identify a specific
compiled function.

In 18 additional processes traced through a pseudo-terminal, every
fixture completed three TurboFan optimizations during the one-await
samples and two during the eight-await samples. Those entries were
anonymous functions. There were no recorded deoptimizations in either
timed read window. A `wrong feedback cell` deoptimization of the
shared benchmark helper `readAll` occurred during initial warmup
in all 18 processes. The runtime also logged allocation-site tenuring
invalidation outside the read windows. The same tiering counts
appeared with and without the extra 5,000 reads.

In the pseudo-terminal series, external one-await elapsed medians
without extra reads were 1271 → 1354 ns. Subtracting logged stop times
from each batch before taking its process median gave 939 → 942 ns.
With extra reads those figures were 1286 → 1143 ns elapsed and
920 → 904 ns after pause subtraction. Pause subtraction is descriptive
and leaves concurrent work and any changes to allocation behavior in
the measured time. For the embedded eight-await comparison the traced
elapsed medians were 1773 → 1536 ns and the pause-adjusted medians
were 1478 → 1225 ns. GC pauses can move the external one-await result
at this scale, while the embedded improvement also appears outside
the logged pauses.

The large first-batch cost is a separate observation. With the
64 MiB semi-spaces and all JIT disabled via `--jitless`, the median
first batch without extra warmup cost 4523 → 4694 ns per callback,
against 2605 → 2615 ns for the median of later batches. No collection
was logged during any of those six first batches. Two more pairs
still had a slow first batch when incremental marking, concurrent
marking and concurrent sweeping were also disabled. An 80 ms wait
after the forced collections did not substitute for running extra
callbacks. A trial with a dedicated measurement loop and the same
call site for the extra reads still showed the first-batch cost.

Further timing placed the first-batch delay in its first 1,000
callbacks. One instrumented run took 56 ms for that segment and about
2.5 ms per 1,000 thereafter. Clocking just the two registration calls
in two additional external-runtime runs explained almost the entire
first callback's synchronous time. With JIT and background collection
disabled, and no logged collection during those calls, the costs
were 24.4–29.1 ms in `asyncResults.set` and 17.2–19.2 ms in
`hostReferences.set`. The first callback completed in 41.6–48.4 ms.
With extra reads after publication the measured window had no
registering call over 1 ms. This locates the cost in WeakMap updates
after preparing and collecting the retained workload. The timings
do not expose the table's internal resize or rebuild decisions.
Ordinary GC pauses account for an additional source of variation in
the mixed timing.

For embedded eight-await reads, two more controls disabled one
optimizing tier at a time. Across four process pairs, the median
elapsed time was 1667 → 1517 ns with Maglev disabled and
2074 → 1921 ns with TurboFan disabled. With either tier available the
benefit appeared. Together with the pause-adjusted trace and the
default runs, this distinguishes performance of the optimized
execution path from an effect of stop times alone. There is no trace
from the earlier series that lost the improvement.

The ordinary runtime now stores each result entry in a private field
on its own opaque async result. The reference is still frozen and
has a null prototype. Brand checks replace the internal WeakMap
lookups without invoking property traps. The map used to recover a
Toss result from a public Promise is retained. A separate prototype
stamped the reverse reference onto the object returned by
`Promise.then`. It had encouraging timings but would need additional
handling for host code that supplies a custom `then` or species
constructor returning a reused object.

In two post-change runs of the external map probe, the first
callback took 22.6 and 24.5 ms. Almost all of that time was the
remaining `hostReferences.set` call. The extra warmup absorbed that
spike in both pairs. The result reference now needs no map registration.

The table compares `36aa1fb` with the private-field implementation
in five fresh processes per configuration under default V8 flags.
The isolated launch check uses a separate process from the mixed
read and heap cases.

| Metric | Embedded, previous → private field | External, previous → private field |
| --- | ---: | ---: |
| Isolated launch and settle, ns/result | 1462 → 1178 | 1460 → 1242 |
| Mixed launch and settle, ns/result | 1381 → 1205 | 1554 → 1205 |
| Mixed one await, ns/callback | 1429 → 1037 | 1384 → 967 |
| Mixed eight awaits, ns/callback | 1628 → 1279 | 1628 → 1259 |
| JS-only heap after reads, bytes/result | 563 → 485 | 564 → 486 |

The original pre-compaction build retained 614 bytes per result in
embedded output and 613 bytes in external output in the same series.

### Private reverse references on public Promises

The remaining first-read spike came from inserting the new public
Promise into the reverse WeakMap. The benchmark now has a `first`
scenario. It uses the mixed setup, retains 100,000 public Promises,
and reports the first round-trip callback's synchronous return and
settlement times in milliseconds in a separate process.

```sh
deno run --allow-read --v8-flags=--expose-gc \
  experiments/async-retained-results-benchmark.mjs \
  . external 100000 javascript first
```

The ordinary runtime now keeps the reverse reference in a private
field on the object returned by `then`. It updates the field when
custom `then` or `Symbol.species` returns a previously published
object. When a generic JS reference to that object already exists,
the first publication removes the older reverse map entry. The
WeakMap remains the fallback when the returned value cannot receive
the private field. The field lives for as long as its host holder.
The cached public object and the original Toss async result are
still used in the two directions of the round trip.

The new regression registers a frozen Proxy as a generic JS
reference, then publishes it twice via custom `then`. It also
publishes a frozen Promise twice via a custom species constructor.
It checks host identity, the newest reverse association, and
unchanged reflected keys. The test fails against a prototype that
tries to initialize the private field on every publication.

Deno 2.9.7 on arm64 macOS ran seven pairs of fresh processes per
runtime and scenario, comparing `a47fe7f` with the private reverse
reference. Each process prepared 100,000 results. The readings below
are medians across processes. Launch and the first callback each ran
in their own scenario. The mixed reader medians use five samples
of 20,000 callbacks per process.

| Metric | Embedded, previous → private field | External, previous → private field |
| --- | ---: | ---: |
| First callback, synchronous return, ms | 21.087 → 0.069 | 19.896 → 0.067 |
| First callback, settled, ms | 21.105 → 0.074 | 19.915 → 0.071 |
| Isolated launch and settle, ns/result | 1275 → 1254 | 1268 → 1268 |
| Mixed one await, ns/callback | 1066 → 557 | 1071 → 545 |
| Mixed eight awaits, ns/callback | 1337 → 995 | 1315 → 961 |
| Mixed JS-only heap after reads, bytes/result | 487 → 449 | 486 → 448 |

The first callback improved in every pair. A five-pair control with
`--jitless`, 64 MiB semi-spaces, and incremental marking, concurrent
marking and concurrent sweeping disabled measured settled times of
19.599 → 0.032 ms embedded and 22.299 → 0.037 ms external.
The first-callback comparison excludes the earlier launch and
exposure phases.

Five additional process pairs for each isolated read scenario warmed
only the selected callback after exposure. One await measured
828 → 437 ns embedded and 802 → 417 ns external. Eight awaits measured
1324 → 806 ns embedded and 1306 → 822 ns external. Every pair improved
in both scenarios.

### Reverse-reference fallback for opaque values

There are two ways into the fallback. A custom `then` can return a
primitive. The WeakMap accepts an unregistered or well-known Symbol
on the tested engines. It rejects a registered Symbol and `null`.
JS-to-Toss conversion already rejects Symbol input, so it cannot
read the reverse association in any of these cases. The runtime now
checks the key with a separate, lazily allocated WeakMap and deletes
it immediately. The native key-validity behavior is preserved.
[ECMAScript weak keys](https://tc39.es/ecma262/2026/multipage/executable-code-and-execution-contexts.html#sec-canbeheldweakly)

The other route occurs when a host object rejects the private field
with a TypeError. The test exports a WebAssembly GC struct as
`externref`. Deno allows it as a WeakMap key and raises
`WebAssembly objects are opaque` when stamping a private field.
The same Wasm object is returned twice via custom `then` and twice
via custom `Symbol.species`. Both paths preserve host identity and
Toss reads the most recently associated result. Frozen ordinary
objects and Proxies can still take the private-field route.
HTML also specifies refusal for `WindowProxy` and `Location`.
The locally tested same-origin objects in Chromium 156 allowed the
field, so those browser cases were not used as refusal benchmarks.
[HTML private field host hook](https://html.spec.whatwg.org/multipage/webappapis.html#hostensurecanaddprivateelement)

The fallback benchmark has `symbol`, `wasm`, and `wasm-reuse`
scenarios. The first two prepare 100,000 distinct retained keys,
publish a transient batch of 100,000 more, collect, and time
publication of the next key. Heap is measured relative to the
already-allocated keys and 5,000 warmup publications. The reuse
scenario republishes one opaque object and polls the latest
result after the timed loop.

```sh
deno run --allow-read --v8-flags=--expose-gc \
  experiments/async-public-fallback-benchmark.mjs \
  . external wasm 100000
```

The following Deno 2.9.7 results are medians of five fresh process
pairs per runtime and scenario on arm64 macOS, comparing `5ffe1c6`
with primitive key validation that retains no result.

| Metric | Embedded, before → after | External, before → after |
| --- | ---: | ---: |
| Distinct Symbols, first publication after GC, ms | 17.59 → 0.028 | 18.38 → 0.028 |
| Distinct Symbols, incremental heap bytes/key | 470.45 → 0.17 | 470.40 → 0.15 |
| Distinct Wasm objects, first publication after GC, ms | 18.03 → 17.75 | 19.08 → 19.43 |
| Distinct Wasm objects, incremental heap bytes/key | 470.57 → 470.51 | 470.57 → 470.51 |
| Distinct Wasm objects, one await, ns/callback | 683 → 690 | 723 → 708 |
| Reused Wasm object, publication, ns/call | 3135 → 3223 | 3201 → 3206 |

Three earlier control pairs forced a TypeError before private
field initialization for every published Promise. With 100,000
distinct retained public Promises the first callback took 21.76 ms
embedded and 20.06 ms external, and incremental heap was 487
and 486 bytes per result. The ordinary private-field control had
first callbacks of 0.086 and 0.069 ms, and 448 retained bytes per
result in both forms. The Wasm benchmark verifies a similar spike
with native refusal and real weak keys.

The main trial cached successful object fallbacks and skipped later
failed stamp attempts. Reusing one Wasm object improved from about
3.2 microseconds to 0.65–0.70 microseconds per publication. In the
distinct-object scenario, the same trial increased the steady
one-await median from about 0.74–0.75 to 0.96–0.99 microseconds.
Using a dedicated map or activating the lookup only after observing
reuse also increased the read cost. Successful object fallback
therefore continues through the existing WeakMap. That association
is required to recover the original Toss result from the opaque
object.

Ordinary public Promises still use the private field. With three
fresh pairs their first round trip was 0.072 → 0.076 ms embedded
and 0.064 → 0.067 ms external. In seven mixed pairs, ordinary
launch was 1196 → 1193 ns embedded and 1201 → 1220 ns external.
One await was 528 → 518 ns embedded and 537 → 557 ns external.
Five isolated one-await pairs measured 417 → 415 ns embedded
and 417 → 425 ns external.

The 41 async ownership and boundary tests also passed with private
field refusal forced for all public objects in a separate build.
This exercises the WeakMap path for failure identity, cancellation
propagation and one diagnostic after child cleanup.

### Wasm fallback table and retained result footprint

A diagnostic build measured only the first `hostReferences.set`
after the transient batch and forced collections in the Wasm
fixture. A table-only build wrote the same weak keys with `true`
as the value. A third build skipped the write. The latter two
measure heap and publication only, since they cannot round trip
the original result. Values are medians of five fresh processes
per condition in Deno 2.9.7 on arm64 macOS. The workload uses
100,000 retained keys and a transient batch of the same size.

| Diagnostic build | Embedded first publication | External first publication | Embedded heap, bytes/key | External heap, bytes/key |
| --- | ---: | ---: | ---: | ---: |
| Original result entries, timed set | 21.12 ms | 19.46 ms | 470.52 | 470.52 |
| Weak table with boolean values | 16.90 ms | 19.14 ms | 82.80 | 82.81 |
| No write | 0.050 ms | 0.056 ms | 0.26 | 0.25 |

The timed set took 21.03 ms embedded and 19.38 ms external. The heap
difference between the table-only case and the result case was
about 388 bytes per key. The table estimate also includes any key
metadata introduced by insertion. It reflects the capacity left
by the burst of transient keys.

A separate Node 26.13.1 diagnostic used a plain WeakMap with the
same two batches of Wasm keys and boolean values. The first
insertion took 18.95 ms and V8 printed the same backing table
address before and after it. This matches V8's in-place rehash
path after collection leaves enough deleted slots in the table.
The public JS API has no explicit rehash operation.
[V8 hash table insertion and rehash](https://chromium.googlesource.com/v8/v8/%2B/22afaacd47a47baef49222b20e94083d0dd37e2d/src/objects/objects.cc#7749)

The representation trial allocates the opaque async result as a
normal private-field class instance, sets its prototype to null,
and freezes it. The former path stamped the private field onto
an object created by `Object.create(null)`. Node's V8 diagnostics
reported a dictionary representation for the former reference
allocation and fast properties for the new class allocation.
Both retain the original result entry with a private field. A
second trial stamped a plain object whose prototype had been
changed to null. It measured about 281 bytes per Wasm key, compared
with about 258 bytes for the class instance. The class instance
was selected.

Five process pairs per condition measured the selected representation
against `580dccf`. Independent launch and one-await runs use the
ordinary Promise fixture. The ordinary heap and eight-await values
come from the mixed retained-results fixture.

| Metric | Embedded, before → after | External, before → after |
| --- | ---: | ---: |
| Wasm first publication after GC, ms | 18.40 → 17.69 | 19.00 → 18.01 |
| Wasm one await, ns/callback | 693 → 629 | 744 → 636 |
| Wasm heap, bytes/key | 470.51 → 257.69 | 470.51 → 257.67 |
| Ordinary launch, ns/result | 1270 → 1241 | 1318 → 1230 |
| Ordinary isolated one await, ns/callback | 418 → 360 | 421 → 378 |
| Ordinary mixed eight awaits, ns/callback | 943 → 802 | 926 → 791 |
| Ordinary mixed heap, bytes/result | 446 → 225 | 447 → 224 |

The estimated result-related part of the Wasm heap is now about
175 bytes per retained key. The backing WeakMap is unchanged, so
the first insert can still take tens of milliseconds. A separate
five-pair series put the new representation at 21.53 ms embedded
and 16.19 ms external.

Two fixed-size sharding trials used two or four WeakMaps for the
object fallback. They split the rehash across two or four
successive publications. In the same comparison series the
four-map trial's first publication took 4.31 ms embedded and
3.83 ms external. Across the first eight calls it took 16.52 ms
embedded and 15.71 ms external, compared with 16.61 and 20.32 ms
for the original code. The four-map steady Wasm read took 744 and
717 ns per callback, compared with 721 and 724 ns for the original
code and 663 and 650 ns for the new representation alone. The
two-map version read in 726 and 691 ns. The implementation keeps
one table to preserve the simpler lookup and the read improvement.

A direct check of the generated external runtime also confirmed
the null prototype, frozen state, empty reflected own keys and
public-Promise round-trip identity. The 41 async ownership and
boundary tests passed on a build that forced all public objects
through the WeakMap fallback.

### Wasm fallback rehash thresholds and GC placement

The fallback benchmark accepts an optional transient key count,
GC placement and probe order after the retained count. The default
still publishes one transient key per retained key and collects after
releasing the transient batch. Each process now reports the first
eight publication times separately.

| GC placement | Preparation before the eight probes |
| --- | --- |
| `after` | Release the transient keys, then collect |
| `before` | Collect before publishing the transient batch, with no forced collection after it |
| `held` | Collect after both batches, retaining transient keys through the probes |
| `between` | Release and collect the first half, time the first insertion of the second half, then release and collect that second half |

`read-first` additionally times one round-trip await after preparation
and before the first probe publication. `publish-first` is the default.
All retained keys stay reachable in both orders.

```sh
deno run --allow-read --v8-flags=--expose-gc \
  experiments/async-public-fallback-benchmark.mjs \
  . external wasm 100000 120000 between
```

On Deno 2.9.7 on arm64 macOS, retaining 100,000 keys and starting
with 0, 49,000, 50,000 or 50,001 transient keys gave first publication
medians of 0.066–0.074 ms, with no sample above 1 ms in five processes
per configuration and runtime. At 51,000 transient keys the first
publication was 20.97 ms embedded and 21.67 ms external. At 100,000
transient keys it was 16.10 ms embedded and 18.68 ms external.
Every trial in both larger batches crossed 1 ms. The remaining
seven publications in those high-latency runs had per-run maxima
with medians below 0.08 ms.

Three further processes per runtime and size compared 40% and 60%
transient keys relative to retained keys. All of the 40% first
publications finished within 0.1 ms. The 60% medians were:

| Retained keys | Transient keys | Embedded first publication | External first publication |
| ---: | ---: | ---: | ---: |
| 25,000 | 15,000 | 4.09 ms | 4.40 ms |
| 50,000 | 30,000 | 9.29 ms | 8.67 ms |
| 200,000 | 120,000 | 46.67 ms | 42.69 ms |

The ratio separates the two behaviors in these workloads. Live
key count and backing table layout affect the duration once the
work is triggered. The result agrees with the V8 insertion path
that sends a table with many deleted slots to rehash.
[V8 weak-table insertion](https://chromium.googlesource.com/v8/v8/%2B/22afaacd47a47baef49222b20e94083d0dd37e2d/src/objects/objects.cc#7749)

A finer sweep at 100,000 retained keys found the first long
publication at 50,002 transient keys. All three runs per runtime
crossed 1 ms there and at 50,003, 50,010 and 50,100. The 50,001
case was below 1 ms in all five runs. These are boundaries for
this fixture and V8 build. Capacity pressure and engine state can
also affect insertion.

With 100,000 retained and 120,000 transient keys, five fresh
processes per runtime gave the following medians in milliseconds:

| GC placement | Embedded first publication | External first publication |
| --- | ---: | ---: |
| Before the transient batch | 0.044 | 0.028 |
| After the batch with its keys kept alive | 0.079 | 0.072 |
| After releasing the batch | 21.25 | 21.20 |
| Between released halves, first insertion of the second half | 20.80 | 19.44 |
| Between released halves, first insertion after both halves | 20.99 | 20.85 |

The medians of the summed pauses in the last two rows were
42.36 ms embedded and 40.73 ms external. GC with live keys
does not create the deleted slots that trigger this pause.

With 100,000 transient keys released and collected, moving one
round-trip await before publication took 0.234 ms embedded and
0.215 ms external. The following new fallback registration
still took 19.93 and 18.32 ms. The later seven registrations
had median per-process maxima below 0.07 ms. The Wasm
round-trip await did not pay the rehash before the first new
fallback key was inserted.

The runtime cannot choose when the host collects these keys or
explicitly rehash a WeakMap. A sentinel write would move the
same work to an earlier call. The earlier sharding trial split it
across successive registrations and cost more on the Wasm read
path than the single-table implementation. No runtime change
met the condition of removing the delay without moving cost to
other calls.

Splitting smaller transient batches of 51,000, 60,000 or 100,000
into two also did not remove the pause. In five processes per
condition and runtime, the first insertion between halves took
less than 1 ms, while every first insertion after the second
collection exceeded 1 ms. With zero transient keys, the first
round-trip await took 0.224 ms embedded and 0.234 ms external,
close to the read-first result after heavy churn.

### Natural GC under mixed Wasm retention

The churn benchmark does not expose or call forced GC. Each batch
publishes 256 distinct Wasm objects through the real custom-`then`
fallback, then round-trips one key from each of three cohorts. The
160 short-lived keys per batch stay for four batches, the 80 medium
keys for 128 batches, and the 16 long keys for 2,048 batches. At
the observed cadence of roughly 9–10 ms per batch, this represents
about 40 ms, 1.2 s, and 19–20 s. The rolling retained set has
43,648 slots. The anchored profile adds 100,000 keys retained for
the whole run and one more read per batch. Anchor preparation is
outside the timed workload. Each batch yields to a timer.

```sh
deno run --allow-read --v8-flags=--trace-gc \
  experiments/async-wasm-churn-benchmark.mjs \
  . external anchored 45 timing
```

The four 45-second runs below used Deno 2.9.7 on arm64 macOS.
They used the unmodified runtime and passive GC logging.
There is one fresh process per row. The latencies cover the
callback itself. Reads start after that batch's publishing loop,
so the read times exclude time spent queued behind a synchronous
publication or collection. The registration percentile upper
bound at p99 was 0.060 ms in all four runs.

| Runtime | Profile | Registrations | Registrations ≥1 ms | Max registration | Max next registration after ≥1 ms | Max one-await callback | Max logged GC pause |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Embedded | Mixed | 1,192,448 | 289 | 99.52 ms | 4.42 ms | 1.83 ms | 113.36 ms |
| External | Mixed | 1,226,752 | 279 | 13.79 ms | 0.93 ms | 4.28 ms | 57.23 ms |
| Embedded | Anchored | 1,238,528 | 124 | 35.43 ms | 0.61 ms | 2.70 ms | 146.41 ms |
| External | Anchored | 1,205,504 | 476 | 39.01 ms | 1.31 ms | 4.53 ms | 194.19 ms |

GC logs are for the whole process. The listed maxima occurred well
into the measured window. The registration maxima include all
causes, so they cannot be used as individual rehash timings.

For attribution, four more 30-second processes timed the actual
fallback `WeakMap.set` and emitted batch markers around the
publication and read work. The detailed V8 GC trace was captured
through a pseudo-terminal to preserve ordering with those markers.

```sh
deno run --allow-read --v8-flags=--trace-gc-nvp \
  experiments/async-wasm-churn-benchmark.mjs \
  . external anchored 30 trace
```

The next table counts 1 ms or longer calls to the measured
`WeakMap.set` in each 30-second trace. No such call had an earlier
GC pause logged in the same batch. The stricter column counts calls
that were the first publication after a GC logged between batches.
Those cases match the prior controlled rehash reproduction, including
the largest map call in each trace. The total count includes other
slow table writes such as potential growth. V8 does not provide an
exact rehash count in this trace, and rehashes shorter than 1 ms
are outside the count.

| Runtime | Profile | Map calls ≥1 ms | Map calls ≥8 ms | First after GC ≥1 ms | Max map call | Max next registration | Max one await in the same batch |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Embedded | Mixed | 16 | 4 | 4 | 12.30 ms | 0.400 ms | 0.162 ms |
| External | Mixed | 16 | 4 | 5 | 11.84 ms | 0.282 ms | 0.150 ms |
| Embedded | Anchored | 10 | 2 | 1 | 28.24 ms | 0.230 ms | 0.357 ms |
| External | Anchored | 7 | 4 | 2 | 26.07 ms | 0.058 ms | 0.235 ms |

All four traces still recorded slow map calls after the long cohort
began turning over. The stricter observations correspond to about
8–10 events per minute in mixed and 2–4 per minute in anchored.
These rates are short-series estimates from the tested allocation
rate. Anchor count increased the worst map pause in these traces.
The measured next registration and later read in the batch stayed
below 1 ms in every slow-map case.

Most collections in the detailed logs occurred between batches.
The largest logged pauses in the four traces were 74.21 and
53.50 ms in mixed, and 49.08 and 105.44 ms in anchored for embedded
and external, respectively. The external anchored maximum included
35.56 ms in V8's linear ephemeron marking phase across the isolate.
The GC trace does not break that number down by individual table.
There were also slow publications outside the timed map call
without a GC logged in their batch. The embedded anchored trace
included one of 84.42 ms, with 0.004 ms in the map, whose cause
was not classified.

A 60-second anchored repeat per runtime used no V8 tracing flags.
This checks whether the outliers require trace logging. It cannot
attribute individual outliers to a map call or a collection.

| Runtime | Registrations | Registrations ≥16 ms | Max registration | Max next registration after ≥1 ms | Max one await in a slow batch |
| --- | ---: | ---: | ---: | ---: | ---: |
| Embedded | 1,535,232 | 3 | 39.85 ms | 2.87 ms | 0.896 ms |
| External | 1,631,744 | 3 | 33.07 ms | 0.66 ms | 0.647 ms |

The results do not support adding a dedicated rehash mitigation to
the ordinary runtime. The measured cost is concentrated in individual
fallback writes. In a single JS thread it can still delay work
queued behind that call. A latency-sensitive application with this
much fallback traffic has a wider pause problem. The natural GC
pauses in this workload exceeded the map-write maxima, and sharding
the registrations would address only part of the observed delay.
The runtime code is unchanged.

### Natural GC with scheduled arrivals

The churn benchmark's `scheduled` mode queues 256 publications
every 10 ms. One read with a single await is due halfway through each slot,
independently of when the publications finish. The scheduler processes
every due job in order, including arrivals that became due while
the thread was stopped. The queue clock starts at the scheduled
arrival and ends when the callback starts. For publications it
includes creation of the batch's keys and waiting behind the
earlier callbacks in the same batch. End-to-end time runs from
the scheduled arrival to return for publication and settlement
for the read. Browser timer, network and application queueing
are outside this fixture.

Two factors are varied independently:

- `keys` and `anchored` each hold 100,000 Wasm keys for the entire
  run. Only `anchored` gives those keys published results and
  reverse-map entries. Neither profile reads the anchor keys
  during the timed section.
- The extra publication argument is 0 or 256 per slot. The extra
  keys are released after the slot. The same 256 ordinary cohort
  keys and one read per slot are present in both cases. This
  varies temporary allocation and registration churn together,
  as they occur in the Wasm path.

The normal cohorts retain keys for 4, 128 and 2,048 slots. Setup
is before the `SCHEDULE_START` marker, and `SCHEDULE_END`
follows completion of every scheduled request. The harness does
not expose or call forced GC.

```sh
deno run --allow-read --v8-flags=--trace-gc-nvp \
  experiments/async-wasm-churn-benchmark.mjs \
  . external anchored 40 scheduled 256
```

The matrix below is one fresh Deno 2.9.7 process per cell on arm64
macOS, with 40 seconds of scheduled arrivals. Every process handled
4,000 reads and either 1,024,000 or 2,048,000 publications.
A pseudo-terminal kept V8's natural GC lines in order with the phase
markers. Allocated MB/s comes from the GC log's allocation counters.
Post-major heap is the logged object size after collection, so the
median also reflects the evolving cohorts. The queue and end-to-end
columns give separate maxima.

| Runtime | Anchor profile | Extra/slot | Allocated MB/s | Young collections | Major collections | Max major pause | Median post-major heap |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Embedded | keys | 0 | 78.5 | 138 | 4 | 63.41 ms | 18.5 MB |
| Embedded | keys | 256 | 155.4 | 251 | 6 | 124.44 ms | 26.5 MB |
| Embedded | anchored | 0 | 78.3 | 121 | 2 | 119.94 ms | 43.9 MB |
| Embedded | anchored | 256 | 156.5 | 235 | 3 | 349.70 ms | 66.4 MB |
| External | keys | 0 | 78.8 | 133 | 5 | 87.88 ms | 23.1 MB |
| External | keys | 256 | 155.9 | 250 | 6 | 131.65 ms | 26.8 MB |
| External | anchored | 0 | 79.4 | 121 | 2 | 165.66 ms | 57.3 MB |
| External | anchored | 256 | 156.0 | 234 | 3 | 317.14 ms | 66.0 MB |

| Runtime | Anchor profile | Extra/slot | Publication queue / end-to-end max | One-await queue / end-to-end max | One awaits ≥16 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Embedded | keys | 0 | 75.44 / 75.45 ms | 70.45 / 70.48 ms | 0.40% |
| Embedded | keys | 256 | 138.88 / 138.88 ms | 133.89 / 133.93 ms | 1.23% |
| Embedded | anchored | 0 | 154.08 / 154.08 ms | 149.09 / 149.11 ms | 0.50% |
| Embedded | anchored | 256 | 386.72 / 386.72 ms | 381.73 / 381.84 ms | 2.30% |
| External | keys | 0 | 551.52 / 551.53 ms | 546.53 / 546.64 ms | 4.62% |
| External | keys | 256 | 146.83 / 146.83 ms | 141.84 / 141.89 ms | 1.85% |
| External | anchored | 0 | 198.41 / 198.41 ms | 193.41 / 193.45 ms | 0.83% |
| External | anchored | 256 | 369.30 / 369.31 ms | 364.32 / 364.41 ms | 1.88% |

Keeping the anchor profile fixed, the extra transient publications
nearly doubled the measured allocation rate in every pair and
increased young collections from 121–138 to 234–251 per run. It also
increased the largest major stop in each pair. This changes allocation
and weak-table churn together.

At a fixed offered rate, keeping the anchor results increased the
median heap after a major collection by roughly 25–40 MB. The total
allocation rate was nearly unchanged. The number of major pauses
fell from 4–6 to 2–3, but the worst pauses increased. At the high
rate the longest embedded and external pauses spent 332 and 296 ms
in marking, including 126 and 110 ms of linear ephemeron marking,
respectively. That V8 phase is for the whole isolate.

Callback execution alone understates the observed tail. The external
anchored high-rate read ran for at most 0.624 ms after it started,
while its scheduled end-to-end maximum was 364.41 ms. The embedded
counterpart took at most 2.613 ms in the callback and 381.84 ms
end to end. The external keys-only low-rate run had a separate
546.64 ms read outlier. Its largest logged GC stop was 87.88 ms,
its slowest single publication 79.93 ms, and its slowest read
callback 8.75 ms. The raw end-to-end maximum therefore cannot be
attributed to one GC pause or one measured callback.

Two further 40-second anchored high-rate runs used no V8 log flags.
Both completed all 2,048,000 publications and 4,000 reads.

| Runtime | Max publication including wait | Max one await including wait | Max one-await callback alone | One awaits ≥16 ms |
| --- | ---: | ---: | ---: | ---: |
| Embedded | 720.72 ms | 715.86 ms | 13.94 ms | 8.88% |
| External | 518.04 ms | 513.12 ms | 10.68 ms | 2.78% |

These repeats show that long scheduled delays do not depend on GC
trace logging. They do not measure GC stop times, and the maxima
vary substantially across processes.

Two diagnostic repeats logged late slot boundaries with the
collector trace. In the external keys-only low-rate repeat, the
earlier 546.64 ms outlier did not recur. A timer wait of 89.71 ms
included an 89.44 ms major collection. The next publication batch
took 20.47 ms, and the queued read waited 104.63 ms for a 0.032 ms
callback. This shows how a GC pause can propagate into later jobs
without a similarly long read.

The embedded anchored high-rate repeat showed both patterns.
A 133.59 ms timer wait included a 132.83 ms major pause.
At a different point in the same run the queue was already late
and several publication batches exceeded their 10 ms slots.
One batch of publishing calls took 160.46 ms while its arrival
was already 321.79 ms late. The longest read queue wait eventually
reached 537.55 ms, while the largest recorded GC pause was
132.83 ms. The slow batches and queue debt are observable. The
trace does not attribute the remaining batch time to a specific
V8 operation or host scheduling event.

A 16 ms p99 target needs mitigation at the tested 51,200
publications per second. All four matrix cells at that rate
had more than 1% of reads at or above 16 ms, including both
keys-only controls. With 100,000 results held, even the lower
25,600 per second rate exceeded 100 ms end to end in both forms.
A hard 100 ms target under that retention load also needs
mitigation. These are conditions observed in this workload,
not universal thresholds. The results point to temporary
allocation rate, retained result volume and queue backlog as
the relevant levers. The runtime code is unchanged.

### Queue budgets under Wasm allocation and retention changes

The scheduled benchmark now accepts a JSON configuration after the
extra-publication count. `batch` sets the normal cohort keys per
slot, `period` sets the interval in milliseconds, `anchorKeys` sets
the number of keys pinned for the run, and `anchorResults` sets the
number of those keys with published results. Batch splitting scales
the number of retained cohorts to keep their wall-time lifetimes at
40 ms, 1,280 ms and 20,480 ms in the tested configurations. Reads
remain on the same 10 ms schedule in all cases. When a publication
and read share a due time, publication runs first. All due jobs
are recorded, including those delayed during catch-up.

The `knownFallback` option is an allocation control in the benchmark
only. The benchmark knows that its custom `then` returns an opaque
Wasm key. For that publication it writes to the same WeakMap
without attempting a private field and catching a TypeError. This
keeps result associations and offered throughput the same while
avoiding the failed stamp and its temporary work. Read callbacks
still publish ordinary Promises through the original branch. This
experiment does not introduce such a capability into the Toss
runtime.

```sh
deno run --allow-read --v8-flags=--trace-gc-nvp \
  experiments/async-wasm-churn-benchmark.mjs \
  . external anchored 25 scheduled 128 '{"batch":128,"period":5}'
```

The comparison uses a 16 ms p99 upper bound from the benchmark's
histogram and an exact observed maximum of 100 ms for both
publication and the one-await read. It uses queue-inclusive
latencies. Passing a run describes that finite observation.

The initial comparison uses one 25-second Deno 2.9.7 process
per runtime and case on arm64 macOS, with passive natural-GC
tracing. All cases ran 100 reads per second. The names below
denote the following changes:

- Base. 100,000 anchor results, 256 ordinary and 256 temporary
  publications every 10 ms.
- Allocation control. The base with `knownFallback`.
- Result cap. Publish only 25,000 of the same 100,000 anchor keys.
  The publication schedule stays fixed.
- Split batch. Use 128 ordinary and 128 temporary publications
  every 5 ms, preserving throughput and cohort retention.
- Remove extra. Keep the 256 ordinary publications per 10 ms
  and all 100,000 anchor results, omitting the temporary batch.
- Combined prototype. Use 10,000 anchor results, 128 ordinary
  publications per 5 ms, no extra publications, and
  `knownFallback`.
- Lower rate. Use 10,000 anchor results and 128 ordinary
  publications per 10 ms on the ordinary runtime.

| Case | Runtime | Actual publications/s | Allocated MB/s | Publication p99 bound / max, ms | One-await p99 bound / max, ms | Both budgets |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Base | Embedded | 51,207 | 156.2 | 32 / 166.59 | 32 / 161.65 | Fail |
| Base | External | 51,207 | 157.3 | 64 / 226.24 | 64 / 221.30 | Fail |
| Allocation control | Embedded | 51,208 | 92.9 | 64 / 174.90 | 64 / 169.97 | Fail |
| Allocation control | External | 51,208 | 93.2 | 64 / 164.67 | 64 / 159.72 | Fail |
| Result cap | Embedded | 51,207 | 155.5 | 64 / 152.81 | 32 / 147.87 | Fail |
| Result cap | External | 51,208 | 157.9 | 128 / 294.94 | 128 / 290.03 | Fail |
| Split batch | Embedded | 51,205 | 157.2 | 128 / 278.73 | 128 / 274.78 | Fail |
| Split batch | External | 51,202 | 157.4 | 128 / 259.33 | 128 / 259.38 | Fail |
| Remove extra | Embedded | 25,603 | 79.1 | 8 / 68.61 | 8 / 63.68 | Pass |
| Remove extra | External | 25,604 | 79.3 | 8 / 69.12 | 4 / 64.16 | Pass |
| Combined prototype | Embedded | 25,603 | 46.5 | 16 / 41.68 | 8 / 37.94 | Pass |
| Combined prototype | External | 25,603 | 47.2 | 8 / 64.65 | 8 / 59.76 | Pass |
| Lower rate | Embedded | 12,801 | 39.7 | 8 / 19.06 | 4 / 14.95 | Pass |
| Lower rate | External | 12,802 | 40.3 | 8 / 28.74 | 8 / 26.18 | Pass |

The allocation control cut allocated MB/s by about 40% at the same
publication rate. With 100,000 anchor results it still missed both
latency budgets. The result cap alone still kept the high rate of
transient publication. Splitting the batch kept allocation near
157 MB/s and also missed the budgets. These runs establish that
none of the isolated changes crossed both targets at 51,200/s.
They do not establish that every latency difference between the
individual runs was caused by the varied parameter.

Removing the extra batch met the targets for both runtimes in this
25-second series. An independent 40-second run from the preceding
study with the same 100,000 result anchors and 25,600 publications/s
reached 154.08 and 198.41 ms for publication and 149.11 and
193.45 ms for one await, embedded and external respectively.
The 25-second pass is sensitive to the observation window.

The confirmation used fresh 45-second processes with the ordinary
runtime and without V8 trace flags. Both profiles pinned 10,000
published results in addition to the rotating cohorts, registered
128 cohort keys per slot, and omitted the extra temporary batch.
Each process completed all 4,500 scheduled reads.

| Slot interval | Runtime | Actual publications/s | Publication p99 bound / max, ms | One-await p99 bound / max, ms | Both budgets |
| --- | --- | ---: | ---: | ---: | --- |
| 5 ms | Embedded | 25,601 | 16 / 81.50 | 16 / 77.02 | Pass |
| 5 ms | External | 25,601 | 16 / 75.88 | 16 / 71.41 | Pass |
| 10 ms | Embedded | 12,801 | 16 / 55.21 | 16 / 50.25 | Pass |
| 10 ms | External | 12,801 | 16 / 42.41 | 16 / 37.45 | Pass |

To reproduce the 5 ms condition without GC tracing, select
`embedded` or `external` in the following command.

```sh
deno run --allow-read experiments/async-wasm-churn-benchmark.mjs \
  . embedded anchored 45 scheduled 0 \
  '{"batch":128,"period":5,"anchorKeys":10000}'
```

The 5 ms profile preserved the ordinary publication rate of the
base workload and met both budgets in both runtime forms. The
production runtime can use this workload shape without the
benchmark-only allocation control. The 10 ms profile halved
throughput and left more margin against the 100 ms maximum in
both runtimes. At 51,200 total publications/s, the benchmark
found no passing single change. The 45-second maxima do not
establish a hard upper bound for longer runs or other hosts.

### Three-minute queue budget repeats

The 45-second profiles were repeated in separate, sequential 180-second Deno
2.9.7 processes on arm64 macOS with the production runtime. The budget runs used
neither forced GC nor trace flags. Each run pinned 10,000 published results,
used batches of 128 publications with no extra batch, and scheduled one read
every 10 ms. Changing the publication interval preserves the rotating cohorts'
retention times. It also changes their capacity from 21,824 results at 10 ms to
43,648 at 5 ms, in addition to the 10,000 pinned results.

```sh
for pair in embedded:5 external:5 external:10 embedded:10; do
  deno run --allow-read experiments/async-wasm-churn-benchmark.mjs \
    . "${pair%:*}" anchored 180 scheduled 0 \
    "{\"batch\":128,\"period\":${pair#*:},\"anchorKeys\":10000}"
done
```

Each process completed all 18,000 reads and all 4,608,000 or 2,304,000
registrations. Latencies below include queue wait.

| Interval | Runtime  | Actual registrations/s | Registration p99 bound / max, ms | One-await p99 bound / max, ms | Registration / read at or above 16 ms |
| -------- | -------- | ---------------------: | -------------------------------: | ----------------------------: | ------------------------------------: |
| 5 ms     | Embedded |               25,600.1 |                      16 / 130.26 |                   16 / 125.82 |                       0.836% / 0.839% |
| 5 ms     | External |               25,599.9 |                      16 / 126.83 |                   16 / 126.86 |                       0.637% / 0.811% |
| 10 ms    | Embedded |               12,800.2 |                   128 / 1,004.18 |                  128 / 999.76 |                       1.621% / 1.539% |
| 10 ms    | External |               12,800.3 |                      16 / 123.59 |                   16 / 118.62 |                       0.372% / 0.339% |

All combinations exceeded the 100 ms maximum. The embedded 10 ms run also
exceeded the 16 ms p99 target for both metrics. In the other three runs, the
largest queue waits were within 0.04 ms of the corresponding end-to-end maxima
across each run. The largest individual registration calls were 20.78 to 27.49
ms. In the embedded 10 ms run a single registration call took 627.31 ms, and the
largest registration and read queue waits were 1,004.17 and 999.72 ms
respectively. These maxima are computed independently and need not come from the
same job.

Separate diagnostic processes used passive V8 GC tracing and logged the
boundaries of late scheduler slots. They kept the same intervals, cohorts and
retention. For example, 43.37 s into the embedded 5 ms run, a 126.80 ms major
collection coincided with a 126.94 ms timer wait. The collector reported 118.48
ms of marking, including 45.82 ms of linear ephemeron marking. The next
registration batch took 16.26 ms. The following read spent 137.17 ms in the
queue and 0.03 ms in the callback.

At 11.00 s in that same run, a different breach began in a 114.77 ms
registration batch with a 109.67 ms individual call. The preceding timer wait
was 4.68 ms, and there was no matching GC pause in the trace. A read due with
the batch waited 117.57 ms. The delay is localized to the registration call. The
operation within that call remains unidentified.

Seven of eight over-100 ms episodes in that diagnostic run coincided with a
major collection during a timer wait. Some collections were below 100 ms
themselves. At 155.79 s an 80.03 ms collection was followed by a batch
containing a 21.71 ms registration call, and the episode crossed 100 ms.

The external 5 ms diagnostic also had five over-100 ms episodes with major
collections during timer waits. A sixth crossed 522 ms at about 117 s. Before
the longest registration call, its batch already had 179.92 ms of backlog. A
340.08 ms young collection was recorded inside the batch, whose slowest
registration call took 340.20 ms. The read due with the batch waited 522.49 ms
and took 0.06 ms to finish the callback. The relative contributions of collector
CPU work and host descheduling during that pause remain unknown.

The external 10 ms diagnostic reproduced the maximum breach in three episodes.
Their major collections took 95.32 ms, 101.13 ms and 111.08 ms. With the 95.32
ms collection, the first affected read finished in 95.33 ms, and the subsequent
registration batch pushed the episode's maximum to 106.47 ms. The episode with
the 111.08 ms collection started just before the end of the 180-second schedule
and peaked at 123.25 ms.

The embedded 10 ms diagnostic also exceeded the maximum, with 123.99 ms for
registration and 119.05 ms for one await. Both p99 upper bounds were 16 ms. Its
over-100 ms episode was 81.07 s into the schedule. A 116.40 ms major collection
coincided with a 117.95 ms timer wait. During catch-up, the slowest registration
call took 12.38 ms, including 12.35 ms in the fallback WeakMap write. That write
is a measured location, and the probe cannot separate map work from a host delay
inside the write. The largest measured map write in a late slot was 24.74 ms.
The near-one-second baseline episode and its 627.31 ms call did not recur in
this diagnostic repeat, so their trigger remains unknown.

Both publication rates produced queue delays above 100 ms in both traced and
untraced runs. The 45-second pass therefore does not establish that either rate
sustains the joint budget at this retention. The traced repetitions demonstrate
collection-driven queue buildup and, at the higher rate, a separate registration
stall with no matching collection. They also show why a pause below 100 ms can
exceed the hard limit once the following batch is included.

### Separating fallback writes, collection, and host scheduling

The same 10,000 fixed results, rolling cohorts, batch size of 128 and 10 ms read
interval were repeated in four sequential 120-second processes on arm64 macOS
with Deno 2.9.7. The production-runtime budget runs used no V8 tracing flags.
Every run completed all scheduled jobs. The measurements below include queue
wait. Percentiles are histogram upper bounds.

| Interval | Runtime  | Registrations/s | Registration p99 / max, ms | One-await p99 / max, ms |
| -------- | -------- | --------------: | -------------------------: | ----------------------: |
| 5 ms     | Embedded |        25,600.4 |               128 / 554.28 |            128 / 553.31 |
| 5 ms     | External |        25,600.4 |                32 / 243.79 |             32 / 243.84 |
| 10 ms    | Embedded |        12,800.3 |                16 / 121.76 |             16 / 116.79 |
| 10 ms    | External |        12,800.3 |                16 / 117.68 |             16 / 112.73 |

Use the same reproduction command as for the three-minute runs, with a
120-second schedule. The runs at both rates exceeded the 100 ms maximum. The two
5 ms runs also exceeded the 16 ms p99 target. The embedded 10 ms baseline did
not repeat the approximately one-second event.

Separate 120-second diagnostic processes measured elapsed time and macOS
`CLOCK_THREAD_CPUTIME_ID` around registrations and the exact fallback
`WeakMap.set`. A native observer sampled the benchmark thread using
`THREAD_BASIC_INFO` at a nominal 4 ms interval. Natural V8 GC was recorded with
`--trace-gc-nvp` on the same pseudo-terminal as the scheduler markers. No
process invoked or exposed forced GC.

A calibration on this host recorded 53.67 ms of thread CPU and 11 running
samples during a 60.06 ms busy loop. An explicit blocking wait took 67.11 ms,
used 0.09 ms of thread CPU, and had 11 waiting and zero running samples. Thread
state is sampled, so the total elapsed time minus thread CPU is more precise
than using the sample counts to estimate a stall's length.

| Interval | Runtime  | Registration p99 / max, ms | One-await p99 / max, ms |
| -------- | -------- | -------------------------: | ----------------------: |
| 5 ms     | Embedded |                16 / 137.75 |             16 / 133.52 |
| 5 ms     | External |                32 / 169.46 |             32 / 169.53 |
| 10 ms    | Embedded |                 32 / 87.22 |              16 / 82.30 |
| 10 ms    | External |                16 / 130.51 |             16 / 125.59 |

These diagnostic distributions include the effects of the probes and are
reported separately from the production-runtime budget runs.

V8's insertion path can do a table rehash or capacity work within the same
WeakMap call. The probe locates CPU time inside that call, and has no V8 rehash
event counter. The previous threshold sweep provides an independent rehash
reproduction.
[V8 weak collection insertion](https://chromium.googlesource.com/v8/v8/%2B/0dd2a1712162de72da0f413b4de9056cbe31ef29/src/builtins/builtins-collections-gen.cc#2052)

The embedded 5 ms trace caught a 119.78 ms major collection during a 122.17 ms
timer wait. The first batch registration after the collection spent 16.62 ms of
thread CPU inside the map write. Its queued read took 133.52 ms end to end, of
which only 0.05 ms was in the read callback. A distinct post-collection first
write used 19.25 ms of thread CPU in 20.03 ms elapsed. The first-write pattern
and concentrated CPU are consistent with table rehashing.

Off-CPU stops occurred independently. In the embedded 10 ms trace, one call took
51.88 ms with 0.11 ms of thread CPU and a map write under 0.01 ms. Another write
took 21.81 ms with 0.27 ms thread CPU and four waiting samples. Neither
coincided with any GC record. The embedded 5 ms trace likewise had a 22.87 ms
write with 0.03 ms of thread CPU and no coincident GC record. A long write's
elapsed duration alone overstates the time spent working on the table.

In the external 5 ms trace, a 130.77 ms individual registration overlapped a
113.64 ms major collection. Its map write took 16.98 ms elapsed and used 16.05
ms of thread CPU, after the collection. Separately, a 30.83 ms registration
without an overlapping GC used 0.04 ms of thread CPU and returned from the map
within 0.01 ms. The external form can exhibit the same distinction between a
long call overlapping GC and an off-CPU call outside the map. At the 10 ms
interval the external trace also recorded a 51.23 ms timer wait without
overlapping GC and with just 0.14 ms of benchmark-thread CPU. Its largest queue
delay was a different episode that followed a 111.96 ms major collection. The
corresponding read spent 125.56 ms in the queue and 0.03 ms running its
callback.

Mach reports a thread as `TH_STATE_RUNNING` when it is executing or on the run
queue. A running sample during a span with negligible thread CPU supports
scheduling delay, while a waiting sample supports blocking. Sparse samples leave
the full interval unclassified.
[XNU state mapping](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/thread.c)
[XNU thread state flags](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/thread.h#L3020-L3026)

Two fresh 90-second embedded diagnostics gave registration and read p99/max
pairs of 32/184.58 ms and 64/180.83 ms at the 5 ms interval, and 16/72.61 ms and
8/67.70 ms at the 10 ms interval. The 5 ms trace again showed both mechanisms. A
161.97 ms major collection was followed by a 23.25 ms map write with 21.78 ms of
thread CPU. A separate 43.01 ms registration without GC used 0.07 ms of thread
CPU and spent under 0.01 ms inside the map. The 10 ms trace had a timer wake
53.31 ms past its due time with 0.08 ms of thread CPU, one running and one
waiting sample, and no concurrent GC.

The original embedded 627.31 ms registration, near-one-second queue delay, and
109.67 ms registration did not recur at their original sizes in the timed
traces. Their exact causes remain unknown. The new evidence separates
CPU-intensive map writes on the scale of tens of milliseconds, GC pauses that
feed backlogged batches, and off-CPU waits inside and outside the map. The
latter can occur without a matching GC record, and the Mach samples only support
a scheduler attribution for parts of some spans.

### Host CPU contention and queue tails

The same 10,000 fixed results, rolling cohorts, 128 registrations per slot and
one read per 10 ms were used for both runtimes at both rates. Separate processes
scheduled 120 seconds of arrivals in each cell. Each used the thread-clock probe
and passive `--trace-gc-nvp` capture, with no forced GC. The measurements
include probe overhead. They compare conditions with identical instrumentation.

The load generator ran 16 normal-priority arithmetic workers against 12 logical
CPUs. It started before the benchmark process and stopped after all arrivals
drained. The comparison condition used the existing host workload with no added
workers. Mach host CPU tick deltas measured utilization at roughly one-second
intervals. The order of loaded and no-added-load processes was reversed for half
of the profile pairs.

The probe measured benchmark-thread CPU time around calls and sampled the
thread's Mach state and cumulative CPU time at a nominal 4 ms interval. An
estimate uses adjacent samples of the same state at most 12 ms apart. For each
covered interval, it deducts the thread CPU delta, then assigns the remaining
time to runnable or blocked according to the sampled state. Transitions, long
gaps and interval edges contribute to the unclassified part of elapsed time
minus CPU time. State-duration estimates are capped by that measured total. In a
calibration, an 80.03 ms busy loop used 79.66 ms of thread CPU, but the uncapped
sample estimate assigned 22.24 ms to runnable wait. The wall-minus-CPU cap
reduces that estimate to 0.37 ms. An explicit wait took 85.28 ms with 0.09 ms of
thread CPU and 79.80 ms of estimated blocking. The category split is an
estimate, with stronger evidence in the long calls that consumed almost no CPU.

| Publications/s | Runtime  | Added load | Host CPU median |   Registration p99 / max, ms | One-await p99 / max, ms |
| -------------: | -------- | ---------- | --------------: | ---------------------------: | ----------------------: |
|         12,800 | Embedded | None       |           60.1% |         31.03–37.44 / 222.40 |          35.50 / 217.49 |
|         12,800 | Embedded | 16 workers |          100.0% |         13.40–20.48 / 227.99 |          17.29 / 223.05 |
|         12,800 | External | None       |           44.2% |         16.49–21.19 / 213.59 |          19.02 / 208.63 |
|         12,800 | External | 16 workers |          100.0% |                  ≤8 / 122.82 |             ≤8 / 117.90 |
|         25,600 | Embedded | None       |           50.0% |         61.35–64.25 / 410.09 |          66.18 / 410.17 |
|         25,600 | Embedded | 16 workers |          100.0% |       250.36–252.46 / 497.04 |         250.76 / 497.18 |
|         25,600 | External | None       |           40.3% |         25.16–28.04 / 212.39 |          27.59 / 212.44 |
|         25,600 | External | 16 workers |          100.0% | 2,751.38–2,755.68 / 2,921.62 |     2,756.29 / 2,923.59 |

All 12,000 scheduled reads and all 1,536,000 or 3,072,000 scheduled
registrations completed in every cell. Latencies include queue wait. Slow reads
were individually logged, so their 99th percentile can be recovered when it
exceeds the logging cutoff. Each slow registration batch provides lower and
upper bounds for all its registrations from the end of key creation and the end
of the publish loop. The ranks of these bounds give the displayed registration
p99 ranges. The remaining low percentiles use the existing 8 ms histogram bound.
This also avoids using the maximum as a substitute for the percentile when the
benchmark overflows its 1,024 ms histogram.

The four no-added-load runs had host CPU medians of 40.3–60.1%. The lowest
one-second sample among those runs was 20.6%. The loaded runs ranged from 99.6%
to 100%. The comparison is between the existing host load and added contention.
The host remained active in the no-added-load runs. A separate 60-second check
after stopping all workers measured 23.0% minimum, 43.0% median and 75.1%
maximum. The idle gate of ten consecutive samples at or below 20% CPU busy never
opened, so the idle comparison remains unmeasured.

At 12,800/s under added load, the embedded runtime had a 52.96 ms registration
with 0.06 ms of thread CPU and no matching GC. Six Mach samples reported the
thread runnable, supporting 36.72 ms of runnable wait. The remaining 16.17 ms of
off-CPU time lacked state coverage. At 25,600/s the same loaded runtime had a
71.33 ms registration with 0.08 ms of thread CPU, a near-instant map write and
no matching GC. Fourteen runnable samples supported 68.34 ms of runnable wait
and left 2.92 ms unclassified.

The external no-added-load trace at 25,600/s recorded a 78.03 ms registration
with 22.24 ms of thread CPU and no matching GC. Its 55.80 ms off-CPU time split
into an estimated 26.33 ms runnable, 9.40 ms blocked and 20.06 ms unclassified.
It spent 78.01 ms elapsed inside the fallback map write. The write's elapsed
time included both table work and time off CPU. The embedded no-added-load trace
at 25,600/s also recorded a 9.88 ms registration with no matching GC, 0.21 ms of
thread CPU and two blocked samples. It assigned 5.01 ms to blocking and left
4.65 ms unclassified.

A separate loaded embedded 25,600/s episode showed how GC can amplify a
scheduling delay. A 361.51 ms major collection overlapped a 361.10 ms
post-deadline timer wake delay, during which the benchmark thread used 177.53 ms
of CPU. All 73 sampled states in the wake-delay window were runnable. Subsequent
registrations added further delay.

Under added load the external 25,600/s run recorded a 2,923.45 ms read queue
wait and 0.14 ms of read service. At least 1,250 reads waited 900 ms or more,
with 1,232 waiting at least one second. Backlog preceded the longest individual
calls and grew through successive registration delays and natural collections.
In that run a 104.12 ms registration with no matching GC used 0.04 ms of thread
CPU and 0.003 ms elapsed in the map. All 20 state samples were runnable. The
estimated runnable wait was 90.91 ms, leaving 13.17 ms unclassified. A separate
161.82 ms registration with no matching GC used 0.29 ms of thread CPU and had
98.67 ms of estimated runnable wait. There was no sampled blocked interval for
either registration. Both kinds of historical outlier therefore occurred at
comparable or larger sizes in the loaded external runtime. The embedded traces
reached 497.07 ms of queue wait and had no GC-free registration of 100 ms or
more.

A separate 120-second control at external 25,600/s with the same 16 workers
disabled both GC trace and per-event probes. The p99 histogram bound was 256 ms
for both registration and one await. The maxima were 619.10 and 619.13 ms. The
longest individual registration took 112.14 ms. A second control gave bounds of
16 and 32 ms and maxima of 214.30 and 214.33 ms, with a 35.60 ms longest
registration. These controls establish substantial queueing without tracing.
They leave the GC attribution of the 112.14 ms call and the cause of the
variation between runs unresolved. The approximately three-second maximum was
observed only in the instrumented series.

### Diagnostic output during CPU contention

The 25,600/s workload was repeated on arm64 macOS with Deno 2.9.7, 10,000 fixed
results, 128 registrations every 5 ms, and a one-await read every 10 ms. Sixteen
arithmetic workers contended for 12 logical CPUs. Each runtime and recording
mode ran in a fresh process for 75 seconds of scheduled arrivals, repeated in
reverse order. All modes used the same terminal capture and 1 ms end-to-end
latency buckets.

- No trace. Use the normal workload with a count of individual registrations
  taking at least 100 ms.
- GC only. Enable passive V8 `--trace-gc-nvp`. Save timestamps for individual
  calls of at least 90 ms in a preallocated array and print these timestamps
  after the schedule. This makes it possible to test GC overlap with no
  synchronous JavaScript diagnostic lines.
- Buffered diagnostics. Enable the same V8 GC output and clock/thread probes as
  the live variant. Save JavaScript diagnostic events in preallocated numeric
  arrays and emit them after the schedule ends.
- Live diagnostics. Save the same events, and also emit the diagnostic lines
  synchronously during the schedule. Record elapsed time around each JavaScript
  console call and emit those spans after the schedule.

Only the JavaScript diagnostics are deferred in the buffered variant. V8's
passive GC output still occurs during collection. No variant invokes or exposes
forced GC. Live console spans include time lost to scheduling while inside a
console call. They describe where that time was spent and cannot be treated as
pure logging CPU cost.

| Runtime  | Recording mode | Registration p99 upper bound / max, ms | One-await p99 upper bound / max, ms |
| -------- | -------------- | -------------------------------------: | ----------------------------------: |
| Embedded | No trace       |                    7–8 / 160.06–184.57 |                 8–9 / 160.09–184.60 |
| Embedded | GC only        |                 10–195 / 160.99–410.16 |              10–196 / 156.64–410.21 |
| Embedded | Buffered       |                   7–21 / 157.21–183.81 |                9–22 / 157.24–179.48 |
| Embedded | Live           |                   9–24 / 145.06–147.73 |               10–24 / 143.43–147.78 |
| External | No trace       |                  17–97 / 148.01–221.78 |               18–99 / 148.03–224.99 |
| External | GC only        |                  14–52 / 134.51–246.61 |               16–53 / 134.53–242.76 |
| External | Buffered       |                  13–45 / 149.19–156.81 |               14–47 / 149.22–156.84 |
| External | Live           |                   8–17 / 161.57–169.89 |                8–18 / 157.25–165.84 |

Each cell shows the range across its two repetitions. Each process completed all
1,920,000 registrations and all 7,500 reads. The host CPU samples taken before
each process and those taken in the full diagnostic runs were 100%. No run
exceeded one second. External one-await maxima increased from buffered to live
output by 16.62 ms in the first repetition and 0.41 ms in the second. The p99
change reversed direction between repetitions, and maximum GC pauses also
differed. Embedded one-await maxima were lower in the live repetitions than in
the matching buffered repetitions.

In both external repetitions, the longest read wait overlapped less than half a
millisecond of JavaScript console time. It was 165.79 ms with 0.46 ms of overlap
in the first repetition, and 157.21 ms with 0.22 ms in the second. The matching
embedded observations were 147.76 ms with 0.31 ms and 143.41 ms with 1.23 ms of
overlap. Across the whole live processes, recorded JavaScript console time was
29.06–137.16 ms, with a single maximum console span of 42.67 ms. These overlaps
capture the direct intersection with the read's queued interval. They leave
indirect effects through earlier backlog, allocations, and GC timing unresolved.

The historical 2,923.45 ms queue window contained 691 JavaScript diagnostic
lines. Replaying those exact records in a burst twelve times under the same CPU
load and terminal capture took a median 11.59 ms of elapsed time and 11.08 ms of
thread CPU with synchronous output. The elapsed range was 5.99–25.07 ms.
Buffering those records took a median 0.044 ms before output. The replay
measures the cost of that volume of formatting and output in isolation. It lacks
the original arrival schedule, GC timing, and interactions with backlogged work.
The original seconds-scale delay's attribution remains open.

One registration in the first embedded GC-only run took 124.22 ms. The nearest
preceding GC ended about 293 ms before the call and the next GC began about 62
ms after it. The timing comparison used monotonic terminal receipt times,
aligned to the process clock, with 12 ms padding for delivery and rounding. Live
trace markers offered an independent check on the clock offset. This call
demonstrates that a GC-free, 100 ms-class registration can occur without
synchronous JavaScript diagnostic output. The other 15 runs had no individual
registration reach 100 ms. In particular, the external GC-recorded repetitions
did not reproduce the earlier 104.12 ms call.

### Longer deferred diagnostic runs under CPU saturation

The deferred-output workload above was repeated in fresh 180-second processes in
the order external, embedded, embedded, external. Each process had the 16
arithmetic workers, 10,000 fixed results, the 25,600/s publication schedule, and
100 reads/s. The one-millisecond end-to-end histogram and passive natural GC
trace were retained. No process used forced GC or emitted JavaScript diagnostics
during the measured interval.

The probe also wrote an in-memory numeric record for every publication slot. It
recorded the deadline, wake time, key allocation and publish boundaries,
completion, and benchmark-thread CPU. Slow batches also recorded sampled
runnable and blocked time. All these records were written out after the
schedule. The same GC receipt clock was used with a comparison window padded by
12 ms before and 2 ms after the estimated trace interval. GC wall time and
off-CPU time can overlap. Mach state estimates cover only intervals supported by
the samples and are capped by elapsed time minus thread CPU.

| Runtime  | Repetition | Registration p99 upper bound / max, ms | One-await p99 upper bound / max, ms | Calls ≥100 ms without aligned GC |
| -------- | ---------: | -------------------------------------: | ----------------------------------: | -------------------------------: |
| External |          1 |                         610 / 1,047.72 |                      611 / 1,045.87 |                                1 |
| Embedded |          1 |                            11 / 144.75 |                         12 / 144.78 |                                0 |
| Embedded |          2 |                             8 / 145.71 |                          9 / 145.79 |                                0 |
| External |          2 |                             6 / 133.42 |                          7 / 133.45 |                                0 |

Latencies include queue wait. Every process completed 4,608,000 registrations
and 18,000 reads. All four runs had a median host CPU utilization of 100%, and
no diagnostic records were lost. The one-second queue wait occurred in one of
two external runs and neither embedded run.

In the first external repetition, the one-second episode began 102.385 s into
the schedule. A batch started only 0.09 ms after its deadline and took 117.16 ms
with 1.15 ms of thread CPU and 113.15 ms of estimated runnable wait. Its
interval had no GC record. Two later GC-free batches took 191.07 ms and 199.37
ms with 1.18 ms and 2.11 ms of thread CPU respectively. They began with 292.88
ms and 487.17 ms of backlog already present.

Fifty-eight of the 252 batches from the first delay through the peak exceeded
their 5 ms period. A 16.67 ms young collection overlapped the peak batch, which
already waited 1,006.65 ms before it began. The most delayed one-await read
waited 1,045.81 ms and took 0.062 ms to settle once started. Eleven reads waited
at least one second. A later major collection occurred after this peak. The
measured order was CPU-ready delays inside registration, increasing batch
backlog, then a GC pause during the peak batch.

In that episode a 115.05 ms registration took 0.11 ms of thread CPU, with 51.65
ms of estimated runnable wait and 63.30 ms unclassified. Its fallback map write
took 0.005 ms elapsed and there was no aligned GC record. The same run also had
a separate 313.30 ms registration overlapping a 265.77 ms major collection.

The first embedded run had a different order at its peak. A 127.99 ms major
collection coincided with timer wake-up. The benchmark thread used 89.96 ms of
CPU during the wait and the sampled runnable periods covered the roughly 37 ms
of off-CPU time after the deadline. The first post-collection batch started
127.35 ms late and ran for 17.40 ms. The read due with that batch waited 144.76
ms and took 0.027 ms once started. That episode illustrates a GC-led backlog,
with runnable wait already included in the measured pause.

The second embedded peak also followed a major collection (117.97 ms) and then a
24.53 ms registration batch. The second external peak followed a 116.13 ms major
collection and a 17.13 ms batch. No second-scale queue developed in either case.
The first external run itself also had a separate 512.10 ms major collection
during timer wake-up. The just-due registration batch waited 510.56 ms and then
ran for 44.99 ms, giving the next batch 550.58 ms of backlog. The initial
one-second episode and these GC-led episodes show different orders of onset
within the same load profile.

### Splitting batches and limiting arrivals under CPU saturation

The comparison retained 10,000 fixed results, the same nominal cohort retention
times, and 100 scheduled reads per second. Sixteen arithmetic workers competed
for 12 logical CPUs. JavaScript diagnostic records and the per-batch timeline
were buffered until measurement ended. V8 recorded natural GC during the run. No
forced GC was used.

The previous two 180-second runs per runtime at 128 registrations every 5 ms
provide the reference. The 90-second screen compared 64 every 2.5 ms at the same
25,600/s, 128 every 10 ms to halve the admission rate, and 64 every 5 ms to
combine splitting and limiting at 12,800/s. At fixed rate the split preserves
the number of rotating result slots. Halving the rate also halves those slots
because their lifetimes stay fixed. The fixed 10,000 results are additional to
those slots.

The scheduler processes all admitted arrivals, even if the run ends with a
backlog. The rate limit changes the offered schedule at the source. The measured
queue starts at the new arrival deadline. Any upstream queue for excess offers
from a 25,600/s producer sits outside those measured deadlines.

| Screen profile | Runtime  | Actual registrations/s | Registration p99 bound / max, ms | One-await p99 bound / max, ms | Maximum GC, ms | Both targets |
| -------------- | -------- | ---------------------: | -------------------------------: | ----------------------------: | -------------: | ------------ |
| 64 / 2.5 ms    | Embedded |               25,599.0 |                      11 / 268.23 |                   10 / 265.83 |         232.46 | Fail         |
| 64 / 2.5 ms    | External |               25,600.2 |                      28 / 105.61 |                   30 / 101.28 |          85.25 | Fail         |
| 128 / 10 ms    | Embedded |               12,800.4 |                        8 / 81.47 |                     6 / 76.53 |          42.79 | Pass         |
| 128 / 10 ms    | External |               12,800.3 |                       9 / 142.06 |                    8 / 137.09 |         120.57 | Fail         |
| 64 / 5 ms      | Embedded |               12,800.2 |                        9 / 70.85 |                     9 / 70.91 |          56.39 | Pass         |
| 64 / 5 ms      | External |               12,800.1 |                       10 / 95.84 |                    11 / 95.86 |          81.08 | Pass         |

All screen runs completed 9,000 reads and all admitted registrations. Their
median host CPU was 100%. Both latency targets mean a queue-inclusive p99 upper
bound at or below 16 ms and an observed maximum at or below 100 ms for both
operations.

At unchanged throughput, splitting shortened the batch service p99 to about 1.75
ms from 2.44–7.16 ms in the preceding 180-second references. The 90-second split
screens had no 1-second queue, and both still exceeded 100 ms. A 232.46 ms major
collection drove the embedded peak. In the external split a major collection
took 85.25 ms and the first queued batch took 21.18 ms, pushing both metrics
over 100 ms despite the sub-100 ms collection. The shorter split observation
window limits any comparison of the recurrence of one-second queues.

Halving arrivals at the original batch size met both targets in the embedded
screen. The external maximum followed a 120.57 ms major collection and a 17.14
ms registration batch. Splitting as well met both targets in both screens. In
the external combined screen, the corresponding largest episode was an 81.08 ms
collection followed by a 14.14 ms batch. The batch size and natural-GC variation
both changed between the observations.

The combined 12,800/s profile was repeated for 180 seconds in each runtime. The
embedded repeat stayed within both targets. The external repeat reached 154.09
ms for one await when a 133.14 ms major collection delayed the scheduler and a
16.97 ms registration batch followed. Its p99 remained within 16 ms. The
90-second joint pass therefore did not hold for the longer repetitions.

| 180-second profile | Runtime  | Actual registrations/s | Registration p99 bound / max, ms | One-await p99 bound / max, ms | Maximum GC, ms | Both targets |
| ------------------ | -------- | ---------------------: | -------------------------------: | ----------------------------: | -------------: | ------------ |
| 64 / 2.5 ms        | Embedded |               25,600.0 |                     107 / 375.62 |                  108 / 372.20 |         333.81 | Fail         |
| 64 / 2.5 ms        | External |               25,600.2 |                     192 / 954.40 |                  194 / 951.36 |         761.01 | Fail         |
| 64 / 5 ms          | Embedded |               12,800.1 |                        9 / 93.04 |                    10 / 93.10 |          71.10 | Pass         |
| 64 / 5 ms          | External |               12,800.1 |                       9 / 154.06 |                   10 / 154.09 |         133.14 | Fail         |
| 32 / 5 ms          | Embedded |                6,400.1 |                        7 / 86.52 |                     7 / 82.01 |          72.59 | Pass         |
| 32 / 5 ms          | External |                6,400.1 |                        6 / 69.05 |                     7 / 64.24 |          60.16 | Pass         |

The 6,400/s profile met both targets for both runtimes over 180 seconds. Each
run completed 1,152,000 registrations and 18,000 reads with a median CPU load of
100%. It kept the fixed set of 10,000 results and 10,912 rotating slots. Peak
registration latency followed a major collection and one longer batch in both
runs. The external GC and batch took 60.16 ms and 11.11 ms respectively. The
embedded values were 72.59 ms and 9.50 ms. The source admitted a quarter of the
reference registration rate. Longer exposures and other host conditions for this
configuration remain unmeasured.

The fixed-rate split also ran for 180 seconds to match the reference observation
window. At 25,600/s in the external runtime, a 761.01 ms major collection
coincided with the timer delay. The first batch started 761.40 ms late and
itself took 193.01 ms despite using only 18.24 ms of thread CPU. Its estimated
runnable wait was 160.77 ms. Thirteen reads waited at least 900 ms, with a
maximum wait of 951.30 ms. The 64-row batch still left the workload exposed to a
one-second-scale queue when a long GC and runnable delay occurred in succession.

The embedded split peak followed a 333.81 ms collection and a 40.22 ms batch. It
also had a distinct 104.58 ms individual registration without a matching GC
record. That call used 0.06 ms of thread CPU, and the state sampling attributed
an estimated 103.11 ms to runnable wait. Fixed-rate splitting kept throughput
but left both runtimes above both latency budgets in the three-minute runs.
