#!/bin/bash
set -e
DOTPATH="$HOME/dotfiles"
FILES="$DOTPATH/files"
SCRIPTS="$DOTPATH/scripts"
REPOSITORY="git@github.com:lightnet328/dotfiles.git"

download() {
  if [ ! -d $DOTPATH ]; then
    git clone "$REPOSITORY" "$DOTPATH"
  fi
}

load() {
  source "$SCRIPTS/initialize.sh"
  source "$SCRIPTS/deploy.sh"
  source "$SCRIPTS/configure.sh"
}

main() {
  download
  load

  initialize
  deploy
  configure

  exit 0
}

main
