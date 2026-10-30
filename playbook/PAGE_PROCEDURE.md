# Page procedure

Follow these steps in order for every page. Think before you edit.

1. Inventory. Open the page's component, template and styles. Look at the "before" screenshots.
   List every section, field, column, filter, button, link, dialog, message and conditional block
   (*ngIf, @if, permission checks). This list is your contract: all of it must still be there.
2. Understand the job. In one sentence, what does a user come to this page to do? What is the single
   most important action? What information do they scan first?
3. Plan. Decide the layout (header, toolbar, content, side panel), which PrimeNG component replaces
   each old element, and how loading, empty and error states will look. Decide where tooltips and
   confirmations are needed (icon-only buttons, destructive actions).
4. Implement. Rewrite the template and styles. Keep all bindings, event handlers and form controls.
   Add PrimeNG imports to the component or module. Delete the page's old styling.
5. Verify. Run the build command and fix any errors in the files you touched. Re-read your inventory
   and confirm each item is still present and wired the same way.
6. Report. Write the summary and JSON block described in the rules.

# Polish procedure (reviewer)

You are a second pair of eyes with a designer's standards. Open the "after" screenshots and the
page's code. Compare against the UI checklist. Fix what you find (only in this page's files), run the
build, then report. If everything already meets the checklist, change nothing and say so.
