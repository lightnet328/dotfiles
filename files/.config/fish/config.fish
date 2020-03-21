# Environment Variables
## Editor
set -x EDITOR vim

## XDG Base Directory
set -x XDG_CONFIG_HOME $HOME/.config

## bin
set -x PATH /usr/local/bin $PATH

## sbin
set -x PATH /usr/local/sbin $PATH

## Color
set -x LS_COLORS "di=34:ln=35:so=32:pi=33:ex=31:bd=46;34:cd=43;34:su=41;30:sg=46;30:tw=42;30:ow=43;30"

## anyenv
set -x PATH $HOME/.anyenv/bin $PATH
eval (anyenv init - | source)

## Go
set -x GOPATH $HOME/go
set -x PATH $GOPATH/bin $PATH

## rbenv
set -x PATH $HOME/.rbenv/bin $PATH

## Google Cloud SDK
if [ -f $HOME/google-cloud-sdk/path.fish.inc ]
  source $HOME/google-cloud-sdk/path.fish.inc
end

## gcloud
if [ -f $HOME/google-cloud-sdk/completion.fish.inc ]
  source $HOME/google-cloud-sdk/completion.fish.inc
end

## yarn
set -x PATH $HOME/.yarn/bin $PATH
set -x PATH $HOME/.config/yarn/global/node_modules/.bin $PATH

## fzf
set -x FZF_DEFAULT_OPTS '--height 40% --reverse --exit-0'
set -x FZF_COMPLETION_TRIGGER '**'

# Aliases
## cd
alias ...='../..'
alias ....='../../..'
alias .....='../../../..'
alias ......='../../../../..'

## VisualStudio Code
alias edit='code'

## Neovim
alias vim='nvim'

## Colordiff
alias diff='colordiff -u'

## ls
alias ls='ls -G'

## tree
alias tree='tree -N'

## Shell
alias reload='exec $SHELL -l'

## Interactive Commands
alias lsi='ls | fzf'
alias cdi='cd `ls -d */ | fzf`'

## Kubernetes get token
alias kubetkn='kubectl config view | grep id-token | cut -f 2 -d ":" | tr -d " "'

## Shorthands
alias g='git'
alias k='kubectl'

# Key Bindings
function fish_user_key_bindings
  bind -k sr beginning-of-line
  bind -k sf end-of-line
  bind \c] __ghq_repository_search
end