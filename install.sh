#!/bin/bash
#
# Bootstrap for the Factorial developer setup wizard.
#
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/factorialco/welcome/v1/install.sh)"
#
# Installs Homebrew and Node.js on an untouched macOS machine, then starts the
# wizard. The wizard cannot install these itself: it is a Node program fetched
# with npx, so Node, npm and git must exist before it can run at all.
#
# Use the command-substitution form above rather than `curl … | bash`. The wizard
# is an interactive terminal UI, and a pipe leaves this script's stdin attached to
# curl instead of the terminal, so the UI cannot read keystrokes.
#
# Environment overrides:
#   WELCOME_REF=<branch|tag>  version of the wizard to run (default: v1)
#   WELCOME_SKIP_LAUNCH=1     install the prerequisites, then stop
#   WELCOME_DRY_RUN=1         print the install commands instead of running them
#   WELCOME_DEBUG=1           trace every command
#
# Progress is appended to /tmp/welcome-bootstrap.log.

# No `set -e`: every failure is reported through die() with an explanation, which
# is more useful than an opaque non-zero exit. Written for the bash 3.2 that ships
# with macOS, so no associative arrays and no ${var^^}.
set -uo pipefail

MIN_NODE_MAJOR=24
REF="${WELCOME_REF:-v1}"
REPO_SPEC="github:factorialco/welcome#${REF}"
BREW_INSTALLER_URL="https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"
LOG="/tmp/welcome-bootstrap.log"

BREW=""
SUDO_KEEPALIVE_PID=""

if [ -t 2 ]; then
  BOLD=$(printf '\033[1m')
  DIM=$(printf '\033[2m')
  RED=$(printf '\033[31m')
  RESET=$(printf '\033[0m')
else
  BOLD=""
  DIM=""
  RED=""
  RESET=""
fi

# ── Output ─────────────────────────────────────────────

log() {
  printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*" >&2
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >>"$LOG" 2>/dev/null
}

dry() {
  printf '%s(dry run)%s %s\n' "$DIM" "$RESET" "$*" >&2
}

die() {
  printf '\n%sError:%s %s\n\n' "${RED}${BOLD}" "$RESET" "$*" >&2
  printf '[%s] ERROR: %s\n' "$(date '+%H:%M:%S')" "$*" >>"$LOG" 2>/dev/null
  exit 1
}

# Run a mutating command, or describe it under WELCOME_DRY_RUN.
run() {
  if [ -n "${WELCOME_DRY_RUN-}" ]; then
    dry "$*"
    return 0
  fi
  "$@"
}

cleanup() {
  stop_sudo_keepalive
}

# ── Guards ─────────────────────────────────────────────

check_platform() {
  if [ "$(id -u)" -eq 0 ]; then
    die "Do not run this with sudo or as root. Homebrew refuses to install as root.
Run it again as your normal user; it asks for your password when it needs one."
  fi

  if [ "$(uname -s)" != "Darwin" ]; then
    die "This bootstrap supports macOS only.
On Linux, install Node.js >= ${MIN_NODE_MAJOR} and git with your package manager, then run:
  npx --yes \"${REPO_SPEC}\""
  fi

  command -v curl >/dev/null 2>&1 || die "curl is required but was not found on PATH."

  # Under Rosetta `uname -m` reports x86_64, so Homebrew's installer would put the
  # Intel build in /usr/local on an Apple Silicon Mac and every tool installed
  # afterwards would be x86.
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
    die "This terminal runs under Rosetta, which would install the Intel Homebrew.
Open a native terminal (uncheck \"Open using Rosetta\" in the app's Get Info), or re-run with:
  arch -arm64 /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/factorialco/welcome/${REF}/install.sh)\""
  fi

  # Same check and the same guidance as checkAdmin() in src/commands/preflight.ts.
  if ! id -Gn 2>/dev/null | tr ' ' '\n' | grep -qx admin; then
    die "You are not a macOS Administrator, which Homebrew requires.
Get admin from IT (Self Service+ \"Root permissions\" or Factorial IT MDM); once granted,
log out and back in or reboot for it to take effect. Do NOT run this with sudo."
  fi
}

# The wizard is a terminal UI and needs the real terminal on stdin. A pipe leaves
# stdin attached to curl, which is recoverable by reopening /dev/tty.
#
# Probe the reopen in a subshell first. A failed redirection on the `exec` builtin
# can terminate a non-interactive shell outright, so a trailing || die would never
# print. `-r /dev/tty` is not a usable test: it reports permissions, and succeeds
# even when the process has no controlling terminal at all.
ensure_tty() {
  [ -t 0 ] && return 0
  if (exec </dev/tty) 2>/dev/null; then
    exec </dev/tty
    [ -t 0 ] && return 0
  fi
  die "No terminal on stdin, so the wizard cannot read your keystrokes.
Run the command-substitution form (not a pipe):
  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/factorialco/welcome/${REF}/install.sh)\""
}

