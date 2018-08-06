#!/bin/bash
set -e
DOTPATH="$HOME/dotfiles"
FILES="$DOTPATH/files"
SCRIPTS="$DOTPATH/scripts"
REPOSITORY="git@github.com:lightnet328/dotfiles.git"

install() {
  if [ ! -d $DOTPATH ]; then
    git clone "$REPOSITORY" "$DOTPATH"
  fi
}

load() {
  source "$SCRIPTS/init.sh"
  source "$SCRIPTS/deploy.sh"
}

main() {
  install
  load

  init
  deploy

  exit 0
}

main
