#!/bin/sh

set -eu

fail() {
  printf '%s\n' \
    'HOST_API_BASE must be an exact credential-free HTTPS origin (for example https://d.dev.xrugc.com)' \
    >&2
  exit 1
}

value=${HOST_API_BASE:-}
[ -n "${value}" ] || fail

# Keep envsubst input incapable of injecting nginx syntax. Runtime upstreams
# are deployment-owned exact origins; paths, queries, fragments and userinfo
# are deliberately unsupported.
case "${value}" in
  *[[:space:]]*) fail ;;
esac

printf '%s\n' "${value}" | grep -Eq \
  '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?$' || fail

authority=${value#https://}
host=${authority%%:*}
[ "${#host}" -le 253 ] || fail
printf '%s\n' "${host}" | grep -Eqv '\.\.' || fail

old_ifs=${IFS}
IFS=.
set -- ${host}
IFS=${old_ifs}
for label in "$@"; do
  [ -n "${label}" ] || fail
  [ "${#label}" -le 63 ] || fail
  printf '%s\n' "${label}" | grep -Eq \
    '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$' || fail
done

case "${authority}" in
  *:*)
    port=${authority##*:}
    [ "${port}" -ge 1 ] 2>/dev/null || fail
    [ "${port}" -le 65535 ] 2>/dev/null || fail
    ;;
esac
