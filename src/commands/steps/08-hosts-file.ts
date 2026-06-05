import { type SetupConfig } from "../../context/index.js";
import { isDarwin } from "../../platform.js";
import {
  LOCAL_DOMAIN,
  NUM_SLOTS,
  SLOT_PREFIXES,
  STATIC_HOSTS,
  WEBPAGE_COUNTRIES,
} from "../constants.js";
import {
  getErrorMessage,
  sh,
  sudoSh,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";
import { readFile } from "node:fs/promises";

/** Step 8: Setup local hosts file */
export async function runStep8(
  _config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    // 1. Read current /etc/hosts
    onProgress(0, "Reading current /etc/hosts...");
    const hostsContent = await readFile("/etc/hosts", "utf-8");

    // 2. Build host entries
    onProgress(1, "Checking for missing host entries...");
    const allHosts: string[] = [
      ...STATIC_HOSTS.map((h) => `${h}.${LOCAL_DOMAIN}`),
      ...WEBPAGE_COUNTRIES.map((c) => `webpage-${c}.${LOCAL_DOMAIN}`),
    ];

    const missingHosts = allHosts.filter((host) => {
      const regex = new RegExp(
        `^[^#]*\\s${host.replace(/\./g, "\\.")}(\\s|$)`,
        "m",
      );
      return !regex.test(hostsContent);
    });

    if (missingHosts.length === 0) {
      onProgress(2, "All host entries already present.");
    } else {
      // 3. Write to /etc/hosts (requires elevated privileges)
      onProgress(2, `Adding ${missingHosts.length} entries to /etc/hosts...`);
      const hostsEntry = `127.0.0.1 ${allHosts.join(" ")}`;
      // On macOS sudoSh uses osascript (native dialog); on Linux it uses sudo.
      // osascript's `do shell script` runs via /bin/sh -c, so >> redirection works.
      // On Linux, sudo needs `tee -a` because >> is evaluated by the calling shell.
      if (isDarwin()) {
        const result = await sudoSh(`echo '${hostsEntry}' >> /etc/hosts`);
        if (result.code !== 0) throw new Error("Failed to update /etc/hosts");
      } else {
        const result = await sh(
          `echo '${hostsEntry}' | sudo tee -a /etc/hosts >/dev/null`,
          {
            interactive: true,
          },
        );
        if (result.code !== 0) throw new Error("Failed to update /etc/hosts");
      }
    }

    // 4. Slot-based hosts for multi-worktree development
    onProgress(3, "Checking slot host entries...");
    const slotLines: string[] = [];
    for (let slot = 1; slot <= NUM_SLOTS; slot++) {
      slotLines.push(
        `127.0.0.1 ${SLOT_PREFIXES.map((p) => `${p}-slot${slot}.${LOCAL_DOMAIN}`).join(" ")}`,
      );
    }

    const anySlotMissing = slotLines.some((line) => {
      const firstHost = line.split(" ")[1]!;
      const regex = new RegExp(
        `^[^#]*\\s${firstHost.replace(/\./g, "\\.")}(\\s|$)`,
        "m",
      );
      return !regex.test(hostsContent);
    });

    if (anySlotMissing) {
      onProgress(4, `Adding ${NUM_SLOTS} slot entries to /etc/hosts...`);
      const slotBlock = [
        "",
        "# Factorial local dev slots (multi-worktree)",
        ...slotLines,
        "# Need more slots? Add a new line following the pattern above.",
      ].join("\n");

      if (isDarwin()) {
        const result = await sudoSh(`echo '${slotBlock}' >> /etc/hosts`);
        if (result.code !== 0)
          throw new Error("Failed to update /etc/hosts with slot entries");
      } else {
        const result = await sh(
          `echo '${slotBlock}' | sudo tee -a /etc/hosts >/dev/null`,
          {
            interactive: true,
          },
        );
        if (result.code !== 0)
          throw new Error("Failed to update /etc/hosts with slot entries");
      }
    } else {
      onProgress(4, "All slot host entries already present.");
    }

    return { success: true, duration: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: getErrorMessage(e),
      duration: Date.now() - start,
    };
  }
}
