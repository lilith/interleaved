# Deploy Interleaved to Railway

Complete CLI-based deployment. No web dashboard clicking required.

## Prerequisites

- [Railway CLI](https://docs.railway.com/guides/cli): `npm i -g @railway/cli`
- [GitHub CLI](https://cli.github.com/): `gh` (for GitHub App creation)
- A Railway account: `railway login`

## 1. Create the Railway project

```bash
railway login
railway init --name interleaved
```

## 2. Add PostgreSQL

```bash
railway add --plugin postgresql
```

Railway automatically sets `DATABASE_URL` for the linked service.

## 3. Generate secrets

```bash
AUTH_SECRET=$(openssl rand -base64 32)
CRYPTO=$(openssl rand -base64 32)
WEBHOOK_SECRET=$(openssl rand -base64 32)

echo "BETTER_AUTH_SECRET=$AUTH_SECRET"
echo "CRYPTO_KEY=$CRYPTO"
echo "GITHUB_APP_WEBHOOK_SECRET=$WEBHOOK_SECRET"
```

Save these — you'll need them in step 5.

## 4. Create the GitHub App

The setup script creates a GitHub App interactively. You need your Railway domain first:

```bash
# Get your Railway deployment URL (after first deploy, or set a custom domain)
# For initial setup, use a placeholder — you'll update the webhook URL after deploy
railway domain
```

Then run the setup helper:

```bash
npm run setup:github-app -- \
  --base-url https://YOUR-RAILWAY-DOMAIN.up.railway.app \
  --app-name "Interleaved" \
  --env .env.railway
```

This opens GitHub in your browser to create the app. After creation, `.env.railway` contains the GitHub App credentials.

## 5. Set environment variables

```bash
# Core secrets
railway variables set BETTER_AUTH_SECRET="$AUTH_SECRET"
railway variables set CRYPTO_KEY="$CRYPTO"

# GitHub App (from .env.railway created in step 4)
railway variables set GITHUB_APP_ID="$(grep GITHUB_APP_ID .env.railway | cut -d= -f2-)"
railway variables set GITHUB_APP_NAME="$(grep GITHUB_APP_NAME .env.railway | cut -d= -f2-)"
railway variables set GITHUB_APP_CLIENT_ID="$(grep GITHUB_APP_CLIENT_ID .env.railway | cut -d= -f2-)"
railway variables set GITHUB_APP_CLIENT_SECRET="$(grep GITHUB_APP_CLIENT_SECRET .env.railway | cut -d= -f2-)"
railway variables set GITHUB_APP_WEBHOOK_SECRET="$WEBHOOK_SECRET"

# The private key needs special handling (multiline)
railway variables set GITHUB_APP_PRIVATE_KEY="$(grep -A 100 GITHUB_APP_PRIVATE_KEY .env.railway | sed '1s/.*=//' | tr -d '"')"

# Email — pick one provider:

# Option A: Postmark (recommended)
railway variables set EMAIL_PROVIDER=postmark
railway variables set POSTMARK_SERVER_TOKEN="your-server-token"
railway variables set EMAIL_FROM="Interleaved <noreply@yourdomain.com>"

# Option B: Resend
railway variables set EMAIL_PROVIDER=resend
railway variables set RESEND_API_KEY="re_xxxxx"
railway variables set EMAIL_FROM="Interleaved <noreply@yourdomain.com>"

# Option C: SMTP (any provider)
railway variables set EMAIL_PROVIDER=smtp
railway variables set SMTP_HOST="smtp.example.com"
railway variables set SMTP_PORT=587
railway variables set SMTP_USER="user"
railway variables set SMTP_PASSWORD="pass"
railway variables set EMAIL_FROM="Interleaved <noreply@yourdomain.com>"
```

### Optional: Sentry error tracking

```bash
railway variables set SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"
railway variables set NEXT_PUBLIC_SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"
```

### Optional: External media storage (R2/S3)

```bash
railway variables set MEDIA_S3_BUCKET="my-media"
railway variables set MEDIA_S3_REGION="auto"
railway variables set MEDIA_S3_ENDPOINT="https://xxx.r2.cloudflarestorage.com"
railway variables set MEDIA_S3_ACCESS_KEY_ID="xxx"
railway variables set MEDIA_S3_SECRET_ACCESS_KEY="xxx"
railway variables set MEDIA_PUBLIC_URL="https://cdn.yourdomain.com"
```

### Optional: Rate limiting

```bash
# Defaults: 120 requests per 60 seconds per IP
railway variables set RATE_LIMIT_MAX=120
railway variables set RATE_LIMIT_WINDOW_MS=60000
```

## 6. Deploy

```bash
railway up
```

Railway detects the Next.js app, runs `npm run build` (which includes database migrations via `postbuild`), then starts with `npm start`.

First deploy takes 2-3 minutes. Subsequent deploys are faster.

## 7. Verify

```bash
railway open
```

Or check the health endpoint:

```bash
curl https://YOUR-DOMAIN.up.railway.app/api/app/version
```

## 8. Custom domain

```bash
# Add a custom domain
railway domain --set admin.yourdomain.com
```

Then add a CNAME record in your DNS:

```
admin.yourdomain.com → YOUR-PROJECT.up.railway.app
```

Railway handles SSL automatically.

After adding the custom domain, update the GitHub App's callback URLs:

1. Go to `https://github.com/settings/apps/YOUR-APP-NAME`
2. Update "Homepage URL" to `https://admin.yourdomain.com`
3. Update "Callback URL" to `https://admin.yourdomain.com/api/auth/callback/github`
4. Update "Webhook URL" to `https://admin.yourdomain.com/api/webhook/github`

Optionally set `BASE_URL`:

```bash
railway variables set BASE_URL="https://admin.yourdomain.com"
```

## 9. Install the GitHub App on repositories

1. Go to `https://github.com/apps/YOUR-APP-NAME`
2. Click "Install"
3. Choose which repositories to give access to
4. Users can install it on their own repos too

## Updating

```bash
git pull
railway up
```

Migrations run automatically on deploy.

## Troubleshooting

**Build fails:** Check `railway logs`. Most common: missing environment variable.

**GitHub login fails:** Verify `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET`. Check that the callback URL matches your domain exactly.

**Webhooks not working:** Verify `GITHUB_APP_WEBHOOK_SECRET` matches what's configured in the GitHub App settings. Check `railway logs` for webhook errors.

**Email not sending:** Run `railway logs` and search for "email" errors. Verify your email provider credentials. For Postmark, ensure the "From" address is verified in your Postmark account.

**Database issues:** Railway PostgreSQL is automatically connected. If you need to reset:
```bash
railway connect postgresql
# Then: DROP SCHEMA public CASCADE; CREATE SCHEMA public;
# Redeploy to re-run migrations
railway up
```
