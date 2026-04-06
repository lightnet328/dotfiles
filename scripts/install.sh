install_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
}

install_formulae() {
  # Shell & prompt
  brew install fish
  brew install starship

  # Version / env managers
  brew install mise

  # Modern CLI replacements
  brew install bat
  brew install eza
  brew install fd
  brew install fzf
  brew install ripgrep
  brew install zoxide
  brew install trash

  # Git
  brew install git
  brew install gh
  brew install ghq
  brew install gitui
  brew install git-lfs
  brew install tig

  # Build / lang
  brew install neovim
  brew install jq
  brew install wget
  brew install tree
  brew install colordiff

  # Runtime
  brew install oven-sh/bun/bun
}

install_casks() {
  brew install --cask ghostty
  brew install --cask font-hack-nerd-font
}

install_fisher() {
  fish -c 'curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher'
}

install() {
  install_brew
  install_formulae
  install_casks
  install_fisher
}
