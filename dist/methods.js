export async function sendEmail(payload) {
    console.log(`Sending email to ${payload.email}...`);
    await new Promise(res => setTimeout(res, 1000));
    console.log(`Email sent to ${payload.email}`);
}
export async function resizeImage(payload) {
    console.log(`Resizing image ${payload.imageUrl}...`);
    await new Promise(res => setTimeout(res, 1500));
    console.log(`Image resized: ${payload.imageUrl}`);
}
//# sourceMappingURL=methods.js.map