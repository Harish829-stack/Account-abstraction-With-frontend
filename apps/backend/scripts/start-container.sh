#!/bin/sh
set -eu

attempt=1
max_attempts=10

until npx prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Database migrations failed after $max_attempts attempts; refusing to start the API." >&2
    exit 1
  fi

  echo "Database is not ready; retrying migrations in 3 seconds ($attempt/$max_attempts)." >&2
  attempt=$((attempt + 1))
  sleep 3
done

# Bootstrap mode creates missing chain/contract rows but does not overwrite
# configuration that an administrator has already changed.
PRISMA_SEED_MODE=bootstrap npx prisma db seed

exec npm run start:prod
