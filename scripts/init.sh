install_brew() {
  /usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
}

install_fomula() {
  brew install colordiff
  brew install git
  brew install neovim
  brew install wget
  brew install zplug
  brew install zsh
}

init() {
  install_brew
  install_fomula
}
