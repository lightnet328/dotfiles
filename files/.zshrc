export ZPLUG_HOME=/usr/local/opt/zplug
source $ZPLUG_HOME/init.zsh

# Environment Variables
## Editor
export EDITOR="vim"

## bin
export PATH="/usr/local/bin:$PATH"

## XDG Base Directory
export XDG_CONFIG_HOME="$HOME/.config"

## Color
export LS_COLORS='di=34:ln=35:so=32:pi=33:ex=31:bd=46;34:cd=43;34:su=41;30:sg=46;30:tw=42;30:ow=43;30'

## anyenv
export PATH="$HOME/.anyenv/bin:$PATH"
eval "$(anyenv init -)"

## Go
export GOPATH="$HOME/go"
export PATH="$PATH:$GOPATH/bin"

## fzf
export FZF_DEFAULT_OPTS="--height 40% --reverse --exit-0"
export FZF_COMPLETION_TRIGGER='**'

# Aliases
## cd
alias ...="../.."
alias ....="../../.."
alias .....="../../../.."
alias ......="../../../../.."

## VisualStudio Code
alias edit="code"

## Neovim
alias vim="nvim"

## GitKraken
alias kraken="_(){ open -na 'GitKraken' --args -p ${1:-`pwd`}(:a) };_"

## Colordiff
alias diff="colordiff -u"

## Highlight
### for Keynote
alias hlk='highlight -O rtf -k "Monaco" -K 20 -s andes -u utf-8'
### for Word
alias hlw='highlight -O rtf -k "Monaco" -K 10 -s fine_blue -u utf-8'

## ls
alias ls='ls -G'

## Shell
alias reload='exec $SHELL -l'

## Interactive Commands
alias lsi='ls | fzf'
alias cdi='cd `ls -d */ | fzf`'

## Kubernetes get token
alias kubetkn='kubectl config view | grep id-token | cut -f 2 -d ":" | tr -d " "'


# Zsh Options
## Change Directory
setopt auto_cd
setopt auto_pushd
setopt cdable_vars
setopt pushd_ignore_dups

## Completion
setopt always_to_end
setopt complete_in_word

autoload -U compinit
compinit -C

## History
setopt hist_verify
setopt hist_ignore_dups
setopt hist_find_no_dups
setopt hist_expire_dups_first
setopt inc_append_history

## Comment
setopt interactive_comments

[ -z "$HISTFILE" ] && export HISTFILE="$HOME/.zsh_history"
export HISTSIZE=10000
export SAVEHIST=1000000

## Color
autoload -Uz colors
colors

## cdr
autoload -Uz add-zsh-hock
autoload -Uz chpwd_recent_dirs cdr add-zsh-hook


# Key Bindings
bindkey "[A" beginning-of-line
bindkey "[B" end-of-line
bindkey "[C" forward-word
bindkey "[D" backward-word
bindkey '^B' anyframe-widget-checkout-git-branch
bindkey "^H" anyframe-widget-execute-history
bindkey "^R" anyframe-widget-put-history
bindkey "^K" anyframe-widget-kill
bindkey '^]' anyframe-widget-cd-ghq-repository
bindkey "^[[A" history-substring-search-up
bindkey "^[[B" history-substring-search-down


# Zstyle
zstyle ':completion:*:default' menu select=2
zstyle ':completion:*' special-dirs true
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ":anyframe:selector:" use fzf
zstyle ":anyframe:selector:fzf:" command 'fzf --extended --no-sort'


# Zplug
## Theme
zplug "mafredri/zsh-async", from:github
zplug "sindresorhus/pure", use:pure.zsh, from:github, as:theme
PROMPT=" $PROMPT"

## Syntax Highlighting
zplug "zsh-users/zsh-syntax-highlighting"

## Completion
zplug "zsh-users/zsh-autosuggestions", hook-load:"ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=242'"
zplug "zsh-users/zsh-completions", use:'src/_*', lazy:true
zplug "zsh-users/zsh-history-substring-search"

## Fuzzy Finder
zplug "mollifier/anyframe"
zplug "junegunn/fzf-bin", as:command, from:gh-r, rename-to:fzf

## jq
zplug "stedolan/jq", as:command, from:gh-r, rename-to:jq

## ghq
zplug "motemen/ghq", as:command, from:gh-r, rename-to:ghq

## Install required packages
zplug check --verbose || zplug install

zplug load
