# Lesson: operator precedence hid an empty-state bug in the artifact
What happened: original code had `delBtn+items.length&&(...)?A:B`, which evaluates oddly and drops the delete-section button.
Root cause: string concat binds tighter than &&. Rule: compute the condition into a named const first.
Where enforced: fixed in app.js render() (`filtered` const).
