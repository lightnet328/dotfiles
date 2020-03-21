get_files() {
  for pathname in "$2"/*; do
    if [ -d "$pathname" ]; then
      get_files "$1" "$pathname"
    else
      echo "${pathname/$1}"
    fi
  done
}

deploy() {
  local FILES="$DOTPATH/files"
  for f in $(get_files "$FILES" "$FILES")
  do
    mkdir -p $(dirname "$HOME$f")
    ln -snfv "$FILES$f" "$HOME$f"
  done
}
