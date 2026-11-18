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
