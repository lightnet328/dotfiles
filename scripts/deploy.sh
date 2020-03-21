deploy() {
  for f in $(find $FILES -type f)
  do
    filepath="${f/$FILES}"
    mkdir -p $(dirname "$f")
    ln -snfv "$FILES$filepath" "$HOME$filepath"
  done
}
