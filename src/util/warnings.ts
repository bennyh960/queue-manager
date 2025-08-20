const handlerRegistryWarning = `
===================================================================================================
⚠️  WARNING: "$1" handler registered without a schema! ⚠️
===================================================================================================
You have registered a handler without providing a parameter schema or enabling auto-schema.
If your "$1" method not using params , ignore this warning.
If it does expect a payload, omitting a schema may allow invalid or unexpected data to be enqueued.
===================================================================================================
`;

const customRepository = `
===================================================================================================
⚠️  WARNING: selected custom repository! ⚠️
===================================================================================================
You selected to manage your own repository , it means all the queue operations (enqueue, dequeue, etc.)
are your responsibility. Ensure that these operations are implemented correctly to avoid data loss or corruption.
Be aware that these operations must be performed atomically to prevent race conditions and data corruption.
===================================================================================================
`;

export const warnings = {
  handlerRegistryWarning,
  customRepository,
};
