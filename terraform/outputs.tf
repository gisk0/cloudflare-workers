output "worker_url" {
  description = "Public URL for the worker"
  value       = "https://obs.gisk0.dev"
}

output "kv_namespace_id" {
  description = "KV namespace ID for PUBLISHED_NOTES"
  value       = cloudflare_workers_kv_namespace.published_notes.id
}

output "share_base_url" {
  description = "Base URL for shared notes"
  value       = "https://obs.gisk0.dev/s/<slug>"
}

output "xread_url" {
  description = "Public URL for the xread worker"
  value       = "https://xread.gisk0.dev"
}
