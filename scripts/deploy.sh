deploy() {
  local FILES="${DOTPATH}/files"
  cd $FILES
  for f in .??*
  do
    ln -snfv ${FILES}/${f} ${HOME}/${f}
  done
}
