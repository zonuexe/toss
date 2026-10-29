# Browser compiler example design

Use native browser defaults for colors, type, spacing, focus indicators, and
controls. Keep the page in normal document flow with semantic fieldsets,
legends, labels, native file selection and add/remove/compile buttons, a visible
status, and a text-only generated-code result. Selected file names become
root-relative virtual IDs; directory structure is not preserved. Newly added
path fields receive focus. The download button is enabled only while the
displayed output matches a successful compile. The example does not force a
color scheme or execute the generated output. Text areas and path fields may use
a small max-width rule so they fit narrow screens; labels display above their
fields. Colors, fonts, controls, and focus indicators remain browser defaults.
