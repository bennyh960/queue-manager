const backendTypeAndProcessTypeConflictError =
  '\x1b[31m' + // Start red color
  '\n==========================================================\n' +
  '❌ Configuration Error: Incompatible processType and backend.type\n' +
  '==========================================================\n' +
  'processType is set to "multi-atomic", but backend.type is not "custom".\n' +
  '\n' +
  'Your repository must implement an atomic dequeueTask() method to ensure\n' +
  'safe and reliable task processing across multiple instances.\n' +
  '\n' +
  `Current backend.type: '$1'\n` +
  '\n' +
  'Action Required:\n' +
  '• Implement an atomic dequeueTask() in your repository.\n' +
  '• Review the documentation for atomic dequeue patterns.\n' +
  '• Use backend.type = "custom" if you provide your own atomic logic.\n' +
  '\n' +
  'Non-atomic backends only support safe dequeueing for single-instance setups.\n' +
  '==========================================================\n' +
  '\x1b[0m'; // Reset color

export const errors = {
  backendTypeAndProcessTypeConflictError,
};
