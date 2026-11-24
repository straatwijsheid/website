# Contribution form Worker

Receives submissions from the form on https://straatwijsheid.nl/meedoen/ and opens a public issue in
`straatwijsheid/knowledge` labelled `from-form`. The optional email is kept in Workers KV under `email:<issue number>`
and expires after 90 days; it is never put in the issue. Design: website#3.

    cd worker && node --test test/        # unit tests, no network or Cloudflare account needed

## Deploy (once, from your machine)

    cd worker && npm install
    npx wrangler login
    npx wrangler kv namespace create EMAILS      # paste the id into wrangler.toml
    npx wrangler secret put GH_TOKEN             # fine-grained token: knowledge only, Issues: Read and write
    npx wrangler secret put TURNSTILE_SECRET     # from the Turnstile site (see below)
    npx wrangler deploy                          # prints https://straatwijsheid-form.<account>.workers.dev

Then set two **variables** (not secrets) in the website repository, Settings, Secrets and variables, Actions:
`PUBLIC_FORM_URL` (the Worker address plus `/submit`) and `PUBLIC_TURNSTILE_SITEKEY` (the Turnstile site key), and re-run the deploy.

Turnstile: Cloudflare dashboard, Turnstile, Add widget, hostname `straatwijsheid.nl`, mode Managed.

## Deleting someone's email

    npx wrangler kv key delete --binding EMAILS "email:<issue number>"

## Optional later

A rate-limit binding named `LIMITER` is used when present (see Cloudflare's rate limiting binding); Turnstile is the main defence.
