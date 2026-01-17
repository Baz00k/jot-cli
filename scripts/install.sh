#!/usr/bin/env bash
set -euo pipefail

REPO="Baz00k/jot-cli"
BINARY="jot"
INSTALL_DIR="${INSTALL_DIR:-${HOME}/.local/bin}"

if [ "${SKIP_PATH_CHECK:-}" = "1" ]; then
    PATH_CHECK=false
else
    PATH_CHECK=true
fi

if [ -t 1 ]; then
    RED="\033[0;31m"
    GREEN="\033[0;32m"
    YELLOW="\033[0;33m"
    RESET="\033[0m"
else
    RED=""
    GREEN=""
    YELLOW=""
    RESET=""
fi

fail() {
    printf "%b%s%b\n" "${RED}" "$1" "${RESET}" >&2
    exit 1
}

info() {
    printf "%b%s%b\n" "${GREEN}" "$1" "${RESET}"
}

warn() {
    printf "%b%s%b\n" "${YELLOW}" "$1" "${RESET}"
}

need_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        fail "Missing required command: $1"
    fi
}

need_cmd curl
need_cmd uname

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "${OS}" in
    linux*) OS="linux" ;;
    darwin*) OS="macos" ;;
    msys*|mingw*|cygwin*) OS="windows" ;;
    *) fail "Unsupported OS: ${OS}" ;;
esac

if [ "${OS}" = "macos" ]; then
    if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = "1" ]; then
        ARCH="arm64"
    fi
fi

case "${ARCH}" in
    x86_64|amd64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) fail "Unsupported architecture: ${ARCH}" ;;
esac

case "${OS}" in
    linux)
        case "${ARCH}" in
            x64) ASSET="jot-linux-x64" ;;
            arm64) ASSET="jot-linux-arm64" ;;
        esac
        ;;
    macos)
        case "${ARCH}" in
            x64) ASSET="jot-macos-x64" ;;
            arm64) ASSET="jot-macos-arm64" ;;
        esac
        ;;
    windows)
        case "${ARCH}" in
            x64) ASSET="jot-windows-x64.exe" ;;
            arm64) fail "Windows arm64 is not supported yet." ;;
        esac
        ;;
    *) fail "Unsupported OS: ${OS}" ;;
esac

VERSION="${JOT_VERSION:-latest}"
if [ "${VERSION}" = "latest" ]; then
    DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
else
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
fi

TMP_DIR=$(mktemp -d)
cleanup() {
    rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

info "Downloading ${BINARY} (${OS}/${ARCH}) from ${DOWNLOAD_URL}"

curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_DIR}/${ASSET}" || fail "Download failed."

if [ "${VERIFY_CHECKSUM:-1}" = "1" ]; then
    if [ "${VERSION}" = "latest" ]; then
        CHECKSUM_URL="https://github.com/${REPO}/releases/latest/download/jot-checksums.txt"
    else
        CHECKSUM_URL="https://github.com/${REPO}/releases/download/v${VERSION}/jot-checksums.txt"
    fi

    curl -fsSL "${CHECKSUM_URL}" -o "${TMP_DIR}/jot-checksums.txt" || fail "Checksum download failed."
    EXPECTED=$(grep "${ASSET}" "${TMP_DIR}/jot-checksums.txt" | awk '{print $1}')
    if [ -z "${EXPECTED}" ]; then
        fail "Checksum for ${ASSET} not found."
    fi

    if command -v shasum >/dev/null 2>&1; then
        ACTUAL=$(shasum -a 256 "${TMP_DIR}/${ASSET}" | awk '{print $1}')
    elif command -v sha256sum >/dev/null 2>&1; then
        ACTUAL=$(sha256sum "${TMP_DIR}/${ASSET}" | awk '{print $1}')
    else
        warn "No sha256 tool found; skipping checksum verification."
        ACTUAL=""
    fi

    if [ -n "${ACTUAL}" ] && [ "${EXPECTED}" != "${ACTUAL}" ]; then
        fail "Checksum verification failed."
    fi
fi

mkdir -p "${INSTALL_DIR}"

if [ "${OS}" = "windows" ]; then
    cp "${TMP_DIR}/${ASSET}" "${INSTALL_DIR}/${BINARY}.exe"
    chmod +x "${INSTALL_DIR}/${BINARY}.exe" || true
    info "Installed to ${INSTALL_DIR}/${BINARY}.exe"
else
    cp "${TMP_DIR}/${ASSET}" "${INSTALL_DIR}/${BINARY}"
    chmod +x "${INSTALL_DIR}/${BINARY}"
    info "Installed to ${INSTALL_DIR}/${BINARY}"
fi

if [ "${PATH_CHECK}" = true ] && ! command -v "${BINARY}" >/dev/null 2>&1; then
    warn "${INSTALL_DIR} is not on your PATH. Add it to your shell profile."
    warn "Example: echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.profile"
fi

info "Done. Run '${BINARY} --help' to get started."