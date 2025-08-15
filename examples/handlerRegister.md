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

**Send Email Example:** argument must be an object - this example will not work

```ts
function sendEmail(name: string, email: string, subject: string, message: string) {
  // your send email logic
}
```

This is a working example:

```ts
function sendEmail(payload: { name: string; email: string; subject: string; message: string }) {
  // your send email logic
}
```

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

**Example: paramSchema with your own logic:**

```ts
queue.register('sendEmail', sendEmail, {
  paramSchema: payload => {
    for (key in payload) {
      if (typeof payload[key] !== 'string') {
        return { isValid: false, message: `${key} type must be string` };
      }
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return { isValid: false, message: 'please use valid email' };
    }

    return { isValid: true, message: null };
  },
});
```

**Example: paramSchema with your own logic + external libraries like zod:**

```ts
import { z } from 'zod';

const emailPayloadSchema = z.object({
  name: z.string(),
  email: z.string().email(), // Ensures valid email format
  subject: z.string(),
  message: z.string(),
});

queue.register('sendEmail', sendEmail, {
  paramSchema: payload => {
    const result = emailPayloadSchema.safeParse(payload);
    if (!result.success) {
      // here you will need to convert zod schema into readable message
      const errorMessages = result.error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      return { isValid: true, message: errorMessages, source: 'param-schema' };
    }
    return { isValid: true, message: null, source: 'param-schema' };
  },
});
```
