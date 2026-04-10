set -u
DOTPATH="$HOME/dotfiles"
FILES="$DOTPATH/files"
SCRIPTS="$DOTPATH/scripts"
REPOSITORY="git@github.com:lightnet328/dotfiles.git"

download() {
  if [ ! -d "$DOTPATH" ]; then
    git clone "$REPOSITORY" "$DOTPATH"
  else
    (cd "$DOTPATH" && git pull)
  fi
}

load() {
  source "$SCRIPTS/install.sh"
  source "$SCRIPTS/deploy.sh"
  source "$SCRIPTS/initialize.sh"
  source "$SCRIPTS/setup_cmux_mcp.sh"
}

main() {
  download
  load

  install
  deploy
  initialize
  setup_cmux_mcp

  exit 0
}

main
