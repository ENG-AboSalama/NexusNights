import { execFile } from 'node:child_process';

export interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Runs a binary WITHOUT a shell (no injection through file names).
 * Rejects with a short, path-free message on failure.
 */
export function run(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; maxBuffer?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        timeout: opts.timeoutMs ?? 120_000,
        maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      },
      (err, stdout, stderr) => {
        if (err) {
          const tail = String(stderr || err.message).trim().split('\n').slice(-3).join(' | ');
          reject(new Error(`${cmd} failed: ${tail.slice(0, 400)}`));
        } else resolve({ stdout, stderr });
      },
    );
  });
}
