class JotCli < Formula
  desc "AI Research Assistant CLI"
  homepage "https://github.com/Baz00k/jot-cli"
  version "__VERSION__"

  on_macos do
    if Hardware::CPU.arm?
      url "__URL_MACOS_ARM64__"
      sha256 "__SHA256_MACOS_ARM64__"
    else
      url "__URL_MACOS_X64__"
      sha256 "__SHA256_MACOS_X64__"
    end
  end

  on_linux do
    if Hardware::CPU.arm? && Hardware::CPU.is_64_bit?
      url "__URL_LINUX_ARM64__"
      sha256 "__SHA256_LINUX_ARM64__"
    else
      url "__URL_LINUX_X64__"
      sha256 "__SHA256_LINUX_X64__"
    end
  end

  def install
    binary = if OS.mac?
      Hardware::CPU.arm? ? "jot-macos-arm64" : "jot-macos-x64"
    else
      (Hardware::CPU.arm? && Hardware::CPU.is_64_bit?) ? "jot-linux-arm64" : "jot-linux-x64"
    end

    bin.install binary => "jot"
  end

  test do
    system "#{bin}/jot", "--version"
  end
end
