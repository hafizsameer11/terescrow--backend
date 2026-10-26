#!/bin/bash
cd /var/www/tercescrow-v2
export DOTENV_CONFIG_PATH=/var/www/tercescrow-v2/.env.strict
exec node -r dotenv/config dist/index.js
