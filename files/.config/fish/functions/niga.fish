function niga --description 'Install npm package globally for all mise node versions'
    for v in (mise ls node --installed | awk '{print $2}')
        echo ">>> $v"
        mise x node@$v -- npm i -g $argv
    end
end
