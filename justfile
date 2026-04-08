# Interleaved development & operations

svc := "31473602-fe58-4e39-b82d-fd357cb24057"

# Check deploy status
status:
    @railway service status --all --json 2>&1 | python3 -c "import sys,json; [print(f\"{s['node']['name']:15} {s['node'].get('status','?'):10}\") for s in json.load(sys.stdin)] if False else None" 2>/dev/null || true
    @railway service status --all --json 2>&1 | python3 -c "import sys,json;d=json.load(sys.stdin);[print(f'{s[\"name\"]:15} {s[\"status\"]:12} {s[\"deploymentId\"][:8]}') for s in d]"

# Tail prod logs (last 50 lines)
logs:
    @railway logs 2>&1 | tail -50

# Show only errors from prod logs
errors:
    @railway logs 2>&1 | grep -iE "error|ERRO|500|fail|crash|Cannot|undefined" | tail -30

# Show client errors reported via /api/client-error
client-errors:
    @railway logs 2>&1 | grep -A5 "\[CLIENT ERROR\]" | tail -30

# Show auth/token errors
auth-errors:
    @railway logs 2>&1 | grep -iE "auth|credential|token|expired|session|401|403" | tail -20

# Wait for current deploy to finish, show result
wait-deploy:
    @echo "Waiting for deploy..."
    @while true; do \
        STATUS=$$(railway service status --all --json 2>&1 | python3 -c "import sys,json;d=json.load(sys.stdin);s=[x for x in d if x['name']=='interleaved'][0];print(s['status'])"); \
        if [ "$$STATUS" = "SUCCESS" ]; then echo "✓ Deploy succeeded"; break; fi; \
        if [ "$$STATUS" = "FAILED" ]; then echo "✗ Deploy FAILED"; railway logs 2>&1 | grep -iE "error|ERRO|fail" | tail -10; break; fi; \
        echo "  $$STATUS..."; \
        sleep 15; \
    done

# Health check
health:
    @curl -sf https://interleaved-production.up.railway.app/api/app/version | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'✓ {d[\"repository\"]} v{d[\"latest\"]}')" 2>/dev/null || echo "✗ Health check failed"

# Run tests
test:
    npx playwright test --reporter=line

# Type check
check:
    npx tsc --noEmit

# Full CI locally: check + test
ci: check test

# Push with test gate (for risky changes)
push-safe: ci
    git push origin main

# Push without tests (for docs/config/copy)
push:
    git push origin main

# Push and wait for deploy
deploy: push wait-deploy health

# Push with tests, wait for deploy, check logs
deploy-safe: push-safe wait-deploy health
    @echo "Checking for errors..."
    @sleep 10
    @just errors

# Query the database
db-query query:
    @DB_URL=$$(railway variables --service "bc77938a-1633-414a-af4f-a106d0f1cc7a" --json 2>&1 | python3 -c "import sys,json;print(json.load(sys.stdin)['DATABASE_URL'])") && \
    node --input-type=module -e "import postgres from 'postgres'; const sql=postgres('$$DB_URL'); const r=await sql.unsafe('{{query}}'); console.log(JSON.stringify(r,null,2)); await sql.end();"

# Show account token status (are tokens expired?)
token-status:
    @just db-query "SELECT id, user_id, provider_id, substring(access_token,1,10) as token_pfx, access_token_expires_at, refresh_token IS NOT NULL as has_refresh, refresh_token_expires_at FROM account"

# Nuke all sessions (emergency: forces everyone to re-login)
nuke-sessions:
    @echo "This will sign out ALL users. Press Ctrl+C to cancel."
    @sleep 3
    @just db-query "DELETE FROM session"
    @echo "All sessions deleted. Users will need to sign in again."

# Build the landing site
build-site:
    npx tsx scripts/build-site.ts --src /home/lilith/work/interleaved-site --out /tmp/interleaved-site-build

# Deploy the landing site to Cloudflare Pages
deploy-site: build-site
    cd /home/lilith/work/interleaved/workers && npx wrangler pages deploy /tmp/interleaved-site-build --project-name interleaved-site