# ── Detection ──────────────────────────────────────────

# Deliberately parses `node -v` with parameter expansion rather than asking node
# to evaluate anything: the node being tested may be far too old.
node_ok() {
  local version major
  command -v node >/dev/null 2>&1 || return 1
  version=$(node -v 2>/dev/null) || return 1
  version=${version#v}
  major=${version%%.*}
  case "$major" in
    '' | *[!0-9]*) return 1 ;;
  esac
  [ "$major" -ge "$MIN_NODE_MAJOR" ]
}

brew_bin() {
  local candidate
  candidate=$(command -v brew 2>/dev/null)
  if [ -n "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  # A brew installed by an earlier run is not on PATH until the shell profile is
  # sourced again, so look in both prefixes directly.
  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

# Matches getShellProfile() in src/platform.ts.
shell_profile() {
  case "${SHELL:-/bin/zsh}" in
    *zsh*) printf '%s\n' "$HOME/.zprofile" ;;
    *) printf '%s\n' "$HOME/.bash_profile" ;;
  esac
}

append_line() {
  local file=$1 line=$2
  if [ -n "${WELCOME_DRY_RUN-}" ]; then
    dry "append to ${file}: ${line}"
    return 0
  fi
  # Command substitution drops a trailing newline, so a non-empty result means the
  # file does not end in one.
  if [ -s "$file" ] && [ -n "$(tail -c 1 "$file")" ]; then
    printf '\n' >>"$file" || die "Could not write to ${file}"
  fi
  printf '%s\n' "$line" >>"$file" || die "Could not write to ${file}"
}

# ── Sudo ───────────────────────────────────────────────

# Homebrew's installer needs root for a few minutes while it downloads the Xcode
# Command Line Tools, and the default sudo timestamp is shorter than that. Bounded
# at 30 minutes so an abandoned run cannot hold root open indefinitely.
start_sudo_keepalive() {
  (
    attempts=0
    while [ "$attempts" -lt 30 ]; do
      sleep 60
      sudo -n -v 2>/dev/null || exit 0
      attempts=$((attempts + 1))
    done
  ) &
  SUDO_KEEPALIVE_PID=$!
}

stop_sudo_keepalive() {
  if [ -n "$SUDO_KEEPALIVE_PID" ]; then
    kill "$SUDO_KEEPALIVE_PID" 2>/dev/null
    SUDO_KEEPALIVE_PID=""
  fi
  return 0
}

# ── Install steps ──────────────────────────────────────

install_homebrew() {
  local installer
  log "Installing Homebrew. It also installs the Xcode Command Line Tools, which take a while."

  if [ -n "${WELCOME_DRY_RUN-}" ]; then
    dry "sudo -v"
    dry "curl -fsSL ${BREW_INSTALLER_URL} -o \$installer"
    dry "NONINTERACTIVE=1 /bin/bash \$installer"
    return 0
  fi

  # With NONINTERACTIVE set, Homebrew's installer probes for rights using `sudo -n`
  # and aborts when no credentials are cached. Prime them here so the password
  # prompt arrives once, with an explanation of what it is for.
  log "macOS needs your login password to install Homebrew."
  sudo -v || die "Could not get administrator rights, so Homebrew cannot be installed.
Check that you are an Administrator and that \"Root permissions\" is enabled in Self Service+."
  start_sudo_keepalive

  # Download to a file first. With `bash -c \"\$(curl …)\"` a failed download turns
  # into an empty script that exits 0, which would look like a successful install.
  installer=$(mktemp "${TMPDIR:-/tmp}/homebrew-install.XXXXXX") || die "Could not create a temporary file."
  curl -fsSL "$BREW_INSTALLER_URL" -o "$installer" ||
    die "Could not download the Homebrew installer from ${BREW_INSTALLER_URL}."
  [ -s "$installer" ] || die "The downloaded Homebrew installer was empty."

  NONINTERACTIVE=1 /bin/bash "$installer"
  local status=$?
  rm -f "$installer"
  stop_sudo_keepalive
  [ "$status" -eq 0 ] || die "Homebrew installation failed (exit ${status}).
See the output above, or ${LOG}."
}

