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
}

main() {
  download
  load

  initialize
  deploy

  exit 0
}

main
