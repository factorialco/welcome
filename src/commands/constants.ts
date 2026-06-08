import { homedir } from "node:os";
import path from "node:path";

export const HOME = homedir();
export const ROOT_DIR = path.join(HOME, ".factorial");
export const LOG_FILE = "/tmp/welcome.log";
export const CODE_DIR = path.join(HOME, "code");
export const SSH_DIR = path.join(HOME, ".ssh");
export const ORG_NAME = "factorialco";
export const REPO_NAME = "factorial";
export const REPO_PATH = path.join(CODE_DIR, REPO_NAME);
export const LOCAL_DOMAIN = "local.factorial.dev";
export const LOCAL_AWS_PROFILE = "development";
export const LOCAL_AWS_DEFAULT_REGION = "eu-central-1";
export const CONDUCTOR_ECR_REGISTRY =
  "771567148620.dkr.ecr.eu-central-1.amazonaws.com";
export const BUNDLER_VERSION = "2.5.11";
export const PNPM_VERSION = "11.5.2";
export const PERSONAL_ENV_RC_PATH = path.join(REPO_PATH, ".envrc.personal");

export const STATIC_HOSTS = [
  "api",
  "app",
  "backstage",
  "careers",
  "mastra",
  "ws",
  "id",
  "idp",
  "chat2db",
  "minio",
  "minio-console",
  "it-management-common-service",
  "it-management-marketplace-service",
];
export const WEBPAGE_COUNTRIES = [
  "es",
  "us",
  "mx",
  "br",
  "ar",
  "co",
  "fr",
  "de",
  "gb",
  "it",
  "pt",
  "cl",
  "pl",
  "ke",
  "za",
];

export const SLOT_PREFIXES = ["app", "api", "ws", "mastra"];
export const NUM_SLOTS = 4;

export const EXTENSIONS = [
  "bradlc.vscode-tailwindcss",
  "christian-kohler.npm-intellisense",
  "cucumberopen.cucumber-official",
  "dbaeumer.vscode-eslint",
  "eamodio.gitlens",
  "editorconfig.editorconfig",
  "oxc.oxc-vscode",
  "firsttris.vscode-jest-runner",
  "graphql.vscode-graphql",
  "graphql.vscode-graphql-syntax",
  "karunamurti.haml",
  "lokalise.i18n-ally",
  "Malo.copy-json-path",
  "mateuszdrewniak.ruby-test-runner",
  "ms-azuretools.vscode-docker",
  "ms-vscode.test-adapter-converter",
  "rubocop.vscode-rubocop",
  "ruby-syntax-tree.vscode-syntax-tree",
  "sorbet.sorbet-vscode-extension",
  "tomi.xasnippets",
  "unifiedjs.vscode-mdx",
  "usernamehw.errorlens",
  "redhat.vscode-yaml",
];

export const SKILL_REPOS = ["factorialco/factorial-skills"];

// Used by both the macOS Brewfile path and Linux package mapping
export const BASE_BREW_FORMULAE = [
  "awscli",
  "bat",
  "direnv",
  "fzf",
  "gh",
  "git",
  "gitleaks",
  "htop",
  "imagemagick",
  "jq",
  "lazydocker",
  "libvips",
  "libyaml",
  "make",
  "mysql",
  "nss",
  "openssl",
  "pdftk-java",
  "ripgrep",
  "semgrep",
  "shared-mime-info",
  "watchman",
  "zstd",
  "gpg",
  "composer",
  "yq",
  "tmux",
];

export const CLI_BREW_FORMULAE_MAP: Record<string, string> = {
  opencode: "opencode",
};

export const CLI_BREW_CASK_MAP: Record<string, string> = {
  claude: "claude-code",
  codex: "codex",
};

export const EDITOR_CASK_MAP: Record<string, string> = {
  cursor: "cursor",
  vscode: "visual-studio-code",
};
