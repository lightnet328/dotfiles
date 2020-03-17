install_brew() {
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
}

install_fomula() {
  brew install colordiff
  brew install git
  brew install neovim
  brew install wget
  brew install zplug
  brew install zsh

  brew cask install iterm2
}

install_anyenv() {
  git clone https://github.com/riywo/anyenv ~/.anyenv
}

initialize() {
  install_brew
  install_fomula
  install_anyenv
}
