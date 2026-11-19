#!/usr/bin/env bash
# Short-lived admin session for automation (Claude), so admin API tasks do not
# need Marcel's password. Access comes from the Cloudflare login wrangler
# already holds: the session is a KV record that expires on its own.
#
#   token=$(tools/admin-session.sh open)      # 1-hour session, prints the token
#   curl -H "Authorization: Bearer $token" https://api.marcelconde.com.br/...
#   tools/admin-session.sh close "$token"     # delete it when done
#
# The token is never stored; audit logs show "Claude (automação)".
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  open)
    token="auto_$(openssl rand -hex 24)"
    now=$(date +%s)
    value=$(printf '{"email":"contato@marcelconde.com.br","name":"Claude (automação)","role":"admin","createdAt":"%s","expiresAt":%s}' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(( (now + 3600) * 1000 ))")
    npx -y wrangler kv key put --binding LIKES_KV --remote --ttl 3600 "admin_session:$token" "$value" >/dev/null 2>&1
    echo "$token"
    ;;
  close)
    [ -n "${2:-}" ] || { echo "uso: $0 close <token>" >&2; exit 1; }
    npx -y wrangler kv key delete --binding LIKES_KV --remote "admin_session:$2" >/dev/null 2>&1
    echo "sessão encerrada"
    ;;
  *)
    echo "uso: $0 open | close <token>" >&2
    exit 1
    ;;
esac
