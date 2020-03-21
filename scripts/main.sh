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
  source "$SCRIPTS/initialize.sh"
  source "$SCRIPTS/configure.sh"
}

main() {
  download
  load

  deploy
  initialize
  configure

  exit 0
}

main
