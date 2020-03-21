install_brew() {
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
}

install_fomula() {
  brew install colordiff
  brew install git
  brew install neovim
  brew install wget
  brew install jq
  brew install fzf
  brew install ghq
  brew install fish

  brew cask install iterm2
}

install_fisher() {
  set XDG_CONFIG_HOME ~/.config
  curl https://git.io/fisher --create-dirs -sLo ~/.config/fish/functions/fisher.fish
  fish -c fisher
}

install_anyenv() {
  git clone https://github.com/riywo/anyenv ~/.anyenv
}

initialize() {
  install_brew
  install_fomula
  install_fisher
  install_anyenv
}
