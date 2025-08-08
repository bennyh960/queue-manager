### Handler Registration Parameters

When registering a handler with `queue.register`, provide the following parameters:

- **`name`** (`string`):  
  The unique name of the handler/task type.

- **`handler`** (`function`):  
  The function to process the task.  
  Signature: `(payload) => Promise<any>`

- **`options`** (`object`, optional):  
  Additional configuration for the handler. May include:
  - `maxRetries` (`number`, optional):  
    Maximum number of retry attempts inside the queue worker if the handler fails.
  - `maxProcessingTime` (`number`, optional):  
    Maximum allowed processing time in milliseconds before retry again or mark as failed if no
    retires left.
  - `useAutoSchema` (`boolean`, optional):  
    Whether to use automatic schema validation for payloads.
  - `paramSchema` (`function`, optional):  
    Custom parameter validation function can works with external schema validation libraries.  
    Signature:  
    `(payload: any) => { isValid: boolean, message: string | null, source: string }`

**Example: useAutoSchema:**

- when adding task to queue - the auto schema will validate automatically if the payloads are valid
  based on handler signature.

```ts
queue.register('sendEmail', sendEmail, {
  maxRetries: 3,
  maxProcessingTime: 2000,
  useAutoSchema: true,
});
```

**Example: paramSchema:**

```ts
queue.register('sendEmail', sendEmail, {
  paramSchema: payload => {
    // validation logic here
    if (typeof payload.email !== 'string') {
      return { isValid: false, message: 'email type must be string', source: 'param-schema' };
    }
    return { isValid: true, message: null, source: 'param-schema' };
  },
});
```
