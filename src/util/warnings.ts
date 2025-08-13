const atomicProcessWarning = `
==========================================================
⚠️  WARNING: Custom or Non-Atomic Backend Selected! ⚠️
==========================================================
You have configured the queue with a custom or non-atomic backend.
It is your responsibility to ensure that dequeue and task update operations
are performed atomically to prevent race conditions and data corruption.

Recommended Actions:
- Use transactions or atomic commands in your backend.
- Consult the documentation for safe dequeue patterns.
- If unsure, contact your system architect or use a supported atomic backend.

[QueueManager] Initialization continues, but unsafe dequeue logic
may lead to duplicate processing or lost tasks.
==========================================================
`;

const handlerRegistryWarning = `
===================================================================================================
⚠️  WARNING: "$1" handler registered without a schema! ⚠️
===================================================================================================
You have registered a handler without providing a parameter schema or enabling auto-schema.
If your "$1" method not using params , ignore this warning.
If it does expect a payload, omitting a schema may allow invalid or unexpected data to be enqueued.
===================================================================================================
`;

export const warnings = {
  atomicProcessWarning,
  handlerRegistryWarning,
};
