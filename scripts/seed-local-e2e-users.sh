#!/usr/bin/env bash
# Creates the synthetic *@feazy.test accounts used by the local authenticated journeys.
# LOCAL STACK ONLY: both endpoints are hard-coded to 127.0.0.1 and the script refuses to run otherwise.
# Requires the Supabase CLI local stack (`supabase start`) and E2E_LOCAL_PASSWORD in the environment.
# Prints the inspector account id, which the inspection journey reads as E2E_INSPECTOR_ID.
set -euo pipefail

: "${E2E_LOCAL_PASSWORD:?Set E2E_LOCAL_PASSWORD to the synthetic local password}"

API_URL="http://127.0.0.1:54321"
DB_URL="${DB_URL:?Set DB_URL to the local Supabase database URL (run: supabase status)}"

SERVICE_ROLE_KEY="$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')"
if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "Could not read SERVICE_ROLE_KEY from 'supabase status'. Is the local stack running?" >&2
  exit 1
fi

# Creates one confirmed account and prints its id. An existing account is looked up and its password reset,
# so the password in E2E_LOCAL_PASSWORD always matches the local accounts.
ensure_user() {
  local email="$1"
  local body http_code id
  body="$(mktemp)"
  http_code="$(curl -s -o "$body" -w '%{http_code}' -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    -d "$(printf '{"email":"%s","password":"%s","email_confirm":true}' "$email" "$E2E_LOCAL_PASSWORD")")"
  if [ "$http_code" = "200" ]; then
    id="$(sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' "$body" | head -1)"
  else
    id="$(psql "$DB_URL" -Atc "select id from auth.users where email = '$email'")"
    if [ -n "$id" ]; then
      curl -s -o /dev/null -X PUT "$API_URL/auth/v1/admin/users/$id" \
        -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
        -H 'Content-Type: application/json' \
        -d "$(printf '{"password":"%s"}' "$E2E_LOCAL_PASSWORD")"
    fi
  fi
  rm -f "$body"
  if [ -z "$id" ]; then
    echo "Could not create or find $email (HTTP $http_code)" >&2
    exit 1
  fi
  echo "$id"
}

CUSTOMER_ID="$(ensure_user customer@feazy.test)"
ADMIN_ID="$(ensure_user admin@feazy.test)"
PRO_ID="$(ensure_user pro@feazy.test)"
INSPECTOR_ID="$(ensure_user inspector@feazy.test)"
STRANGER_ID="$(ensure_user stranger@feazy.test)"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
INSERT INTO public.profiles (id, role) VALUES
  ('$CUSTOMER_ID', 'customer'), ('$STRANGER_ID', 'customer'), ('$INSPECTOR_ID', 'professional'),
  ('$ADMIN_ID', 'admin'), ('$PRO_ID', 'professional')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available)
  VALUES ('$PRO_ID', 'Synthetic pro', 'verified', true)
ON CONFLICT (user_id) DO UPDATE SET verification_status = 'verified', is_available = true;
-- The synthetic pro is available every day, 08:00-20:00, so the wizard offers slots for the journey.
INSERT INTO public.professional_availability (professional_id, day_of_week, start_time, end_time, is_active)
  SELECT '$PRO_ID', d, time '08:00', time '20:00', true FROM generate_series(0, 6) AS d
  WHERE NOT EXISTS (SELECT 1 FROM public.professional_availability WHERE professional_id = '$PRO_ID');
-- Each journey run books a fresh inspection. An open one left by a previous run would trip the duplicate guard (P0005),
-- so the synthetic customer's open bookings are cancelled. Only this local synthetic account is touched.
UPDATE public.bookings SET booking_status = 'cancelled', updated_at = now()
  WHERE customer_id = '$CUSTOMER_ID' AND booking_status NOT IN ('cancelled', 'completed');
-- A job left active on a cancelled booking still blocks its professional (the 2-hour conflict rule in matching),
-- so those jobs are cancelled too, for the same synthetic customer only.
UPDATE public.jobs SET current_state = 'cancelled', updated_at = now()
  WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_id = '$CUSTOMER_ID')
    AND current_state NOT IN ('cancelled', 'completed', 'closed');
-- The synthetic pro covers the synthetic customer's city and the journey's service, so matching can offer the repair.
INSERT INTO public.professional_service_areas (professional_id, city, area, is_active)
  SELECT '$PRO_ID', 'Bengaluru', 'Synthetic area', true
  WHERE NOT EXISTS (SELECT 1 FROM public.professional_service_areas WHERE professional_id = '$PRO_ID');
-- Skills are seeded once the catalogue exists, so they are added after it below.
-- LOCAL ONLY: repeated journey runs book several times an hour, so the local booking rate limit is raised.
UPDATE public.matching_config SET value = 100 WHERE key = 'booking_rate_limit_per_hour';
-- LOCAL ONLY: the journey exercises the free-inspection path, so the local stack turns it on.
-- Production configuration is never read or written by this script.
UPDATE public.matching_config SET value = 1 WHERE key = 'free_inspection_enabled';
-- LOCAL ONLY: with the inspection gate on, a visit is created for each inspection booking and needs an active inspector.
-- The admin journey registers the same inspector through the UI; this row lets the first booking go through.
UPDATE public.matching_config SET value = 1 WHERE key = 'inspection_gate_enabled';
INSERT INTO public.inspectors (user_id, display_name, phone, is_active, created_by)
  VALUES ('$INSPECTOR_ID', 'Ravi Inspector', '9000000001', true, '$ADMIN_ID')
ON CONFLICT (user_id) DO UPDATE SET is_active = true;
-- The booking wizard needs one property before it offers a time slot.
INSERT INTO public.addresses (customer_id, label, address_line_1, city)
  SELECT '$CUSTOMER_ID', 'Synthetic home', '1 Synthetic Road', 'Bengaluru'
  WHERE NOT EXISTS (SELECT 1 FROM public.properties WHERE owner_customer_id = '$CUSTOMER_ID');
INSERT INTO public.properties (owner_customer_id, name, property_type, address_id)
  SELECT '$CUSTOMER_ID', 'Synthetic flat', 'apartment', a.id FROM public.addresses a
  WHERE a.customer_id = '$CUSTOMER_ID' AND a.label = 'Synthetic home'
    AND NOT EXISTS (SELECT 1 FROM public.properties WHERE owner_customer_id = '$CUSTOMER_ID');
SQL

# The synthetic catalogue (Leak repair, materials) is applied once, only when it is missing.
if [ "$(psql "$DB_URL" -Atc "select count(*) from public.services where slug = 'leak-repair'")" = "0" ]; then
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/../supabase/seeds/local_synthetic_catalogue.sql"
fi

# The synthetic pro is skilled in the journey's service, which needs the catalogue above.
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
INSERT INTO public.professional_skills (professional_id, service_category_id, service_id, skill_level, verified)
  SELECT '$PRO_ID', s.category_id, s.id, 'expert', true FROM public.services s WHERE s.slug = 'leak-repair'
  AND NOT EXISTS (SELECT 1 FROM public.professional_skills WHERE professional_id = '$PRO_ID' AND service_id = s.id);
SQL

echo "E2E_INSPECTOR_ID=$INSPECTOR_ID"
