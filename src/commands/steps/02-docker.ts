import { type SetupConfig } from "../../context/index.js";
import {
  getDockerDesktopCheckPath,
  getDockerInstallStrategy,
  getDockerNativeInstallCommands,
  getDockerServiceCommands,
  getOsVersionCommand,
  getRamCommand,
  isArm,
  isLinux,
} from "../../platform.js";
import { HOME } from "../constants.js";
import {
  dirExists,
  fileExists,
  getErrorMessage,
  sh,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Step 2: Setup Docker */
export async function runStep2(
  _config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    const strategy = await getDockerInstallStrategy();

    if (strategy === "colima") {
      // ── macOS: Colima path ──
      onProgress(0, "Checking for Docker Desktop...");
      const dockerDesktopPath = getDockerDesktopCheckPath();
      if (dockerDesktopPath && (await dirExists(dockerDesktopPath))) {
        throw new Error(
          "Docker Desktop is installed. Please uninstall it before continuing.",
        );
      }

      onProgress(1, "Installing docker, colima, and plugins...");
      await sh(
        "brew install docker && brew link docker && brew install docker-compose docker-buildx docker-credential-helper-ecr colima",
        { interactive: true },
      );

      // Ensure Docker CLI can find Homebrew-installed plugins (e.g. docker-compose)
      onProgress(2, "Configuring Docker CLI plugins path...");
      const dockerConfigDir = path.join(HOME, ".docker");
      const dockerConfigPath = path.join(dockerConfigDir, "config.json");
      const brewPluginsDir = "/opt/homebrew/lib/docker/cli-plugins";
      await mkdir(dockerConfigDir, { recursive: true });
      let dockerConfig: {
        cliPluginsExtraDirs?: string[];
        [key: string]: unknown;
      } = {};
      if (await fileExists(dockerConfigPath)) {
        try {
          dockerConfig = JSON.parse(await readFile(dockerConfigPath, "utf-8"));
        } catch {
          // If the file is malformed, start fresh
          dockerConfig = {};
        }
      }
      const extraDirs: string[] = dockerConfig.cliPluginsExtraDirs ?? [];
      if (!extraDirs.includes(brewPluginsDir)) {
        extraDirs.push(brewPluginsDir);
        dockerConfig.cliPluginsExtraDirs = extraDirs;
        await writeFile(
          dockerConfigPath,
          JSON.stringify(dockerConfig, null, 2) + "\n",
        );
      }

      // Detect architecture and configure
      onProgress(3, "Detecting architecture and configuring Colima...");
      const armArch = isArm();
      const macosVer = (await sh(getOsVersionCommand())).stdout;
      const macosGe13 = parseInt(macosVer) >= 13;
      const vmType = armArch && macosGe13 ? "vz" : "qemu";
      const mountType = armArch && macosGe13 ? "virtiofs" : "sshfs";
      const colimaArch = armArch ? "aarch64" : "x86_64";

      // Determine CPU/memory
      const totalRamGb =
        parseInt((await sh(getRamCommand())).stdout) / 1024 / 1024 / 1024;
      const colimaCpu = totalRamGb > 40 ? 4 : 2;
      const colimaMemory = totalRamGb > 40 ? 8 : 2;

      // Write colima.yaml
      onProgress(4, "Writing Colima configuration...");
      const colimaConfigDir = path.join(HOME, ".colima", "default");
      await mkdir(colimaConfigDir, { recursive: true });
      const colimaConfig = `cpu: ${colimaCpu}\nmemory: ${colimaMemory}\ndisk: 100\narch: ${colimaArch}\nruntime: docker\nvmType: ${vmType}\nmountType: ${mountType}\nmounts: []\nkubernetes:\n  enabled: false\n`;
      await writeFile(path.join(colimaConfigDir, "colima.yaml"), colimaConfig);

      // Start Colima
      onProgress(5, "Starting Colima...");
      await sh(
        'colima status 2>&1 | grep -q "colima is running" && colima stop || true',
      );
      await sh("colima start", { interactive: true });
      const serviceCommands = await getDockerServiceCommands();
      for (const cmd of serviceCommands) {
        await sh(cmd);
      }
      await sh("docker context use colima");
    } else {
      // ── Linux: native Docker Engine ──
      onProgress(0, "Checking for existing Docker installation...");
      const dockerCheck = await sh("command -v docker");
      if (dockerCheck.code !== 0) {
        onProgress(1, "Installing Docker Engine...");
        const installCommands = await getDockerNativeInstallCommands();
        for (const cmd of installCommands) {
          await sh(cmd, { interactive: true });
        }
      } else {
        onProgress(1, "Docker already installed.");
      }

      // Ensure Docker service is running
      onProgress(2, "Enabling Docker service...");
      const serviceCommands = await getDockerServiceCommands();
      for (const cmd of serviceCommands) {
        await sh(cmd, { interactive: true });
      }

      // Ensure current user can run docker without sudo
      onProgress(3, "Configuring Docker group membership...");
      await sh(`sudo usermod -aG docker $USER 2>/dev/null || true`, {
        interactive: true,
      });

      // Note: group change may require new login session
      // Try running docker with newgrp or sg
      onProgress(4, "Verifying Docker access...");
      const canDocker = await sh("docker info >/dev/null 2>&1");
      if (canDocker.code !== 0) {
        // Try with sg (new group session) for immediate access
        await sh('sg docker -c "docker info" >/dev/null 2>&1 || true');
      }
    }

    // Test (cross-platform)
    onProgress(6, "Testing docker with hello-world...");
    const dockerTest = await sh("docker run --rm hello-world");
    if (dockerTest.code !== 0) {
      // On Linux, the user may need to re-login for group changes
      if (isLinux()) {
        throw new Error(
          "Docker is installed but could not run containers. You may need to log out and back in for docker group membership to take effect, then re-run this step.",
        );
      }
      throw new Error("Docker is installed but could not run containers.");
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
