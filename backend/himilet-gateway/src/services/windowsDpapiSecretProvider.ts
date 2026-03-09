import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runPowerShell(script: string, inputBase64: string): Promise<string> {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
    inputBase64,
  ]);
  return stdout.trim();
}

export class WindowsDpapiSecretProvider {
  async encrypt(plain: string): Promise<string> {
    if (process.platform !== 'win32') {
      throw new Error('Windows DPAPI is only supported on win32.');
    }

    const inputBase64 = Buffer.from(plain, 'utf8').toString('base64');
    const script =
      '$input=[Convert]::FromBase64String($args[0]);' +
      '$output=[System.Security.Cryptography.ProtectedData]::Protect($input,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);' +
      '[Convert]::ToBase64String($output)';
    return runPowerShell(script, inputBase64);
  }

  async decrypt(cipherBase64: string): Promise<string> {
    if (process.platform !== 'win32') {
      throw new Error('Windows DPAPI is only supported on win32.');
    }

    const script =
      '$input=[Convert]::FromBase64String($args[0]);' +
      '$output=[System.Security.Cryptography.ProtectedData]::Unprotect($input,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);' +
      '[Convert]::ToBase64String($output)';
    const plainBase64 = await runPowerShell(script, cipherBase64);
    return Buffer.from(plainBase64, 'base64').toString('utf8');
  }
}
