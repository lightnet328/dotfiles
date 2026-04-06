initialize_fisher_plugins() {
  fish -c 'for p in (cat ~/.config/fish/fishfile); fisher install $p; end'
}

initialize_starship_cache() {
  mkdir -p ~/.config/fish/conf.d
  fish -c 'starship init fish > ~/.config/fish/conf.d/_starship_init.fish'
}

initialize_zoxide_cache() {
  mkdir -p ~/.config/fish/conf.d
  fish -c 'zoxide init fish > ~/.config/fish/conf.d/_zoxide_init.fish'
}

initialize() {
  initialize_fisher_plugins
  initialize_starship_cache
  initialize_zoxide_cache
}
