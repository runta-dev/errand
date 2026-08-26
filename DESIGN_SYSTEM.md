# Runta Crew Design System

Runta Crew is a work surface, not a dashboard. Its interface should feel quiet until the user needs to act.

## Visible-element admission rule

Every permanently visible element must do at least one of the following:

1. Enable an immediate user action.
2. Communicate state that changes the user's next decision.
3. Identify the current context.
4. Explain an error or required intervention.

If removing an element does not make a common task harder, less safe, or ambiguous, remove it. Do not add labels, badges, borders, cards, shadows, status dots, helper copy, or decorative artwork merely to make an area feel complete.

## Whitespace

- Prefer open space over filler UI. Empty space establishes hierarchy and keeps conversation content primary.
- Do not fill blank areas with metrics, onboarding copy, illustrations, or secondary navigation unless the current task requires them.
- Keep controls close to the object they operate on; do not create extra toolbars for infrequent actions.

## Border usage

- Borders communicate structure or interactivity. They are not decoration.
- Inputs may keep a subtle border because it makes editability immediately clear.
- A stationary conversation header has no bottom border. Show a `0.5px` hairline only after content scrolls beneath it.
- The sidebar boundary uses a low-contrast `0.5px` hairline. It separates regions without becoming a visual column.
- Avoid nested borders. Prefer spacing or a single soft surface before adding another outline.
- Do not put borders around self-explanatory icon actions located in an established action area.
- Use stronger borders only for safety-critical boundaries, focused inputs, errors, approvals, or selected controls.

## Immediate comprehension

- A visible control must be understandable at a glance from its icon, label, position, and current context.
- Do not rely on users discovering what a permanent control means through trial and error.
- Use icon-only controls only for conventional actions or when placement makes the meaning unambiguous. Always provide an accessible name.
- Prefer direct language: describe the action (`Open computer`, `Delete agent`) rather than an internal system concept.
- Do not show raw infrastructure state unless it affects what the user can do next.

## UI review checklist

Before shipping a UI change, verify:

- Can any new visible element be removed without reducing clarity, safety, or capability?
- Is any state represented twice?
- Does every border have a structural, interactive, or safety purpose?
- Is the default state quieter than its hover, focus, active, error, and approval states?
- Can a first-time user understand every persistent control without documentation?
- Does the layout preserve generous whitespace at both the default and minimum window sizes?
