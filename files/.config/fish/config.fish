set -g fish_greeting

# Environment Variables
## Editor
set -x EDITOR vim

## XDG Base Directory
set -x XDG_CONFIG_HOME $HOME/.config

## bin
fish_add_path /usr/local/bin

## sbin
fish_add_path /usr/local/sbin

## Homebrew
fish_add_path /opt/homebrew/bin

## Color
set -x LS_COLORS "di=34:ln=35:so=32:pi=33:ex=31:bd=46;34:cd=43;34:su=41;30:sg=46;30:tw=42;30:ow=43;30"

## mise (shims mode for fast startup)
fish_add_path "$HOME/.local/share/mise/shims"

## rye
fish_add_path "$HOME/.rye/shims"

## Go
set -x GOPATH $HOME/go
fish_add_path $GOPATH/bin

## bun
set -x BUN_INSTALL "$HOME/.bun"
fish_add_path $BUN_INSTALL/bin

## Cargo
fish_add_path "$HOME/.cargo/bin"

## Android SDK
fish_add_path ~/Library/Android/sdk/platform-tools

## Local bin
fish_add_path $HOME/.local/bin

# Android Studio
set -x ANDROID_SDK_ROOT $HOME/Library/Android/sdk

## Google Cloud SDK
if [ -f $HOME/google-cloud-sdk/path.fish.inc ]
  source $HOME/google-cloud-sdk/path.fish.inc
end

## gcloud
if [ -f $HOME/google-cloud-sdk/completion.fish.inc ]
  source $HOME/google-cloud-sdk/completion.fish.inc
end

## yarn
fish_add_path $HOME/.yarn/bin
fish_add_path $HOME/.config/yarn/global/node_modules/.bin

## fzf
set -x FZF_DEFAULT_OPTS '--height 40% --reverse --exit-0'
set -x FZF_COMPLETION_TRIGGER '**'

# Functions
function rebase
  set -x FROM_REF (git branch | fzf | awk '{print $NF}')
  set -x TO_REF (git branch | fzf | awk '{print $NF}')
  set -x CURRENT_REF (git branch --contains | cut -d " " -f 2)
  set -x ROOT_REF (git show-branch --sha1-name $FROM_REF $CURRENT_REF | tail -1 | awk -F'[]~^[]' '{print $2}')
  git rebase --onto $TO_REF $ROOT_REF $CURRENT_REF
end

function gif
  set -x TMPDIR (mktemp -d)
  ffmpeg -i $argv[1] -vf "palettegen" -y $TMPDIR/pallet.png
  ffmpeg -i $argv[1] -i $TMPDIR/pallet.png -lavfi "fps=12,scale=900:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -y $argv[1].gif
end

# Abbreviations
## cd
abbr -a -- ... '../..'
abbr -a -- .... '../../..'
abbr -a -- ..... '../../../..'
abbr -a -- ...... '../../../../..'

## Cursor
abbr -a -- edit 'cursor'

## Neovim
alias vim='nvim'
abbr -a -- vim 'nvim'

## Colordiff
abbr -a -- diff 'colordiff -u'

## Modern CLI tools
alias ls='eza --icons --git'
alias ll='eza --icons --git -la'
alias la='eza --icons --git -a'
alias lt='eza --icons --git --tree'
alias cat='bat'

## tree
alias tree='eza --icons --tree'

## Shell
abbr -a -- reload 'exec $SHELL -l'
abbr -a -- r 'exec $SHELL -l'

## Trash
fish_add_path /opt/homebrew/opt/trash/bin
alias rm='trash -F'

## Interactive Commands
alias lsi='eza --icons | fzf'
alias cdi='cd (eza -D | fzf)'

## Shorthands
abbr -a -- g 'git'
abbr -a -- gu 'gitui'
abbr -a -- k 'kubectl'
abbr -a -- s 'nr hasura:sync && nr update-graphql-schema && nr format-hasura-metadata-yaml'
abbr -a -- v 'gh pr view --web'

## Docker
abbr -a -- d 'docker'
abbr -a -- dc 'docker compose'
abbr -a -- dcu 'docker compose up -d'
abbr -a -- dcd 'docker compose down'
abbr -a -- dcl 'docker compose logs -f'
abbr -a -- dps 'docker ps'
abbr -a -- dpsa 'docker ps -a'
abbr -a -- dex 'docker exec -it'

## Utility
abbr -a -- cu 'cursor .'
abbr -a -- cl 'claude --dangerously-skip-permissions'
abbr -a -- co 'codex --yolo'
abbr -a -- o 'open .'
abbr -a -- p 'pnpm'
abbr -a -- y 'yarn'
abbr -a -- n 'npm'
abbr -a -- b 'bun'
abbr -a -- md 'mkdir -p'
abbr -a -- ports 'lsof -i -P | grep LISTEN'
abbr -a -- ip 'curl -s ifconfig.me'

# Key Bindings
function fish_user_key_bindings
  bind \c] __ghq_repository_search

  # fzf.fish のキーバインド設定
  fzf_configure_bindings --directory=\cf --git_log=\cg --git_status=\cs --history=\cr --processes=\cp --variables=\cv

  # Ctrl+O: 現在の行を open コマンドで実行 (ディレクトリを Finder で開く)
  bind \co 'commandline -r "open ."'

  # Alt+Enter: sudo を先頭に追加
  bind \e\r __fish_prepend_sudo
end

function __fish_prepend_sudo
  set -l cmd (commandline)
  if test -n "$cmd"
    commandline -r "sudo $cmd"
  end
end

# zoxide (cached init)
if not test -f ~/.config/fish/conf.d/_zoxide_init.fish
  zoxide init fish > ~/.config/fish/conf.d/_zoxide_init.fish
end

# Starship prompt (cached init)
if not test -f ~/.config/fish/conf.d/_starship_init.fish
  starship init fish > ~/.config/fish/conf.d/_starship_init.fish
end
