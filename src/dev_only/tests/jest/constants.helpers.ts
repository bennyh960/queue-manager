import fs from 'fs/promises';
import path from 'path';

export const testsFileRelPath = path.join(process.cwd(), 'data', 'tasks.json');

export const resetFileContentMethod = async () => {
  try {
    // Ensure the data directory exists
    await fs.mkdir(path.dirname(testsFileRelPath), { recursive: true });
    await fs.writeFile(testsFileRelPath, JSON.stringify([]));
  } catch (error) {
    // Ignore errors, create directory and file
    await fs.mkdir(path.dirname(testsFileRelPath), { recursive: true });
    await fs.writeFile(testsFileRelPath, JSON.stringify([]));
  }
};
