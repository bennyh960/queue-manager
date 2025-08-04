export type TaskPayloads = {
  sendEmail: { email: string };
  resizeImage: { imageUrl: string };
};

export type TaskHandlers = {
  [K in keyof TaskPayloads]: (payload: TaskPayloads[K]) => Promise<void>;
};

export async function sendEmail(payload: { email: string }) {
  if (!payload.email) {
    throw new Error('Email is required');
  }
  console.log(`Sending email to ${payload.email}...`);
  await new Promise(res => setTimeout(res, 1000));
  console.log(`Email sent to ${payload.email}`);
}

export async function resizeImage(payload: { imageUrl: string }) {
  console.log(`Resizing image ${payload.imageUrl}...`);
  await new Promise(res => setTimeout(res, 1500));
  console.log(`Image resized: ${payload.imageUrl}`);
}

export interface HandlerMap {
  sendEmail: (payload: { email: string }) => Promise<void>;
  resizeImage: (payload: { imageUrl: string }) => Promise<void>;
  // ...user can add more
}
