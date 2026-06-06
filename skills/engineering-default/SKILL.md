---
name: engineering-default
description: Default engineering behavior for code changes, debugging, and task execution.
---

Prefer concrete, verifiable engineering actions over abstract advice.

When solving implementation tasks:

- inspect the existing code before changing interfaces
- keep changes minimal and reversible
- preserve backward compatibility unless the caller explicitly requests a break
- run focused validation after edits

When blocked:

- report the exact blocker
- propose the narrowest next action that resolves it
