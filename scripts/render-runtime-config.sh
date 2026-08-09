#!/bin/sh
set -eu

template_path=${1:-/etc/webgl-preview/runtime-config.json}
output_path=${2:-/usr/share/nginx/html/runtime-config.json}
required=${REQUIRE_TRUSTED_HOST_ORIGINS:-0}
trusted_origins=${TRUSTED_HOST_ORIGINS_JSON:-}

fail() {
  printf '%s\n' "runtime-config: $1" >&2
  exit 1
}

case "$required" in
  0|1) ;;
  *) fail 'REQUIRE_TRUSTED_HOST_ORIGINS must be 0 or 1' ;;
esac

[ -f "$template_path" ] || fail "template not found: $template_path"

if [ -z "$trusted_origins" ]; then
  [ "$required" = 0 ] || fail 'TRUSTED_HOST_ORIGINS_JSON is required'
  if [ "$template_path" != "$output_path" ]; then
    cp "$template_path" "$output_path"
  fi
  exit 0
fi

case "$trusted_origins" in
  \[*\]) ;;
  *) fail 'TRUSTED_HOST_ORIGINS_JSON must be a compact JSON array' ;;
esac

entries=${trusted_origins#\[}
entries=${entries%\]}
[ -n "$entries" ] || fail 'trusted host origin array must not be empty'
case "$entries" in
  ,*|*,|*,,*) fail 'trusted host origin array contains an empty entry' ;;
esac

set -f
saved_ifs=$IFS
IFS=,
set -- $entries
IFS=$saved_ifs
seen='|'

for entry in "$@"; do
  case "$entry" in
    \"https://*\") ;;
    *) fail 'every trusted host must be a quoted exact HTTPS origin' ;;
  esac
  origin=${entry#\"}
  origin=${origin%\"}
  host_port=${origin#https://}
  case "$host_port" in
    ''|*/*|*\?*|*#*|*@*|*\\*|*\"*|*\'*)
      fail "invalid trusted host origin: $origin"
      ;;
    *[!a-z0-9.:-]*)
      fail "trusted host origin is not canonical lowercase ASCII: $origin"
      ;;
  esac

  host=$host_port
  port=''
  case "$host_port" in
    *:*)
      host=${host_port%%:*}
      port=${host_port#*:}
      case "$port" in
        ''|*:*|*[!0-9]*) fail "invalid trusted host port: $origin" ;;
        0*) fail "trusted host port must be canonical: $origin" ;;
      esac
      [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || \
        fail "trusted host port is out of range: $origin"
      [ "$port" -ne 443 ] || fail "default HTTPS port must be omitted: $origin"
      ;;
  esac

  [ ${#host} -le 253 ] || fail "trusted host is too long: $origin"
  case "$host" in
    ''|.*|*.|*..*) fail "invalid trusted host name: $origin" ;;
  esac

  label_ifs=$IFS
  IFS=.
  set -- $host
  IFS=$label_ifs
  for label in "$@"; do
    [ ${#label} -le 63 ] || fail "trusted host label is too long: $origin"
    case "$label" in
      ''|-*|*-) fail "invalid trusted host label: $origin" ;;
      *[!a-z0-9-]*) fail "invalid trusted host label: $origin" ;;
    esac
  done

  case "$seen" in
    *"|$origin|"*) fail "duplicate trusted host origin: $origin" ;;
  esac
  seen="${seen}${origin}|"
done

tmp_path="${output_path}.tmp.$$"
trap 'rm -f "$tmp_path"' EXIT HUP INT TERM
awk -v replacement="$trusted_origins" '
  /^[[:space:]]*"trustedHostOrigins":[[:space:]]*\[[[:space:]]*$/ {
    print "  \"trustedHostOrigins\": " replacement ","
    inside = 1
    found += 1
    next
  }
  inside && /^[[:space:]]*\],[[:space:]]*$/ {
    inside = 0
    next
  }
  !inside { print }
  END {
    if (inside || found != 1) exit 42
  }
' "$template_path" > "$tmp_path" || fail 'could not replace trustedHostOrigins exactly once'
chmod 0644 "$tmp_path"
mv "$tmp_path" "$output_path"
trap - EXIT HUP INT TERM
