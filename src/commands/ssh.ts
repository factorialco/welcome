import {
  getClipboardCommand,
  getOpenCommand,
  getSshAddCommand,
} from "../platform.js";
import { ORG_NAME, REPO_NAME, SSH_DIR } from "./constants.js";
import { fileExists, sh, shellEscape } from "./helpers.js";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Quick check: can we already access factorialco/factorial via SSH with default config? */
export async function checkGitHubConnectivity(): Promise<boolean> {
  const sshOpts =
    "-o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no";
  const result = await sh(
    `GIT_SSH_COMMAND="ssh ${sshOpts}" git ls-remote git@github.com:${ORG_NAME}/${REPO_NAME}.git 2>/dev/null`,
    { timeout: 10000 },
  );
  return result.code === 0;
}

/** Search for existing SSH private keys */
export async function findExistingSSHKeys(): Promise<string[]> {
  await mkdir(SSH_DIR, { recursive: true });
  const findResult = await sh(
    `find ${SSH_DIR} -maxdepth 1 -type f -not -name "*.pub" -not -name "config" -not -name "known_hosts" -not -name "known_hosts.old" -not -name "authorized_keys" -exec grep -l "PRIVATE KEY" {} \\; 2>/dev/null || true`,
    { timeout: 5000 },
  );
  return findResult.stdout.split("\n").filter(Boolean);
}

/** Test if an SSH key can access the Factorial org repo */
export async function testSSHKeyAccess(keyPath: string): Promise<boolean> {
  const sshOpts = `-i '${keyPath}' -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5`;
  const test = await sh(`ssh ${sshOpts} -T git@github.com 2>&1 || true`, {
    timeout: 15000,
  });
  if (!test.stdout.includes("successfully authenticated")) return false;

  const repoAccess = await sh(
    `GIT_SSH_COMMAND="ssh ${sshOpts}" git ls-remote git@github.com:${ORG_NAME}/${REPO_NAME}.git 2>/dev/null`,
    { timeout: 15000 },
  );
  return repoAccess.code === 0;
}

/** Find a working SSH key from existing keys */
export async function findWorkingSSHKey(): Promise<string | null> {
  const keys = await findExistingSSHKeys();
  for (const key of keys) {
    if (await testSSHKeyAccess(key)) return key;
  }
  return null;
}

/** Generate a new SSH key and configure ~/.ssh/config */
export async function generateSSHKey(
  email: string,
): Promise<{ keyPath: string; publicKey: string }> {
  const keyName = `id_ed25519_factorial_${Math.floor(Date.now() / 1000)}`;
  const keyFile = path.join(SSH_DIR, keyName);

  await sh(
    `ssh-keygen -t ed25519 -C ${shellEscape(email)} -f ${shellEscape(keyFile)} -N ""`,
  );

  // Configure SSH config
  const sshConfigFile = path.join(SSH_DIR, "config");
  let sshConfig = "";
  if (await fileExists(sshConfigFile)) {
    sshConfig = await readFile(sshConfigFile, "utf-8");
  }
  if (!sshConfig.includes("Host github.com")) {
    const block = `\nHost github.com\n    HostName github.com\n    User git\n    IdentityFile ${keyFile}\n    IdentitiesOnly yes\n`;
    await appendFile(sshConfigFile, block);
  }

  // Add to SSH agent (timeout in case it prompts for passphrase)
  await sh(getSshAddCommand(keyFile), { timeout: 5000 });

  const publicKey = await readFile(`${keyFile}.pub`, "utf-8");
  return { keyPath: keyFile, publicKey: publicKey.trim() };
}

/** Copy text to clipboard */
export async function copyToClipboard(text: string): Promise<void> {
  await sh(getClipboardCommand(text));
}

/** Open a URL in the default browser */
export async function openURL(url: string): Promise<void> {
  await sh(getOpenCommand(url));
}

/** Verify SSO authorization for a given SSH key */
export async function verifySSHAccess(keyPath: string): Promise<boolean> {
  const sshOpts = `-i '${keyPath}' -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5`;
  const result = await sh(
    `GIT_SSH_COMMAND="ssh ${sshOpts}" git ls-remote git@github.com:${ORG_NAME}/${REPO_NAME}.git 2>/dev/null`,
    { timeout: 15000 },
  );
  return result.code === 0;
}

/** Configure SSH config for an existing key */
export async function configureSSHKey(keyPath: string): Promise<void> {
  const sshConfigFile = path.join(SSH_DIR, "config");
  let sshConfig = "";
  if (await fileExists(sshConfigFile)) {
    sshConfig = await readFile(sshConfigFile, "utf-8");
  }
  if (!sshConfig.includes("Host github.com")) {
    const block = `\nHost github.com\n    HostName github.com\n    User git\n    IdentityFile ${keyPath}\n    IdentitiesOnly yes\n`;
    await appendFile(sshConfigFile, block);
  }
  await sh(getSshAddCommand(keyPath), { timeout: 5000 });
}
