import { MiniSchema as M, ValidationError } from './schema.util.js';

async function sendEmail({ email }: { email: string }) {
  if (!email) {
    throw new Error('Email is required');
  }

  const EmailSchema = M.object({
    email: M.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'),
  });
  EmailSchema.validateAll({ email });
  console.log(`Sending email to ${email}...`);
  await new Promise(res => setTimeout(res, 3000));
  console.log(`Email sent to ${email}`);
}

async function resizeImage({ imageUrl }: { imageUrl: string }) {
  console.log(`Resizing image ${imageUrl}...`);
  await new Promise(res => setTimeout(res, 1500));
  console.log(`Image resized: ${imageUrl}`);
}

async function doSomething() {
  console.log('Doing something...');
  // Simulate some processing
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Doing something end...');
}
async function doSomethingWithError() {
  console.log('Doing something with error...');
  // Simulate some processing that throws an error
  throw new Error('Something went wrong');
}

export type HandlerMapFakeMethods = {
  sendEmail: ({ email }: { email: string }) => Promise<void>;
  resizeImage: ({ imageUrl }: { imageUrl: string }) => Promise<void>;
  doSomething: () => Promise<void>;
  doSomethingWithError: () => Promise<void>;
};
export const fakeMethods: HandlerMapFakeMethods = {
  sendEmail,
  resizeImage,
  doSomething,
  doSomethingWithError,
};