# Make brew usable now and in future login shells. The wizard runs every command
# through a login shell, so without the profile line it cannot see brew at all.
activate_homebrew() {
  local prefix line profile
  eval "$("$BREW" shellenv)" || die "Could not run \`${BREW} shellenv\`."

  prefix=$("$BREW" --prefix 2>/dev/null) || die "Could not read the Homebrew prefix."
  # Must be byte-identical to the line ensureHomebrew() writes in
  # src/commands/homebrew.ts, otherwise the wizard appends a second copy.
  line="eval \"\$(${prefix}/bin/brew shellenv)\""
  profile=$(shell_profile)

  if [ -f "$profile" ] && grep -qF "$line" "$profile"; then
    return 0
  fi
  log "Adding Homebrew to ${profile}"
  append_line "$profile" "$line"
}

ensure_homebrew() {
  BREW=$(brew_bin)
  if [ -n "$BREW" ]; then
    log "Homebrew already installed (${BREW})"
  else
    install_homebrew
    if [ -n "${WELCOME_DRY_RUN-}" ]; then
      return 0
    fi
    BREW=$(brew_bin) ||
      die "Homebrew's installer finished but no brew binary was found in /opt/homebrew or /usr/local."
  fi
  activate_homebrew
}

ensure_node() {
  if node_ok; then
    log "Node.js $(node -v) already installed"
  else
    log "Installing Node.js with Homebrew"
    # The mainline formula tracks current Node, which is always >= the minimum. The
    # versioned node@NN formulae are keg-only and would need extra PATH wiring.
    run "${BREW:-brew}" install node ||
      die "\`brew install node\` failed. See the output above, or ${LOG}."
    hash -r 2>/dev/null
  fi

  if [ -n "${WELCOME_DRY_RUN-}" ]; then
    return 0
  fi

  node_ok || die "Node.js $(node -v 2>/dev/null) is on PATH but the wizard needs >= ${MIN_NODE_MAJOR}.
An older Node.js is shadowing the one Homebrew installed. Try:
  brew link --overwrite node"

  command -v npx >/dev/null 2>&1 ||
    die "npx was not found even though Node.js is installed. Try: ${BREW:-brew} reinstall node"

  # npx resolves the github: spec by cloning, and git comes from the Xcode Command
  # Line Tools that Homebrew's installer pulls in.
  command -v git >/dev/null 2>&1 ||
    die "git was not found. Install the Xcode Command Line Tools and retry:
  xcode-select --install"
}

launch() {
  if [ -n "${WELCOME_SKIP_LAUNCH-}" ]; then
    log "Prerequisites are ready. Skipping the wizard (WELCOME_SKIP_LAUNCH is set)."
    log "Start it with: npx --yes \"${REPO_SPEC}\""
    return 0
  fi
  log "Starting the setup wizard (${REPO_SPEC})"
  stop_sudo_keepalive
  # exec so the wizard owns the terminal and receives signals directly.
  exec npx --yes "$REPO_SPEC"
}

main() {
  if [ -n "${WELCOME_DEBUG-}" ]; then
    set -x
  fi
  trap cleanup EXIT INT TERM

  check_platform
  # A dry run performs nothing interactive, so it stays usable where there is no
  # controlling terminal (a sandbox, a CI runner).
  if [ -z "${WELCOME_DRY_RUN-}" ]; then
    ensure_tty
  fi

  # Nothing to do when a usable toolchain is already present. Homebrew itself is
  # not required here: the wizard installs it in step 1.
  if node_ok && command -v npx >/dev/null 2>&1 && command -v git >/dev/null 2>&1; then
    log "Node.js $(node -v), npx and git are already available"
  else
    ensure_homebrew
    ensure_node
  fi

  launch
}

main "$@"
