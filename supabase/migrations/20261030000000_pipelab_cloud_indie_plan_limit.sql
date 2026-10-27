-- Indie is the production Polar product for the approved Basic allowance.
-- Preserve any plan limit an operator has already configured.
insert into public.pipelab_cloud_plan_limits (
  product_id,
  tier_name,
  quota_bytes,
  history_retention_days,
  enabled
)
values (
  '4f3a3e6f-5195-4583-9488-e06108ac7547',
  'Basic',
  1073741824,
  30,
  true
)
on conflict (product_id) do nothing;
