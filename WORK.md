# xread Worker — Terraform IaC

## Status: ✅ Complete

## What was done

1. **Cloned + inspected repo** — existing Terraform in `terraform/` manages obsidian-redirect worker, KV namespace, and route. State is local.

2. **Added worker source** — copied `workers/xread/index.js` from `artifacts/xread-worker/index.js`

3. **Added Terraform resources** in `terraform/main.tf`:
   - `cloudflare_workers_script.xread` — points to `workers/xread/index.js`
   - `cloudflare_workers_route.xread_gisk0_dev` — pattern `xread.gisk0.dev/*`
   - Added `xread_url` output

4. **Verified** — `tofu plan` shows 2 resources to add, 0 existing resources changed ✅

5. **Committed + PR opened** — <https://github.com/gisk0/cloudflare-workers/pull/6>

## Notes

- The xread worker was deployed manually before; Terraform will recreate it on apply (content-identical, just under IaC control now)
- `publish_token` var must be passed via `TF_VAR_publish_token` — not in tfvars. Use `pass obsidian-redirect/publish-token`
- `chapati23` was already a collaborator — no action needed
