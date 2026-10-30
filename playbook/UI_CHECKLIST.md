# UI checklist

A page is finished when every line below is true.

## Layout and hierarchy
- One page title (h1) that matches the menu label; helper text only where it helps.
- One primary button per area, top right of its section or bottom right of a form.
- Spacing uses the 4/8 px scale; sections separated by 24–32 px; nothing cramped or orphaned.
- Sensible content width on wide screens (forms around 720 px max; tables can be full width).
- Left edges align; labels and inputs line up in forms.

## Components
- All interactive elements are PrimeNG components styled by the brand preset.
- Icon-only buttons have a tooltip and an aria-label.
- Destructive actions ask for confirmation and use the danger severity.
- Status values use tags with consistent severities (success, warn, danger, info, secondary).
- Tables keep their old sorting, filtering and paging, show a skeleton while loading and an empty
  message that says what to do next.
- Dialogs have a clear title, the primary action on the right, and close on Escape.

## Forms
- Every input has a visible label (not only a placeholder).
- Required fields are marked; validation messages appear under the field in plain words.
- Buttons say what they do ("Save request"); the success toast uses the same verb.

## Look
- No hardcoded colors; brand tokens and --brand-* variables only.
- Text contrast at least 4.5:1; disabled states clearly look disabled.
- Consistent corner radius and borders; shadows only for floating layers.
- No leftover Bootstrap or Material styling on this page.

## Responsive and accessible
- Works at 390 px wide: no sideways page scroll, tables scroll in their container, toolbars wrap.
- Keyboard: every action reachable with Tab, focus ring visible, logical order.
- Images and icons that carry meaning have text alternatives.

## Safety
- Everything in the page inventory is still present and wired the same way.
- No changes to services, API calls, routing, auth or config.
