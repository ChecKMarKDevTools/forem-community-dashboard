#!/bin/bash
# deploy.sh — Build and deploy forem-community-dashboard to Cloud Run.
#
# Usage:
#   ./deploy.sh                  # deploy with ENVIRONMENT=production (default)
#   ENVIRONMENT=staging ./deploy.sh
#
# Prerequisites:
#   - gcloud CLI authenticated and configured for the checkmarkdevtools project
#   - .env file present with all required variables (see .env.example)
#   - Secret Manager API enabled (this script enables it automatically)
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SERVICE_NAME="forem-community-dashboard"
REGION="us-east1"
PORT="3000"
# ENVIRONMENT drives Cloud Run labels and Docker image tags.
# Override via: ENVIRONMENT=staging ./deploy.sh
ENVIRONMENT="${ENVIRONMENT:-production}"
# The canonical custom domain for this service.  Used as a static CORS origin
# and for optional Cloud Run domain mapping.  Set CUSTOM_DOMAIN="" to skip.
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-dev-signal.checkmarkdevtools.dev}"
STATIC_CORS_ORIGIN="https://$CUSTOM_DOMAIN"
# This project MUST be active before deploying.
EXPECTED_PROJECT="checkmarkdevtools"
SEPARATOR="=================================================="

# ── Dependency checks ─────────────────────────────────────────────────────────
if ! command -v gcloud &>/dev/null; then
  echo "Error: gcloud CLI is not installed." >&2
  echo "Install it from https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi

# ── Project validation ────────────────────────────────────────────────────────
PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: No active gcloud project." >&2
  echo "Run: gcloud config set project $EXPECTED_PROJECT" >&2
  exit 1
fi

if [[ "$PROJECT_ID" != "$EXPECTED_PROJECT" ]]; then
  echo "Error: Active project is '$PROJECT_ID', but this script requires '$EXPECTED_PROJECT'." >&2
  echo "Run: gcloud config set project $EXPECTED_PROJECT" >&2
  exit 1
fi

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "$SEPARATOR"
echo "DEPLOYMENT CONFIGURATION"
echo "$SEPARATOR"
echo "Project:     $PROJECT_ID ($PROJECT_NUMBER)"
echo "Region:      $REGION"
echo "Service:     $SERVICE_NAME"
echo "Environment: $ENVIRONMENT"
echo "$SEPARATOR"

# ── Load .env ─────────────────────────────────────────────────────────────────
if [[ -f ".env" ]]; then
  set -a
  # shellcheck source=.env disable=SC1091
  . ".env"
  set +a
else
  echo "Warning: .env not found. Ensure all required variables are exported." >&2
fi

# ── Env validation ────────────────────────────────────────────────────────────
require_env() {
  local name=$1
  if [[ -z "${!name:-}" ]]; then
    echo "" >&2
    echo "Error: Required variable '$name' is missing or empty." >&2
    echo "Add it to .env (see .env.example for reference) or export it before running." >&2
    exit 1
  fi
}

require_env "NEXT_PUBLIC_SUPABASE_URL"
require_env "SUPABASE_SECRET_KEY"
require_env "CRON_SECRET"

# ── Enable required APIs ──────────────────────────────────────────────────────
echo ""
echo "Enabling required Google Cloud APIs..."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT_ID" --quiet

# ── Secret Manager helpers ────────────────────────────────────────────────────
# Secrets are stored in Secret Manager so they never appear in Cloud Run env
# var listings or gcloud command history. Only the secret reference is visible.

upsert_secret() {
  local secret_name=$1
  local secret_value=$2
  if gcloud secrets describe "$secret_name" --project "$PROJECT_ID" --quiet &>/dev/null; then
    printf '%s' "$secret_value" |
      gcloud secrets versions add "$secret_name" \
        --data-file=- --project "$PROJECT_ID" --quiet
    echo "  Updated secret: $secret_name"
  else
    printf '%s' "$secret_value" |
      gcloud secrets create "$secret_name" \
        --data-file=- \
        --replication-policy=automatic \
        --project "$PROJECT_ID" --quiet
    echo "  Created secret: $secret_name"
  fi
}

grant_secret_access() {
  local secret_name=$1
  local member=$2
  gcloud secrets add-iam-policy-binding "$secret_name" \
    --member="$member" \
    --role="roles/secretmanager.secretAccessor" \
    --project "$PROJECT_ID" --quiet >/dev/null
}

# ── Provision secrets ─────────────────────────────────────────────────────────
echo ""
echo "--- Provisioning secrets in Secret Manager ---"
upsert_secret "supabase-secret-key" "$SUPABASE_SECRET_KEY"
upsert_secret "cron-secret" "$CRON_SECRET"

# ── Artifact Registry ─────────────────────────────────────────────────────────
if ! gcloud artifacts repositories describe "$SERVICE_NAME" \
  --location="$REGION" --project "$PROJECT_ID" --quiet &>/dev/null; then
  echo ""
  echo "Creating Artifact Registry repository: $SERVICE_NAME..."
  gcloud artifacts repositories create "$SERVICE_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --project "$PROJECT_ID" \
    --description="Docker repository for $SERVICE_NAME"
fi

