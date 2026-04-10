setup_cmux_mcp_codex() {
  local config="$HOME/.codex/config.toml"

  mkdir -p "$(dirname "$config")"

  if [ ! -f "$config" ]; then
    touch "$config"
  fi

  if ! grep -q '^\[mcp_servers\.cmux\]' "$config"; then
    if [ -s "$config" ]; then
      printf '\n' >> "$config"
    fi

    cat >> "$config" <<'EOF'
[mcp_servers.cmux]
command = "npx"
args = ["-y", "cmux-mcp"]
EOF
  fi
}

setup_cmux_mcp_json_config() {
  local config="$1"

  mkdir -p "$(dirname "$config")"

  if [ ! -f "$config" ]; then
    printf '{}\n' > "$config"
  fi

  ruby -r json -e '
    path = ARGV.fetch(0)
    raw = File.read(path)
    data = raw.strip.empty? ? {} : JSON.parse(raw)
    data["mcpServers"] ||= {}
    data["mcpServers"]["cmux"] = {
      "command" => "npx",
      "args" => ["-y", "cmux-mcp"]
    }
    File.write(path, JSON.pretty_generate(data) + "\n")
  ' "$config"
}

setup_cmux_mcp() {
  setup_cmux_mcp_codex
  setup_cmux_mcp_json_config "$HOME/.claude/settings.json"
  setup_cmux_mcp_json_config "$HOME/.mcp.json"
}
