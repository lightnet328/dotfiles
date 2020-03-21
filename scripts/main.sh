set -u
DOTPATH="$HOME/dotfiles"
FILES="$DOTPATH/files"
SCRIPTS="$DOTPATH/scripts"
REPOSITORY="git@github.com:lightnet328/dotfiles.git"

download() {
  if [ ! -d $DOTPATH ]; then
    git clone "$REPOSITORY" "$DOTPATH"
  else
    git pull
  fi
}

load() {
  source "$SCRIPTS/deploy.sh"
  source "$SCRIPTS/install.sh"
  source "$SCRIPTS/configure.sh"
}

main() {
  download
  load

  deploy
  install
  configure

  exit 0
}

main