# Image is tagged with the environment name so production and staging images
# are kept separate in the same registry.
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$SERVICE_NAME/$SERVICE_NAME:$ENVIRONMENT"

echo ""
echo "--- Building Docker image ---"
echo "Image: $IMAGE_URI"
gcloud builds submit --tag "$IMAGE_URI" . --project "$PROJECT_ID"

# ── Resolve CORS origins ──────────────────────────────────────────────────────
# If the service already exists, include its URL in ALLOWED_ORIGINS so the
# first-deploy CORS config covers the subdomain and any previous URL.
EXISTING_URL=$(
  gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" --project="$PROJECT_ID" \
    --format='value(status.url)' 2>/dev/null || true
)

if [[ -n "$EXISTING_URL" ]]; then
  ALLOWED_ORIGINS="$EXISTING_URL,$STATIC_CORS_ORIGIN"
else
  # First deploy: include only the static subdomain; the script will update
  # ALLOWED_ORIGINS with the Cloud Run URL immediately after deploy.
  ALLOWED_ORIGINS="$STATIC_CORS_ORIGIN"
fi

# ── Service account ───────────────────────────────────────────────────────────
# Cloud Run uses the Compute Engine default SA unless a custom one is specified.
# We grant it Secret Manager accessor on our two secrets.
DEFAULT_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
SA_MEMBER="serviceAccount:$DEFAULT_SA"

echo ""
echo "--- Granting Secret Manager access to $DEFAULT_SA ---"
grant_secret_access "supabase-secret-key" "$SA_MEMBER"
grant_secret_access "cron-secret" "$SA_MEMBER"

# ── Deploy to Cloud Run ───────────────────────────────────────────────────────
echo ""
echo "--- Deploying $SERVICE_NAME to Cloud Run ---"
echo "Environment label: env=$ENVIRONMENT"
echo "CORS origins: $ALLOWED_ORIGINS"

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --port "$PORT" \
  --labels "env=$ENVIRONMENT" \
  --set-env-vars "^|^NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL|ALLOWED_ORIGINS=$ALLOWED_ORIGINS" \
  --set-secrets "SUPABASE_SECRET_KEY=supabase-secret-key:latest,CRON_SECRET=cron-secret:latest"

# ── Post-deploy: update CORS with the actual Cloud Run URL ────────────────────
# On first deploy the URL wasn't known in advance, so we update env vars now.
DEPLOYED_URL=$(
  gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" --project="$PROJECT_ID" \
    --format='value(status.url)'
)

if [[ -z "$EXISTING_URL" || "$DEPLOYED_URL" != "$EXISTING_URL" ]]; then
  ALLOWED_ORIGINS="$DEPLOYED_URL,$STATIC_CORS_ORIGIN"
  echo ""
  echo "Updating ALLOWED_ORIGINS with Cloud Run URL: $DEPLOYED_URL"
  gcloud run services update "$SERVICE_NAME" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --update-env-vars "^|^ALLOWED_ORIGINS=$ALLOWED_ORIGINS"
fi

# ── Custom domain mapping (optional) ─────────────────────────────────────────
# Maps CUSTOM_DOMAIN to this Cloud Run service so the canonical URL resolves.
# Requires the domain to be verified in Google Search Console first:
#   https://search.google.com/search-console
# Skip by setting CUSTOM_DOMAIN="" in .env or the environment.
if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
  echo ""
  echo "--- Custom domain mapping: $CUSTOM_DOMAIN ---"
  if gcloud run domain-mappings describe "$CUSTOM_DOMAIN" \
    --region="$REGION" --project="$PROJECT_ID" --quiet &>/dev/null 2>&1; then
    echo "Domain mapping already exists for $CUSTOM_DOMAIN"
  else
    if gcloud run domain-mappings create \
      --service="$SERVICE_NAME" \
      --domain="$CUSTOM_DOMAIN" \
      --region="$REGION" \
      --project="$PROJECT_ID" --quiet 2>/dev/null; then
      echo "Domain mapping created.  Add these DNS records at your registrar:"
      gcloud run domain-mappings describe "$CUSTOM_DOMAIN" \
        --region="$REGION" --project="$PROJECT_ID" \
        --format='table[box](spec.resourceRecords[].type,spec.resourceRecords[].name,spec.resourceRecords[].rrdata)' \
        2>/dev/null || true
    else
      echo "Warning: domain mapping failed (domain may not be verified in Search Console)." >&2
      echo "  Verify ownership at https://search.google.com/search-console" >&2
      echo "  then re-run this script, or create the mapping manually in the GCP console." >&2
    fi
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "$SEPARATOR"
echo "DEPLOYMENT COMPLETE"
echo "$SEPARATOR"
echo "Service URL:    $DEPLOYED_URL"
echo "Custom domain:  ${CUSTOM_DOMAIN:-(none)}"
echo "Environment:    $ENVIRONMENT"
echo "CORS origins:   $ALLOWED_ORIGINS"
echo ""
echo "Next steps:"
echo "  • Set APP_URL=$DEPLOYED_URL in GitHub repo variables for cron job"
if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
  echo "  • Verify DNS propagation: curl -I https://$CUSTOM_DOMAIN/api/posts"
fi
echo "  • Verify GCP URL: curl -I $DEPLOYED_URL/api/posts"
echo "$SEPARATOR"
