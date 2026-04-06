deploy() {
  for f in $(find "$FILES" -type f); do
    filepath="${f#$FILES}"
    target="$HOME$filepath"
    mkdir -p "$(dirname "$target")"
    # Back up existing non-symlink files once before replacing with a symlink.
    if [ -e "$target" ] && [ ! -L "$target" ]; then
      mv "$target" "$target.bak-$(date +%Y%m%d%H%M%S)"
    fi
    ln -snfv "$f" "$target"
  done
}
