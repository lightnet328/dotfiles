configure_iterm2() {
  open -g "/Applications/iTerm.app" && sleep 1
  defaults write com.googlecode.iterm2 PromptOnQuit -bool false
  sleep 1 && osascript -e 'quit app "iTerm"'

  tmp=$(mktemp)
  trap "rm $tmp" EXIT

  curl -s -o $tmp https://raw.githubusercontent.com/mbadolato/iTerm2-Color-Schemes/master/schemes/Brogrammer.itermcolors

  /usr/libexec/PlistBuddy -c "Delete 'Custom Color Presets':'Brogrammer' dict" ~/Library/Preferences/com.googlecode.iTerm2.plist 2>/dev/null
  /usr/libexec/PlistBuddy -c "Add 'Custom Color Presets':'Brogrammer' dict" ~/Library/Preferences/com.googlecode.iTerm2.plist
  /usr/libexec/PlistBuddy -c "Merge '$tmp' 'Custom Color Presets':'Brogrammer'" ~/Library/Preferences/com.googlecode.iTerm2.plist

  for color in "Ansi 0 Color" "Ansi 1 Color" "Ansi 2 Color" "Ansi 3 Color" "Ansi 4 Color" "Ansi 5 Color" "Ansi 6 Color" "Ansi 7 Color" "Ansi 8 Color" "Ansi 9 Color" "Ansi 10 Color" "Ansi 11 Color" "Ansi 12 Color" "Ansi 13 Color" "Ansi 14 Color" "Ansi 15 Color" "Background Color" "Bold Color" "Cursor Color" "Cursor Text Color" "Foreground Color" "Selected Text Color" "Selection Color"
  do
    /usr/libexec/PlistBuddy -c "Delete :'New Bookmarks':0:'$color'" ~/Library/Preferences/com.googlecode.iterm2.plist
  done

  /usr/libexec/PlistBuddy -c "Merge '$tmp' 'New Bookmarks':0" ~/Library/Preferences/com.googlecode.iterm2.plist

  killall cfprefsd
}

configure() {
  configure_iterm2
}
