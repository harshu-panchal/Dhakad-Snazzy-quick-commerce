#!/usr/bin/env bash
set -Eeuo pipefail

env_file=/opt/dhakadsnazzy/shared/backend.env
sed -i 's|^SMS_INDIA_HUB_PASSWORD=.*|SMS_INDIA_HUB_PASSWORD="Zoognoo!@#123"|' "$env_file"
chmod 600 "$env_file"
pm2 restart dhakad-backend --update-env
pm2 save
