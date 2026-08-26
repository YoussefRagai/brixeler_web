-- Brixeler current schema baseline
-- Generated from the live PostgreSQL catalog on 2026-08-26. Schema only; no application rows.
-- Apply to a fresh Supabase project instead of replaying the pre-baseline historical migrations.

begin;
set local check_function_bodies = false;
set local search_path = public, extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Enums
create type public.account_status as enum ('active', 'suspended', 'banned');
create type public.admin_role as enum ('super_admin', 'admin', 'reviewer', 'user_auth_admin', 'user_support_admin', 'developers_admin', 'listing_admin', 'deals_admin', 'marketing_admin');
create type public.badge_type as enum ('deal_milestone', 'earnings', 'referrals', 'speed', 'contributions', 'special');
create type public.benefit_type as enum ('none', 'commission_boost', 'priority_support', 'custom');
create type public.deal_stage_type as enum ('EOI', 'CIL', 'Reservation', 'SalesClaim');
create type public.deal_status as enum ('submitted', 'under_review', 'approved', 'negotiating', 'confirmed', 'awaiting_payment', 'paid', 'rejected', 'cancelled');
create type public.finishing_status as enum ('not_finished', 'semi_finished', 'finished', 'furnished', 'flexi_finished');
create type public.notification_type as enum ('deal_status', 'commission_paid', 'property_approved', 'property_rejected', 'referral', 'badge_unlocked', 'admin_message', 'inquiry', 'security_alert');
create type public.property_approval_status as enum ('pending', 'approved', 'rejected', 'expired');
create type public.property_renewal_actor as enum ('agent', 'developer', 'admin');
create type public.property_renewal_request_status as enum ('pending', 'approved', 'rejected', 'auto_expired');
create type public.property_renewal_status as enum ('active', 'expiring', 'awaiting_admin', 'expired');
create type public.property_type as enum ('apartment', 'villa', 'twinhouse', 'townhouse', 'duplex', 'penthouse', 'chalet', 'studio', 'cabin', 'office', 'clinic', 'retail', 'serviced_studio', 'branded_apartment', 'branded_villa', 'luxury_apartment', 'ultra_luxury_apartment', 'ultra_luxury_villa', 'one_story_villa', 'pharmacy', 'serviced_apartment', 'loft');
create type public.referral_behavior_requirement as enum ('none', 'verified', 'first_deal');
create type public.sale_type as enum ('developer_sale', 'resale');
create type public.verification_status as enum ('pending', 'verified', 'rejected');

-- Tables
create table public.admin_activity_log (
  id uuid default extensions.uuid_generate_v4() not null,
  admin_id uuid not null,
  action_type character varying(100) not null,
  entity_type character varying(50),
  entity_id uuid,
  details jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone default now(),
  constraint admin_activity_log_pkey PRIMARY KEY (id));

create table public.admin_rules (
  id uuid default uuid_generate_v4() not null,
  target_type text not null,
  target_id uuid not null,
  metric text not null,
  time_window text not null,
  operator text not null,
  value_min numeric,
  value_max numeric,
  value_single numeric,
  filters jsonb default '{}'::jsonb,
  is_active boolean default true,
  created_by_admin uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint admin_rules_metric_check CHECK (metric = ANY (ARRAY['deals_count'::text, 'deals_volume'::text, 'revenue'::text, 'referrals'::text, 'claim_acceptance'::text, 'listings_count'::text])),
  constraint admin_rules_operator_check CHECK (operator = ANY (ARRAY['>='::text, '<='::text, 'between'::text, 'top_n'::text, 'top_percent'::text])),
  constraint admin_rules_pkey PRIMARY KEY (id),
  constraint admin_rules_target_type_check CHECK (target_type = ANY (ARRAY['tier'::text, 'badge'::text])),
  constraint admin_rules_time_window_check CHECK (time_window = ANY (ARRAY['all_time'::text, 'last_30d'::text, 'last_90d'::text, 'quarter'::text, 'year'::text])));

create table public.admins (
  id uuid not null,
  role admin_role default 'reviewer'::admin_role,
  permissions jsonb default '{}'::jsonb,
  assigned_by uuid,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  roles admin_role[] default '{}'::admin_role[],
  constraint admins_pkey PRIMARY KEY (id));

create table public.agent_badges (
  id uuid default extensions.uuid_generate_v4() not null,
  agent_id uuid not null,
  badge_id uuid not null,
  unlocked_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone,
  constraint agent_badges_agent_id_badge_id_key UNIQUE (agent_id, badge_id),
  constraint agent_badges_pkey PRIMARY KEY (id));

create table public.ai_chat_conversations (
  id uuid default extensions.uuid_generate_v4() not null,
  agent_id uuid not null,
  session_id uuid default extensions.uuid_generate_v4() not null,
  title text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint ai_chat_conversations_pkey PRIMARY KEY (id),
  constraint ai_chat_conversations_session_id_key UNIQUE (session_id));

create table public.ai_chat_messages (
  id uuid default extensions.uuid_generate_v4() not null,
  conversation_id uuid not null,
  role character varying(20) not null,
  content text not null,
  search_results jsonb,
  created_at timestamp with time zone default now(),
  constraint ai_chat_messages_pkey PRIMARY KEY (id),
  constraint valid_role CHECK (role::text = ANY (ARRAY['user'::character varying, 'assistant'::character varying]::text[])));

create table public.areas (
  id uuid default extensions.uuid_generate_v4() not null,
  name character varying(100) not null,
  name_ar character varying(100),
  governorate character varying(100),
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint areas_name_key UNIQUE (name),
  constraint areas_pkey PRIMARY KEY (id));

create table public.badges (
  id uuid default extensions.uuid_generate_v4() not null,
  name character varying(100) not null,
  name_ar character varying(100),
  description text,
  icon_url text not null,
  badge_type badge_type not null,
  unlock_criteria jsonb not null,
  benefit_type benefit_type default 'none'::benefit_type,
  benefit_value numeric(10,2),
  benefit_description text,
  is_active boolean default true,
  display_order integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  expires_in_days integer,
  constraint badges_pkey PRIMARY KEY (id));

create table public.commissions (
  id uuid default extensions.uuid_generate_v4() not null,
  deal_id uuid not null,
  agent_id uuid not null,
  amount numeric(12,2) not null,
  payment_method character varying(50) default 'bank_transfer'::character varying,
  payment_reference character varying(100),
  payment_notes text,
  transfer_receipt_url text,
  paid_at timestamp with time zone not null,
  created_at timestamp with time zone default now(),
  constraint commissions_deal_id_key UNIQUE (deal_id),
  constraint commissions_pkey PRIMARY KEY (id),
  constraint valid_amount CHECK (amount >= 0::numeric));

create table public.deal_stage_entries (
  id uuid default gen_random_uuid() not null,
  agent_id uuid not null,
  stage deal_stage_type not null,
  property_name text not null,
  developer_name text,
  status text default 'Submitted'::text not null,
  attachments text[] default '{}'::text[] not null,
  payload jsonb default '{}'::jsonb,
  source_entry_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  payment_method text default 'bank_transfer'::text not null,
  fast_payment_acknowledged boolean default false not null,
  sales_claim_document text,
  constraint deal_stage_entries_pkey PRIMARY KEY (id));

create table public.deal_status_history (
  id uuid default extensions.uuid_generate_v4() not null,
  deal_id uuid not null,
  status deal_status not null,
  changed_by uuid,
  changed_by_type character varying(20),
  notes text,
  created_at timestamp with time zone default now(),
  constraint deal_status_history_pkey PRIMARY KEY (id));

create table public.deals (
  id uuid default extensions.uuid_generate_v4() not null,
  deal_reference character varying(50) not null,
  agent_id uuid not null,
  property_name character varying(200) not null,
  developer_name character varying(200) not null,
  client_name character varying(100) not null,
  sale_amount numeric(12,2) not null,
  unit_code character varying(50) not null,
  deal_sheet_photos text[] not null,
  ocr_extracted_data jsonb,
  ocr_confidence_scores jsonb,
  additional_documents text[],
  commission_rate numeric(5,2) not null,
  base_rate numeric(5,2) not null,
  referral_bonus numeric(5,2) default 0,
  estimated_commission numeric(12,2) not null,
  actual_commission numeric(12,2),
  status deal_status default 'submitted'::deal_status,
  rejection_reason text,
  cancellation_reason text,
  admin_notes text,
  assigned_to_admin uuid,
  submitted_at timestamp with time zone default now(),
  reviewed_at timestamp with time zone,
  approved_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint deals_deal_reference_key UNIQUE (deal_reference),
  constraint deals_pkey PRIMARY KEY (id),
  constraint valid_commission_rate CHECK (commission_rate >= 0::numeric AND commission_rate <= 10::numeric),
  constraint valid_estimated_commission CHECK (estimated_commission >= 0::numeric),
  constraint valid_sale_amount CHECK (sale_amount >= 100000::numeric));

create table public.developer_accounts (
  id uuid default extensions.uuid_generate_v4() not null,
  developer_id uuid not null,
  auth_user_id uuid not null,
  role character varying(20) default 'member'::character varying,
  last_login timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  email text,
  full_name text,
  status text default 'pending'::text not null,
  invited_at timestamp with time zone default now() not null,
  invitation_sent_at timestamp with time zone default now() not null,
  invited_by_admin_id uuid,
  activated_at timestamp with time zone,
  revoked_at timestamp with time zone,
  constraint developer_accounts_auth_user_id_key UNIQUE (auth_user_id),
  constraint developer_accounts_pkey PRIMARY KEY (id));

create table public.developer_commission_rules (
  id uuid default extensions.uuid_generate_v4() not null,
  developer_id uuid not null,
  property_id uuid,
  commission_rate numeric(5,2) not null,
  platform_share numeric(5,2) default 0,
  valid_from date default now(),
  valid_to date,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint developer_commission_rules_pkey PRIMARY KEY (id),
  constraint valid_dev_commission CHECK (commission_rate >= 0::numeric AND commission_rate <= 10::numeric));

create table public.developer_contact_requests (
  id uuid default gen_random_uuid() not null,
  developer_id uuid not null,
  project_id uuid not null,
  property_id uuid,
  requester_user_id uuid not null,
  request_type text not null,
  status text default 'open'::text not null,
  request_body text not null,
  requester_display_name text not null,
  requester_email text,
  requester_phone text,
  requester_total_deals integer default 0 not null,
  developer_name_snapshot text not null,
  project_name_snapshot text not null,
  property_name_snapshot text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint developer_contact_requests_pkey PRIMARY KEY (id),
  constraint developer_contact_requests_request_type_check CHECK (request_type = ANY (ARRAY['call'::text, 'meeting'::text])),
  constraint developer_contact_requests_status_check CHECK (status = ANY (ARRAY['open'::text, 'contacted'::text, 'closed'::text])));

create table public.developer_impersonation_grants (
  token_hash text not null,
  admin_id uuid not null,
  admin_auth_user_id uuid not null,
  admin_email text,
  admin_name text,
  developer_id uuid not null,
  developer_name text,
  impersonated_user_id uuid not null,
  impersonated_account_id uuid not null,
  issued_at timestamp with time zone not null,
  expires_at timestamp with time zone not null,
  consumed_at timestamp with time zone,
  return_to text,
  created_at timestamp with time zone default now() not null,
  constraint developer_impersonation_grants_pkey PRIMARY KEY (token_hash));

create table public.developer_projects (
  id uuid default extensions.uuid_generate_v4() not null,
  developer_id uuid,
  name text not null,
  description text,
  hero_media jsonb,
  voice_notes text[],
  video_links text[],
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  amenities text[] default '{}'::text[],
  location text,
  acres numeric,
  footprint numeric,
  maintenance numeric,
  payment_plans text,
  ch_fees numeric,
  project_types text[] default '{}'::text[] not null,
  inventory_url text,
  payment_plan_templates jsonb default '[]'::jsonb not null,
  limited_time_offers jsonb default '[]'::jsonb not null,
  launch_status text default 'live'::text not null,
  launch_date date,
  eoi_value_apt numeric(18,2),
  eoi_value_villa numeric(18,2),
  constraint developer_projects_launch_status_check CHECK (launch_status = ANY (ARRAY['live'::text, 'new_launch'::text, 'upcoming'::text])),
  constraint developer_projects_pkey PRIMARY KEY (id));

create table public.developers (
  id uuid default extensions.uuid_generate_v4() not null,
  name character varying(200) not null,
  name_ar character varying(200),
  logo_url text,
  description text,
  contact_email character varying(100),
  contact_phone character varying(20),
  website character varying(200),
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint developers_name_key UNIQUE (name),
  constraint developers_pkey PRIMARY KEY (id));

create table public.export_logs (
  id uuid default extensions.uuid_generate_v4() not null,
  agent_id uuid not null,
  export_type character varying(50) not null,
  file_format character varying(10) not null,
  date_range_start date,
  date_range_end date,
  file_url text not null,
  file_size_bytes bigint,
  expires_at timestamp with time zone default (now() + '24:00:00'::interval),
  created_at timestamp with time zone default now(),
  constraint export_logs_pkey PRIMARY KEY (id));

create table public.gift_claims (
  id uuid default gen_random_uuid() not null,
  gift_id uuid,
  agent_id uuid,
  status text default 'pending'::text not null,
  claimed_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  notes text,
  constraint gift_claims_pkey PRIMARY KEY (id),
  constraint gift_claims_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'fulfilled'::text, 'cancelled'::text])));

create table public.gift_eligibilities (
  id uuid default gen_random_uuid() not null,
  gift_id uuid,
  agent_id uuid,
  status text default 'eligible'::text not null,
  eligible_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint gift_eligibilities_gift_id_agent_id_key UNIQUE (gift_id, agent_id),
  constraint gift_eligibilities_pkey PRIMARY KEY (id),
  constraint gift_eligibilities_status_check CHECK (status = ANY (ARRAY['eligible'::text, 'claimed'::text, 'expired'::text, 'blocked'::text])));

create table public.gift_rules (
  id uuid default gen_random_uuid() not null,
  gift_id uuid,
  metric text not null,
  time_window text not null,
  operator text not null,
  value_single numeric,
  value_min numeric,
  value_max numeric,
  filters jsonb default '{}'::jsonb,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  constraint gift_rules_pkey PRIMARY KEY (id));

create table public.gifts (
  id uuid default gen_random_uuid() not null,
  title text not null,
  title_ar text,
  description text,
  icon_url text,
  is_active boolean default true,
  tier_ids uuid[] default '{}'::uuid[],
  max_concurrent_claims integer,
  exclusivity_mode text default 'none'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint gifts_exclusivity_mode_check CHECK (exclusivity_mode = ANY (ARRAY['none'::text, 'eligible'::text, 'claimed'::text])),
  constraint gifts_pkey PRIMARY KEY (id));

create table public.notification_events (
  id uuid default extensions.uuid_generate_v4() not null,
  agent_id uuid not null,
  channel text not null,
  enabled boolean not null,
  changed_at timestamp with time zone default now() not null,
  constraint notification_events_pkey PRIMARY KEY (id));

create table public.notifications (
  id uuid default extensions.uuid_generate_v4() not null,
  agent_id uuid not null,
  type notification_type not null,
  title character varying(200) not null,
  message text not null,
  related_entity_type character varying(50),
  related_entity_id uuid,
  action_url text,
  is_read boolean default false,
  read_at timestamp with time zone,
  push_sent boolean default false,
  email_sent boolean default false,
  sms_sent boolean default false,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone default (now() + '90 days'::interval),
  constraint notifications_pkey PRIMARY KEY (id));

create table public.phone_verification_rate_limits (
  user_id uuid not null,
  phone text not null,
  window_started_at timestamp with time zone default now() not null,
  attempts integer default 0 not null,
  updated_at timestamp with time zone default now() not null,
  constraint phone_verification_rate_limits_attempts_check CHECK (attempts >= 0),
  constraint phone_verification_rate_limits_pkey PRIMARY KEY (user_id));

create table public.project_favorites (
  id uuid default uuid_generate_v4() not null,
  agent_id uuid not null,
  project_id text not null,
  created_at timestamp with time zone default now() not null,
  constraint project_favorites_agent_id_project_id_key UNIQUE (agent_id, project_id),
  constraint project_favorites_pkey PRIMARY KEY (id));

create table public.project_unit_types (
  id uuid default uuid_generate_v4() not null,
  project_id uuid not null,
  label text not null,
  bedrooms integer,
  bathrooms integer,
  min_price numeric(18,2) not null,
  unit_area_min numeric(12,2),
  unit_area_max numeric(12,2),
  down_payment_percent numeric(5,2),
  installment_years integer,
  finishing_status text,
  stock_count integer,
  description text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  hero_image_url text,
  land_area_min numeric,
  land_area_max numeric,
  category text,
  max_price numeric(18,2),
  constraint project_unit_types_pkey PRIMARY KEY (id),
  constraint project_unit_types_project_id_label_key UNIQUE (project_id, label));

create table public.project_unit_variants (
  id uuid default gen_random_uuid() not null,
  project_unit_type_id uuid not null,
  bedrooms integer,
  bathrooms integer,
  min_price numeric not null,
  unit_area_min numeric,
  unit_area_max numeric,
  down_payment_percent numeric,
  installment_years numeric,
  stock_count integer,
  description text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  amenities text[] default '{}'::text[],
  category text,
  label text,
  max_price numeric(18,2),
  land_area_min numeric(12,2),
  land_area_max numeric(12,2),
  has_garden boolean,
  has_roof boolean,
  finishing_status text,
  delivery_date date,
  layout_options text[],
  garden_area_sqm numeric(12,2),
  roof_area_sqm numeric(12,2),
  constraint project_unit_variants_pkey PRIMARY KEY (id));

create table public.properties (
  id uuid default extensions.uuid_generate_v4() not null,
  listed_by_agent_id uuid,
  property_name character varying(200) not null,
  developer_id uuid,
  area_id uuid,
  specific_location text,
  property_type property_type not null,
  bedrooms integer,
  bathrooms integer,
  unit_area numeric(10,2) not null,
  price numeric(12,2) not null,
  sale_type sale_type default 'developer_sale'::sale_type,
  down_payment_percentage numeric(5,2),
  monthly_installment numeric(10,2),
  installment_years integer,
  finishing_status finishing_status,
  delivery_date date,
  is_delivered boolean default false,
  amenities text[],
  description text not null,
  photos text[] not null,
  cover_photo_url text,
  floor_plan_url text,
  video_tour_url text,
  is_featured boolean default false,
  views_count integer default 0,
  inquiries_count integer default 0,
  approval_status property_approval_status default 'pending'::property_approval_status,
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  project_id uuid,
  published_at timestamp with time zone,
  expires_at timestamp with time zone,
  last_renewed_at timestamp with time zone,
  renewal_status property_renewal_status default 'active'::property_renewal_status,
  renewal_prompted_at timestamp with time zone,
  constraint min_photos CHECK (array_length(photos, 1) >= 3),
  constraint properties_pkey PRIMARY KEY (id),
  constraint valid_bathrooms CHECK (bathrooms >= 0 AND bathrooms <= 20),
  constraint valid_bedrooms CHECK (bedrooms >= 0 AND bedrooms <= 20),
  constraint valid_price CHECK (price >= 100000::numeric),
  constraint valid_unit_area CHECK (unit_area >= 10::numeric));

create table public.property_expiration_events (
  id uuid default uuid_generate_v4() not null,
  property_id uuid not null,
  target_type property_renewal_actor not null,
  target_id uuid,
  event_type text not null,
  message text not null,
  created_at timestamp with time zone default now() not null,
  constraint property_expiration_events_pkey PRIMARY KEY (id));

create table public.property_favorites (
  id uuid default uuid_generate_v4() not null,
  agent_id uuid not null,
  property_id text not null,
  created_at timestamp with time zone default now() not null,
  constraint property_favorites_agent_id_property_id_key UNIQUE (agent_id, property_id),
  constraint property_favorites_pkey PRIMARY KEY (id));

create table public.property_inquiries (
  id uuid default extensions.uuid_generate_v4() not null,
  property_id uuid not null,
  agent_id uuid not null,
  inquirer_name character varying(100) not null,
  inquirer_phone character varying(20),
  inquirer_email character varying(100),
  message text,
  status character varying(20) default 'new'::character varying,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint property_inquiries_pkey PRIMARY KEY (id));

create table public.property_renewal_requests (
  id uuid default uuid_generate_v4() not null,
  property_id uuid not null,
  requested_by_role property_renewal_actor not null,
  requested_by_id uuid,
  status property_renewal_request_status default 'pending'::property_renewal_request_status not null,
  requested_at timestamp with time zone default now() not null,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  notes text,
  constraint property_renewal_requests_pkey PRIMARY KEY (id));

create table public.referral_bonus_rules (
  id uuid default extensions.uuid_generate_v4() not null,
  tier_name character varying(50) not null,
  min_referrals integer not null,
  max_referrals integer,
  bonus_percentage numeric(5,2) not null,
  requires_verification boolean default true,
  requires_first_deal boolean default false,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  behavior_requirement referral_behavior_requirement default 'none'::referral_behavior_requirement,
  constraint referral_bonus_rules_pkey PRIMARY KEY (id),
  constraint valid_bonus_percentage CHECK (bonus_percentage >= 0::numeric AND bonus_percentage <= 5::numeric),
  constraint valid_referral_range CHECK (min_referrals >= 0));

create table public.saved_properties (
  id uuid default extensions.uuid_generate_v4() not null,
  agent_id uuid not null,
  property_id uuid not null,
  notes text,
  created_at timestamp with time zone default now(),
  constraint saved_properties_agent_id_property_id_key UNIQUE (agent_id, property_id),
  constraint saved_properties_pkey PRIMARY KEY (id));

create table public.support_ticket_messages (
  id uuid default gen_random_uuid() not null,
  ticket_id uuid not null,
  author_type text not null,
  author_id uuid,
  message text not null,
  created_at timestamp with time zone default now() not null,
  constraint support_ticket_messages_author_type_check CHECK (author_type = ANY (ARRAY['agent'::text, 'admin'::text, 'system'::text])),
  constraint support_ticket_messages_check CHECK (author_type = 'system'::text AND author_id IS NULL OR (author_type = ANY (ARRAY['agent'::text, 'admin'::text])) AND author_id IS NOT NULL),
  constraint support_ticket_messages_message_check CHECK (char_length(btrim(message)) >= 1 AND char_length(btrim(message)) <= 20000),
  constraint support_ticket_messages_pkey PRIMARY KEY (id));

create table public.support_tickets (
  id uuid default gen_random_uuid() not null,
  agent_id uuid not null,
  subject text not null,
  category text default 'other'::text not null,
  description text default ''::text not null,
  status text default 'new'::text not null,
  priority text default 'normal'::text not null,
  channel text default 'in_app'::text not null,
  last_message_preview text,
  last_message_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint support_tickets_category_check CHECK (category = ANY (ARRAY['verification'::text, 'deal'::text, 'payout'::text, 'technical'::text, 'property'::text, 'property_request'::text, 'other'::text])),
  constraint support_tickets_channel_check CHECK (channel = ANY (ARRAY['in_app'::text, 'email'::text, 'phone'::text, 'whatsapp'::text])),
  constraint support_tickets_description_check CHECK (char_length(description) <= 20000),
  constraint support_tickets_last_message_preview_check CHECK (last_message_preview IS NULL OR char_length(last_message_preview) <= 20000),
  constraint support_tickets_pkey PRIMARY KEY (id),
  constraint support_tickets_priority_check CHECK (priority = ANY (ARRAY['normal'::text, 'high'::text, 'urgent'::text])),
  constraint support_tickets_status_check CHECK (status = ANY (ARRAY['new'::text, 'in_progress'::text, 'waiting_agent'::text, 'resolved'::text, 'closed'::text])),
  constraint support_tickets_subject_check CHECK (char_length(btrim(subject)) >= 1 AND char_length(btrim(subject)) <= 300));

create table public.system_settings (
  key character varying(100) not null,
  value jsonb not null,
  description text,
  updated_by uuid,
  updated_at timestamp with time zone default now(),
  constraint system_settings_pkey PRIMARY KEY (key));

create table public.tasks (
  id uuid default extensions.uuid_generate_v4() not null,
  agent_id uuid not null,
  title text not null,
  description text,
  due_at timestamp with time zone,
  status text default 'open'::text not null,
  task_type text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint tasks_pkey PRIMARY KEY (id));

create table public.tiers (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  level integer not null,
  icon_url text not null,
  description text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  benefit_type text default 'none'::text not null,
  benefit_value numeric,
  benefit_description text,
  constraint tiers_benefit_type_check CHECK (benefit_type = ANY (ARRAY['none'::text, 'commission_boost'::text, 'priority_support'::text, 'custom'::text])),
  constraint tiers_level_key UNIQUE (level),
  constraint tiers_pkey PRIMARY KEY (id));

create table public.user_tiers (
  id uuid default uuid_generate_v4() not null,
  user_id uuid not null,
  tier_id uuid not null,
  awarded_at timestamp with time zone default now(),
  constraint user_tiers_pkey PRIMARY KEY (id),
  constraint user_tiers_user_id_key UNIQUE (user_id));

create table public.users_profile (
  id uuid not null,
  first_name_en character varying(50) not null,
  last_name_en character varying(50) not null,
  first_name_ar character varying(50) not null,
  last_name_ar character varying(50) not null,
  display_name character varying(100),
  phone character varying(20) not null,
  bio text,
  profile_picture_url text,
  verification_status verification_status default 'pending'::verification_status,
  verification_documents_url text[],
  contract_signature_url text,
  verification_rejection_reason text,
  verified_at timestamp with time zone,
  bank_name character varying(100),
  bank_account_holder character varying(100),
  bank_account_number text,
  bank_iban text,
  bank_swift_code character varying(20),
  bank_details_approved boolean default false,
  referral_code character varying(20) not null,
  referred_by uuid,
  total_referrals integer default 0,
  verified_referrals integer default 0,
  base_commission_rate numeric(5,2) default 2.50,
  referral_bonus_rate numeric(5,2) default 0.00,
  total_commission_rate numeric(5,2) generated always as ((base_commission_rate + referral_bonus_rate)) stored,
  account_status account_status default 'active'::account_status,
  account_created_at timestamp with time zone default now(),
  account_expires_at timestamp with time zone,
  last_login_at timestamp with time zone,
  language_preference character varying(2) default 'en'::character varying,
  notification_preferences jsonb default '{"sms": false, "push": true, "email": true, "marketing": false, "deal_updates": true, "badge_updates": true, "property_updates": true, "referral_updates": true}'::jsonb,
  profile_visibility character varying(20) default 'agents_only'::character varying,
  show_earnings_on_profile boolean default false,
  show_deal_count_on_profile boolean default true,
  total_deals integer default 0,
  successful_deals integer default 0,
  total_earnings numeric(12,2) default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  referrals_with_first_deal integer default 0,
  phone_verified boolean default true not null,
  phone_verified_at timestamp with time zone,
  constraint users_profile_phone_key UNIQUE (phone),
  constraint users_profile_pkey PRIMARY KEY (id),
  constraint users_profile_referral_code_key UNIQUE (referral_code),
  constraint valid_commission_rates CHECK (base_commission_rate >= 0::numeric AND base_commission_rate <= 10::numeric AND referral_bonus_rate >= 0::numeric AND referral_bonus_rate <= 5::numeric),
  constraint valid_phone CHECK (phone::text ~ '^\+[0-9]{10,15}$'::text));

-- Foreign keys
alter table public.admin_activity_log add constraint admin_activity_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES admins(id);
alter table public.admin_rules add constraint admin_rules_created_by_admin_fkey FOREIGN KEY (created_by_admin) REFERENCES admins(id);
alter table public.admins add constraint admins_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES admins(id);
alter table public.admins add constraint admins_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.agent_badges add constraint agent_badges_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.agent_badges add constraint agent_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE;
alter table public.ai_chat_conversations add constraint ai_chat_conversations_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.ai_chat_messages add constraint ai_chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES ai_chat_conversations(id) ON DELETE CASCADE;
alter table public.commissions add constraint commissions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE RESTRICT;
alter table public.commissions add constraint commissions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE RESTRICT;
alter table public.deal_stage_entries add constraint deal_stage_entries_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.deal_stage_entries add constraint deal_stage_entries_source_entry_id_fkey FOREIGN KEY (source_entry_id) REFERENCES deal_stage_entries(id) ON DELETE SET NULL;
alter table public.deal_status_history add constraint deal_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);
alter table public.deal_status_history add constraint deal_status_history_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;
alter table public.deals add constraint deals_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE RESTRICT;
alter table public.deals add constraint deals_assigned_to_admin_fkey FOREIGN KEY (assigned_to_admin) REFERENCES auth.users(id);
alter table public.developer_accounts add constraint developer_accounts_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.developer_accounts add constraint developer_accounts_developer_id_fkey FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE;
alter table public.developer_commission_rules add constraint developer_commission_rules_developer_id_fkey FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE;
alter table public.developer_commission_rules add constraint developer_commission_rules_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
alter table public.developer_contact_requests add constraint developer_contact_requests_developer_id_fkey FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE;
alter table public.developer_contact_requests add constraint developer_contact_requests_project_id_fkey FOREIGN KEY (project_id) REFERENCES developer_projects(id) ON DELETE CASCADE;
alter table public.developer_contact_requests add constraint developer_contact_requests_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
alter table public.developer_contact_requests add constraint developer_contact_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.developer_projects add constraint developer_projects_developer_id_fkey FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE;
alter table public.export_logs add constraint export_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.gift_claims add constraint gift_claims_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.gift_claims add constraint gift_claims_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE CASCADE;
alter table public.gift_eligibilities add constraint gift_eligibilities_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.gift_eligibilities add constraint gift_eligibilities_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE CASCADE;
alter table public.gift_rules add constraint gift_rules_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE CASCADE;
alter table public.notification_events add constraint notification_events_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id);
alter table public.notifications add constraint notifications_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.phone_verification_rate_limits add constraint phone_verification_rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.project_favorites add constraint project_favorites_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.project_unit_types add constraint project_unit_types_project_id_fkey FOREIGN KEY (project_id) REFERENCES developer_projects(id) ON DELETE CASCADE;
alter table public.project_unit_variants add constraint project_unit_variants_project_unit_type_id_fkey FOREIGN KEY (project_unit_type_id) REFERENCES project_unit_types(id) ON DELETE CASCADE;
alter table public.properties add constraint properties_area_id_fkey FOREIGN KEY (area_id) REFERENCES areas(id);
alter table public.properties add constraint properties_developer_id_fkey FOREIGN KEY (developer_id) REFERENCES developers(id);
alter table public.properties add constraint properties_listed_by_agent_id_fkey FOREIGN KEY (listed_by_agent_id) REFERENCES users_profile(id) ON DELETE SET NULL;
alter table public.properties add constraint properties_project_id_fkey FOREIGN KEY (project_id) REFERENCES developer_projects(id);
alter table public.properties add constraint properties_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
alter table public.property_expiration_events add constraint property_expiration_events_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
alter table public.property_favorites add constraint property_favorites_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.property_inquiries add constraint property_inquiries_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.property_inquiries add constraint property_inquiries_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
alter table public.property_renewal_requests add constraint property_renewal_requests_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
alter table public.property_renewal_requests add constraint property_renewal_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES admins(id);
alter table public.saved_properties add constraint saved_properties_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.saved_properties add constraint saved_properties_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
alter table public.support_ticket_messages add constraint support_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
alter table public.support_tickets add constraint support_tickets_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.system_settings add constraint system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES admins(id);
alter table public.tasks add constraint tasks_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.user_tiers add constraint user_tiers_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES tiers(id) ON DELETE CASCADE;
alter table public.user_tiers add constraint user_tiers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users_profile(id) ON DELETE CASCADE;
alter table public.users_profile add constraint users_profile_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.users_profile add constraint users_profile_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES users_profile(id);

-- Functions
CREATE OR REPLACE FUNCTION public.agent_current_tier_level(p_agent_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select t.level
  from user_tiers ut
  join tiers t on t.id = ut.tier_id
  where ut.user_id = p_agent_id
  limit 1;
$function$;


CREATE OR REPLACE FUNCTION public.consume_phone_verification_attempt(p_user_id uuid, p_phone text, p_limit integer DEFAULT 3, p_window_seconds integer DEFAULT 600)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  current_row public.phone_verification_rate_limits%rowtype;
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if jwt_role <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_user_id is null or p_phone is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit parameters';
  end if;
  select * into current_row
  from public.phone_verification_rate_limits
  where user_id = p_user_id
  for update;
  if not found then
    insert into public.phone_verification_rate_limits(user_id, phone, attempts)
    values (p_user_id, p_phone, 1);
    return true;
  end if;
  if current_row.window_started_at + make_interval(secs => p_window_seconds) <= now() then
    update public.phone_verification_rate_limits
    set phone = p_phone, window_started_at = now(), attempts = 1, updated_at = now()
    where user_id = p_user_id;
    return true;
  end if;
  if current_row.attempts >= p_limit then
    return false;
  end if;
  update public.phone_verification_rate_limits
  set phone = p_phone, attempts = attempts + 1, updated_at = now()
  where user_id = p_user_id;
  return true;
end;
$function$;


CREATE OR REPLACE FUNCTION public.create_gift_claim(p_gift_id uuid, p_agent_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  gift_row gifts%rowtype;
  active_claims integer := 0;
  eligibility gift_eligibilities%rowtype;
  claim_id uuid;
  caller uuid := auth.uid();
  service_call boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  if caller is null and not service_call then raise exception 'Authentication required'; end if;
  if not service_call and p_agent_id <> caller then raise exception 'Cannot claim a gift for another agent'; end if;
  select * into gift_row from gifts where id = p_gift_id and is_active = true;
  if not found then raise exception 'Gift not found or inactive'; end if;
  if gift_row.max_concurrent_claims is not null then
    select count(*) into active_claims from gift_claims where agent_id = p_agent_id and status in ('pending','approved','fulfilled');
    if active_claims >= gift_row.max_concurrent_claims then raise exception 'Claim limit reached'; end if;
  end if;
  select * into eligibility from gift_eligibilities where gift_id = p_gift_id and agent_id = p_agent_id and status = 'eligible';
  if not found then raise exception 'Gift not eligible'; end if;
  insert into gift_claims(gift_id, agent_id, status, claimed_at, updated_at)
  values (p_gift_id, p_agent_id, 'pending', now(), now()) returning id into claim_id;
  update gift_eligibilities set status = 'claimed', updated_at = now() where gift_id = p_gift_id and agent_id = p_agent_id;
  return claim_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.delete_expired_exports()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    DELETE FROM export_logs
    WHERE expires_at < NOW();
END;
$function$;


CREATE OR REPLACE FUNCTION public.delete_old_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    DELETE FROM notifications
    WHERE expires_at < NOW();
END;
$function$;


CREATE OR REPLACE FUNCTION public.enqueue_agent_notification(p_agent_id uuid, p_title text, p_message text, p_property_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if p_agent_id is null then
    return;
  end if;
  insert into notifications(agent_id, type, title, message, related_entity_type, related_entity_id, action_url)
  values (p_agent_id, 'admin_message', p_title, p_message, 'property', p_property_id, '/properties/' || p_property_id::text);
exception when others then
  raise notice 'notification insert skipped for agent % (% %)', p_agent_id, p_title, SQLERRM;
end;
$function$;


CREATE OR REPLACE FUNCTION public.evaluate_admin_rules_for_agent(p_agent_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  rule_row record;
  tier_level integer;
  current_level integer;
  expires_days integer;
  badge_id uuid;
begin
  -- clear expired badges for this agent
  delete from agent_badges
   where agent_id = p_agent_id
     and expires_at is not null
     and expires_at < now();

  for rule_row in
    select * from admin_rules where is_active = true
  loop
    if public.reward_agent_matches_rule(
        p_agent_id,
        rule_row.metric,
        rule_row.time_window,
        rule_row.operator,
        rule_row.value_single,
        rule_row.value_min,
        rule_row.value_max,
        rule_row.filters
      ) then
      if rule_row.target_type = 'badge' then
        select id, expires_in_days into badge_id, expires_days
        from badges where id = rule_row.target_id;
        if badge_id is not null then
          insert into agent_badges(agent_id, badge_id, expires_at)
          values (p_agent_id, badge_id,
                  case when expires_days is not null then now() + (expires_days || ' days')::interval else null end)
          on conflict (agent_id, badge_id) do update
            set expires_at = excluded.expires_at,
                unlocked_at = now();
        end if;
      elsif rule_row.target_type = 'tier' then
        select level into tier_level from tiers where id = rule_row.target_id;
        select t.level into current_level
        from user_tiers ut
        join tiers t on t.id = ut.tier_id
        where ut.user_id = p_agent_id
        limit 1;

        if tier_level is not null and (current_level is null or tier_level > current_level) then
          delete from user_tiers where user_id = p_agent_id;
          insert into user_tiers(user_id, tier_id, awarded_at)
          values (p_agent_id, rule_row.target_id, now());
        end if;
      end if;
    end if;
  end loop;
end;
$function$;


CREATE OR REPLACE FUNCTION public.evaluate_admin_rules_for_all()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  row record;
begin
  for row in select id from users_profile loop
    perform public.evaluate_admin_rules_for_agent(row.id);
  end loop;
end;
$function$;


CREATE OR REPLACE FUNCTION public.evaluate_gift_rules_for_agent(p_agent_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  gift_row record;
  rule_row record;
  allowed_by_tier boolean;
  agent_tier_id uuid;
  matches boolean;
  eligible_other boolean;
  claimed_other boolean;
begin
  select ut.tier_id into agent_tier_id from user_tiers ut where ut.user_id = p_agent_id limit 1;

  for gift_row in
    select * from gifts where is_active = true
  loop
    allowed_by_tier := (gift_row.tier_ids is null or array_length(gift_row.tier_ids,1) is null)
      or (agent_tier_id is not null and agent_tier_id = any(gift_row.tier_ids));

    if not allowed_by_tier then
      update gift_eligibilities
         set status = 'blocked', updated_at = now()
       where gift_id = gift_row.id and agent_id = p_agent_id;
      continue;
    end if;

    select exists(
      select 1
      from gift_eligibilities ge
      join gifts g on g.id = ge.gift_id
      where ge.agent_id = p_agent_id
        and ge.gift_id <> gift_row.id
        and g.exclusivity_mode = 'eligible'
        and ge.status = 'eligible'
    ) into eligible_other;

    select exists(
      select 1
      from gift_claims gc
      join gifts g on g.id = gc.gift_id
      where gc.agent_id = p_agent_id
        and gc.gift_id <> gift_row.id
        and g.exclusivity_mode = 'claimed'
        and gc.status in ('pending','approved','fulfilled')
    ) into claimed_other;

    if eligible_other or claimed_other then
      update gift_eligibilities
         set status = 'blocked', updated_at = now()
       where gift_id = gift_row.id and agent_id = p_agent_id;
      continue;
    end if;

    matches := false;
    for rule_row in
      select * from gift_rules where gift_id = gift_row.id and is_active = true
    loop
      if public.gift_agent_matches_rule(
          p_agent_id,
          rule_row.metric,
          rule_row.time_window,
          rule_row.operator,
          rule_row.value_single,
          rule_row.value_min,
          rule_row.value_max,
          rule_row.filters
      ) then
        matches := true;
        exit;
      end if;
    end loop;

    if matches then
      insert into gift_eligibilities(gift_id, agent_id, status, eligible_at, updated_at)
      values (gift_row.id, p_agent_id, 'eligible', now(), now())
      on conflict (gift_id, agent_id) do update
        set status = 'eligible', updated_at = now();
    else
      delete from gift_eligibilities where gift_id = gift_row.id and agent_id = p_agent_id;
    end if;
  end loop;
end;
$function$;


CREATE OR REPLACE FUNCTION public.evaluate_gift_rules_for_all()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  row record;
begin
  for row in select id from users_profile loop
    perform public.evaluate_gift_rules_for_agent(row.id);
  end loop;
end;
$function$;


CREATE OR REPLACE FUNCTION public.generate_deal_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    year TEXT;
    counter INT;
    new_reference TEXT;
BEGIN
    year := TO_CHAR(NOW(), 'YYYY');
    
    -- Get the max counter for this year
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(deal_reference FROM 'BRX-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1 INTO counter
    FROM deals
    WHERE deal_reference LIKE 'BRX-' || year || '-%';
    
    new_reference := 'BRX-' || year || '-' || LPAD(counter::TEXT, 5, '0');
    NEW.deal_reference := new_reference;
    
    RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.gift_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  return public.reward_agent_matches_rule(
    p_agent_id,
    p_metric,
    p_window,
    p_operator,
    p_value_single,
    p_value_min,
    p_value_max,
    p_filters
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.grant_verified_badge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_badge_id uuid;
begin
  if new.verification_status = 'verified'
     and (old.verification_status is distinct from 'verified') then
    select id into v_badge_id from badges where name = 'Verified' limit 1;
    if v_badge_id is not null then
      insert into agent_badges(agent_id, badge_id)
      values (new.id, v_badge_id)
      on conflict (agent_id, badge_id) do nothing;
    end if;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.log_property_expiration_event(p_property_id uuid, p_target property_renewal_actor, p_target_id uuid, p_event_type text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  insert into property_expiration_events(property_id, target_type, target_id, event_type, message)
  values (p_property_id, p_target, p_target_id, p_event_type, p_message);
exception when others then
  raise notice 'property_expiration_events insert skipped for property % (% %)', p_property_id, p_event_type, SQLERRM;
end;
$function$;


CREATE OR REPLACE FUNCTION public.preview_admin_rule(target_type text, target_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  result_count integer := 0;
  sample_ids text[] := '{}';
begin
  with metrics as (
    select id, public.reward_metric_value(id, metric, time_window, filters) as v
    from users_profile
  ),
  filtered as (
    select id
    from metrics
    where
      case
        when operator = '>=' then v >= coalesce(value_single,0)
        when operator = '<=' then v <= coalesce(value_single,0)
        when operator = 'between' then v between coalesce(value_min,0) and coalesce(value_max,0)
        when operator = 'top_n' then id in (
          select id from metrics order by v desc limit coalesce(value_single,0)::int
        )
        when operator = 'top_percent' then id in (
          select id from metrics order by v desc
          limit greatest(1, ceil((coalesce(value_single,0) / 100.0) * (select count(*) from metrics))::int)
        )
        else false
      end
  )
  select count(*), array_agg(id::text order by id) into result_count, sample_ids
  from filtered;

  return jsonb_build_object(
    'count', coalesce(result_count,0),
    'sample', coalesce(sample_ids[1:10], '{}')
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.preview_gift_rule(gift_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  result_count integer := 0;
  sample_ids text[] := '{}';
begin
  with metrics as (
    select id, public.reward_metric_value(id, metric, time_window, filters) as v
    from users_profile
  ),
  filtered as (
    select id
    from metrics
    where
      case
        when operator = '>=' then v >= coalesce(value_single,0)
        when operator = '<=' then v <= coalesce(value_single,0)
        when operator = 'between' then v between coalesce(value_min,0) and coalesce(value_max,0)
        when operator = 'top_n' then id in (
          select id from metrics order by v desc limit coalesce(value_single,0)::int
        )
        when operator = 'top_percent' then id in (
          select id from metrics order by v desc
          limit greatest(1, ceil((coalesce(value_single,0) / 100.0) * (select count(*) from metrics))::int)
        )
        else false
      end
  )
  select count(*), array_agg(id::text order by id) into result_count, sample_ids
  from filtered;

  return jsonb_build_object(
    'count', coalesce(result_count,0),
    'sample', coalesce(sample_ids[1:10], '{}')
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.process_property_expirations()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  warning record;
  expired record;
begin
  for warning in
    select *
    from properties
    where approval_status = 'approved'
      and is_active = true
      and expires_at between now() and now() + interval '7 days'
      and (renewal_prompted_at is null or renewal_prompted_at < now() - interval '6 days')
  loop
    update properties
       set renewal_status = 'expiring'::property_renewal_status,
           renewal_prompted_at = now()
     where id = warning.id;

    perform log_property_expiration_event(warning.id, 'agent', warning.listed_by_agent_id, 'warning', 'Listing expires in under 7 days.');
    perform log_property_expiration_event(warning.id, 'developer', warning.developer_id, 'warning', 'Listing expires in under 7 days.');
    perform log_property_expiration_event(warning.id, 'admin', null, 'warning', 'Listing expires in under 7 days.');
    perform enqueue_agent_notification(warning.listed_by_agent_id, 'Listing expiring soon', 'Take action to renew or it will be hidden.', warning.id);
  end loop;

  for expired in
    select *
    from properties
    where approval_status = 'approved' and is_active = true and expires_at <= now()
  loop
    update properties
       set is_active = false,
           approval_status = 'expired',
           renewal_status = 'expired'::property_renewal_status
     where id = expired.id;

    update property_renewal_requests
       set status = 'auto_expired',
           reviewed_at = now(),
           notes = coalesce(notes, 'Auto-expired without admin action')
     where property_id = expired.id
       and status = 'pending';

    perform log_property_expiration_event(expired.id, 'agent', expired.listed_by_agent_id, 'expired', 'Listing expired and was hidden.');
    perform log_property_expiration_event(expired.id, 'developer', expired.developer_id, 'expired', 'Listing expired and was hidden.');
    perform log_property_expiration_event(expired.id, 'admin', null, 'expired', 'Listing expired and was hidden.');
    perform enqueue_agent_notification(expired.listed_by_agent_id, 'Listing expired', 'Renew to make it visible again.', expired.id);
  end loop;
end;
$function$;


CREATE OR REPLACE FUNCTION public.refresh_referral_bonus_for_agent(target_referrer uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  total_count INT := 0;
  verified_count INT := 0;
  first_deal_count INT := 0;
  bonus_rate DECIMAL(5,2);
BEGIN
  IF target_referrer IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO total_count
  FROM users_profile
  WHERE referred_by = target_referrer;

  SELECT COUNT(*) INTO verified_count
  FROM users_profile
  WHERE referred_by = target_referrer
    AND verification_status = 'verified';

  SELECT COUNT(DISTINCT d.agent_id) INTO first_deal_count
  FROM deals d
  WHERE d.agent_id IN (SELECT id FROM users_profile WHERE referred_by = target_referrer)
    AND d.status IN ('confirmed', 'awaiting_payment', 'paid');

  UPDATE users_profile
  SET total_referrals = total_referrals,
      verified_referrals = verified_count,
      referrals_with_first_deal = first_deal_count
  WHERE id = target_referrer;

  SELECT bonus_percentage INTO bonus_rate
  FROM referral_bonus_rules
  WHERE is_active = true
    AND min_referrals <= CASE behavior_requirement
      WHEN 'verified' THEN verified_count
      WHEN 'first_deal' THEN first_deal_count
      ELSE total_count
    END
    AND (
      max_referrals IS NULL OR
      CASE behavior_requirement
        WHEN 'verified' THEN verified_count
        WHEN 'first_deal' THEN first_deal_count
        ELSE total_count
      END <= max_referrals
    )
  ORDER BY min_referrals DESC
  LIMIT 1;

  UPDATE users_profile
  SET referral_bonus_rate = COALESCE(bonus_rate, 0)
  WHERE id = target_referrer;
END;
$function$;


CREATE OR REPLACE FUNCTION public.request_property_renewal(p_property_id uuid, p_actor_role property_renewal_actor, p_actor_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS property_renewal_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  listing record;
  result property_renewal_requests;
  message text;
  caller uuid := auth.uid();
  effective_id uuid;
  is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  effective_id := case when is_service then p_actor_id else caller end;
  if effective_id is null then raise exception 'Authentication required'; end if;
  select * into listing from properties where id = p_property_id for update;
  if not found then raise exception 'Property % not found', p_property_id; end if;
  if listing.approval_status <> 'approved' then raise exception 'Only approved listings can be renewed (property=%)', p_property_id; end if;

  if p_actor_role = 'admin' then
    if not exists (
      select 1 from admins
      where id = effective_id
        and is_active = true
        and (role::text in ('listing_admin', 'super_admin')
          or 'listing_admin' = any(coalesce(roles::text[], '{}'::text[]))
          or 'super_admin' = any(coalesce(roles::text[], '{}'::text[])))
    ) then raise exception 'Active listing admin required'; end if;
    update properties
    set expires_at = greatest(coalesce(listing.expires_at, now()), now()) + interval '3 months',
        last_renewed_at = now(), renewal_status = 'active', renewal_prompted_at = null,
        approval_status = 'approved', is_active = true
    where id = p_property_id returning * into listing;
    insert into property_renewal_requests(property_id, requested_by_role, requested_by_id, status, reviewed_by, reviewed_at, notes)
    values (p_property_id, 'admin', effective_id, 'approved', effective_id, now(), coalesce(p_notes, 'Renewed directly by admin'))
    returning * into result;
    message := format('Listing %s renewed by admin', coalesce(listing.property_name, listing.id::text));
    perform log_property_expiration_event(p_property_id, 'admin', effective_id, 'renewal_approved', message);
    perform log_property_expiration_event(p_property_id, 'agent', listing.listed_by_agent_id, 'renewal_approved', message);
    perform log_property_expiration_event(p_property_id, 'developer', listing.developer_id, 'renewal_approved', message);
    perform enqueue_agent_notification(listing.listed_by_agent_id, 'Listing renewed', message, p_property_id);
    return result;
  elsif p_actor_role = 'agent' then
    if listing.listed_by_agent_id is null or listing.listed_by_agent_id <> effective_id then raise exception 'Only the listing agent can request renewal'; end if;
  elsif p_actor_role = 'developer' then
    if not exists (select 1 from developer_accounts where auth_user_id = effective_id and developer_id = listing.developer_id and status = 'active') then raise exception 'Active developer membership required'; end if;
  else
    raise exception 'Invalid renewal actor';
  end if;

  insert into property_renewal_requests(property_id, requested_by_role, requested_by_id, notes)
  values (p_property_id, p_actor_role, effective_id, p_notes) returning * into result;
  update properties set renewal_status = 'awaiting_admin' where id = p_property_id;
  message := format('Renewal requested by %s for %s', p_actor_role, coalesce(listing.property_name, listing.id::text));
  perform log_property_expiration_event(p_property_id, 'admin', null, 'renewal_request', message);
  perform log_property_expiration_event(p_property_id, 'developer', listing.developer_id, 'renewal_request', message);
  if listing.listed_by_agent_id is not null then perform log_property_expiration_event(p_property_id, 'agent', listing.listed_by_agent_id, 'renewal_request', message); end if;
  return result;
end;
$function$;


CREATE OR REPLACE FUNCTION public.reset_phone_verification_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.phone is distinct from old.phone then
    new.phone_verified := false;
    new.phone_verified_at := null;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.resolve_commission_rate(dev_name text, project_name text)
 RETURNS TABLE(commission_rate numeric, platform_share numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  target_developer uuid;
  target_project uuid;
  target_property uuid;
begin
  select id
    into target_developer
    from developers
   where lower(name) = lower(dev_name)
   limit 1;

  if target_developer is null then
    return;
  end if;

  if project_name is not null and length(trim(project_name)) > 0 then
    select id
      into target_project
      from developer_projects
     where developer_id = target_developer
       and lower(name) = lower(project_name)
     limit 1;

    if target_project is null then
      select id
        into target_property
        from properties
       where developer_id = target_developer
         and lower(property_name) = lower(project_name)
       limit 1;
    end if;

    if target_project is not null then
      return query
        select commission_rate, platform_share
          from developer_commission_rules
         where developer_id = target_developer
           and property_id = target_project
         limit 1;
    elsif target_property is not null then
      return query
        select commission_rate, platform_share
          from developer_commission_rules
         where developer_id = target_developer
           and property_id = target_property
         limit 1;
    end if;
  end if;

  return query
    select commission_rate, platform_share
      from developer_commission_rules
     where developer_id = target_developer
       and property_id is null
     limit 1;
end;
$function$;


CREATE OR REPLACE FUNCTION public.review_property_renewal_request(p_request_id uuid, p_admin_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS property_renewal_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  request_row property_renewal_requests%rowtype;
  listing record;
  message text;
  caller uuid := auth.uid();
  effective_admin uuid := case when coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then p_admin_id else caller end;
begin
  if effective_admin is null or not exists (
    select 1 from admins
    where id = effective_admin
      and is_active = true
      and (role::text in ('listing_admin', 'super_admin')
        or 'listing_admin' = any(coalesce(roles::text[], '{}'::text[]))
        or 'super_admin' = any(coalesce(roles::text[], '{}'::text[])))
  ) then raise exception 'Active listing admin required'; end if;
  select * into request_row from property_renewal_requests where id = p_request_id for update;
  if not found then raise exception 'Renewal request % not found', p_request_id; end if;
  if request_row.status <> 'pending' then return request_row; end if;
  select * into listing from properties where id = request_row.property_id for update;
  if not p_approve then
    update property_renewal_requests set status = 'rejected', reviewed_by = effective_admin, reviewed_at = now(), notes = p_notes where id = p_request_id returning * into request_row;
    update properties set renewal_status = 'expired' where id = request_row.property_id;
    message := format('Renewal rejected for %s', coalesce(listing.property_name, listing.id::text));
    perform log_property_expiration_event(request_row.property_id, 'agent', listing.listed_by_agent_id, 'renewal_rejected', message);
    perform log_property_expiration_event(request_row.property_id, 'developer', listing.developer_id, 'renewal_rejected', message);
    perform enqueue_agent_notification(listing.listed_by_agent_id, 'Renewal rejected', message, request_row.property_id);
    return request_row;
  end if;
  update properties set expires_at = greatest(coalesce(listing.expires_at, now()), now()) + interval '3 months', last_renewed_at = now(), renewal_status = 'active', renewal_prompted_at = null, approval_status = 'approved', is_active = true where id = request_row.property_id returning * into listing;
  update property_renewal_requests set status = 'approved', reviewed_by = effective_admin, reviewed_at = now(), notes = p_notes where id = p_request_id returning * into request_row;
  message := format('Renewal approved for %s', coalesce(listing.property_name, listing.id::text));
  perform log_property_expiration_event(request_row.property_id, 'agent', listing.listed_by_agent_id, 'renewal_approved', message);
  perform log_property_expiration_event(request_row.property_id, 'developer', listing.developer_id, 'renewal_approved', message);
  perform enqueue_agent_notification(listing.listed_by_agent_id, 'Listing renewed', message, request_row.property_id);
  return request_row;
end;
$function$;


CREATE OR REPLACE FUNCTION public.reward_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  agent_value numeric := public.reward_metric_value(p_agent_id, p_metric, p_window, p_filters);
  total_count integer := 0;
  rank_pos integer := null;
begin
  if p_operator = '>=' then
    return agent_value >= coalesce(p_value_single,0);
  elsif p_operator = '<=' then
    return agent_value <= coalesce(p_value_single,0);
  elsif p_operator = 'between' then
    return agent_value between coalesce(p_value_min,0) and coalesce(p_value_max,0);
  elsif p_operator in ('top_n','top_percent') then
    with metrics as (
      select id, public.reward_metric_value(id, p_metric, p_window, p_filters) as v
      from users_profile
    ),
    ranked as (
      select id,
             dense_rank() over (order by v desc) as r,
             count(*) over () as total
      from metrics
    )
    select r, total into rank_pos, total_count
    from ranked where id = p_agent_id;

    if rank_pos is null or total_count = 0 then
      return false;
    end if;

    if p_operator = 'top_n' then
      return rank_pos <= coalesce(p_value_single,0);
    else
      return (rank_pos::numeric / total_count::numeric) <= (coalesce(p_value_single,0) / 100.0);
    end if;
  end if;

  return false;
end;
$function$;


CREATE OR REPLACE FUNCTION public.reward_metric_value(p_agent_id uuid, p_metric text, p_window text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  window_start timestamptz := public.reward_window_start(p_window);
  v numeric := 0;
  v_developer_name text := nullif(p_filters->>'developer_name','');
  v_developer_id uuid := nullif(p_filters->>'developer_id','')::uuid;
  v_project_id uuid := nullif(p_filters->>'project_id','')::uuid;
  v_property_type text := nullif(p_filters->>'property_type','');
begin
  if p_metric = 'deals_count' then
    select count(*)::numeric into v
    from deals
    where agent_id = p_agent_id
      and (window_start is null or created_at >= window_start)
      and (v_developer_name is null or developer_name = v_developer_name);
  elsif p_metric = 'deals_volume' then
    select coalesce(sum(sale_amount),0)::numeric into v
    from deals
    where agent_id = p_agent_id
      and (window_start is null or created_at >= window_start)
      and (v_developer_name is null or developer_name = v_developer_name);
  elsif p_metric = 'revenue' then
    select coalesce(sum(coalesce(actual_commission, estimated_commission, sale_amount * (commission_rate/100.0))),0)::numeric into v
    from deals
    where agent_id = p_agent_id
      and (window_start is null or created_at >= window_start)
      and (v_developer_name is null or developer_name = v_developer_name);
  elsif p_metric = 'referrals' then
    select count(*)::numeric into v
    from users_profile
    where referred_by = p_agent_id
      and (window_start is null or created_at >= window_start);
  elsif p_metric = 'listings_count' then
    select count(*)::numeric into v
    from properties
    where listed_by_agent_id = p_agent_id
      and (window_start is null or created_at >= window_start)
      and (v_developer_id is null or developer_id = v_developer_id)
      and (v_project_id is null or project_id = v_project_id)
      and (v_property_type is null or property_type::text = v_property_type);
  elsif p_metric = 'claim_acceptance' then
    -- Accepted / (Accepted + Rejected + Requested Change)
    with claims as (
      select status
      from deal_stage_entries
      where agent_id = p_agent_id
        and stage::text = 'SalesClaim'
        and (window_start is null or created_at >= window_start)
    )
    select
      case
        when count(*) = 0 then 0
        else (count(*) filter (where status in ('Accepted - Processing','Paid'))::numeric /
              count(*)::numeric)
      end
    into v
    from claims;
  else
    v := 0;
  end if;

  return coalesce(v,0);
end;
$function$;


CREATE OR REPLACE FUNCTION public.reward_window_start(p_window text)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select case
    when p_window = 'last_30d' then now() - interval '30 days'
    when p_window = 'last_90d' then now() - interval '90 days'
    when p_window = 'quarter' then date_trunc('quarter', now())
    when p_window = 'year' then date_trunc('year', now())
    else null
  end;
$function$;


CREATE OR REPLACE FUNCTION public.set_listing_publication_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.approval_status = 'approved' and (old.approval_status is distinct from 'approved' or old.published_at is null) then
    new.published_at := coalesce(new.published_at, now());
    new.last_renewed_at := now();
    new.expires_at := coalesce(new.expires_at, new.published_at + interval '3 months');
    new.renewal_status := 'active'::property_renewal_status;
    new.renewal_prompted_at := null;
    new.is_active := true;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.set_sales_claim_status(p_entry_id uuid, p_status text)
 RETURNS deal_stage_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  valid_statuses text[] := array['Under Review', 'Accepted - Processing', 'Paid'];
  updated_row deal_stage_entries%rowtype;
  is_admin boolean;
  jwt_role text;
begin
  is_admin := exists(select 1 from admins where id = auth.uid() and is_active = true);
  jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if jwt_role = 'service_role' then
    is_admin := true;
  end if;
  if not is_admin then
    raise exception 'You are not authorized to update sales claim statuses.';
  end if;
  if not (p_status = any(valid_statuses)) then
    raise exception 'Invalid status %, expected one of %', p_status, valid_statuses;
  end if;
  update deal_stage_entries
     set status = p_status,
         updated_at = now()
   where id = p_entry_id
     and stage = 'SalesClaim'
  returning * into updated_row;
  if not found then
    raise exception 'Sales claim % not found or not a Sales Claim entry.', p_entry_id;
  end if;
  return updated_row;
end;
$function$;


CREATE OR REPLACE FUNCTION public.submit_agent_deal(p_deal jsonb)
 RETURNS deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  caller uuid := auth.uid();
  profile_row public.users_profile%rowtype;
  result public.deals;
  sale numeric;
  base_rate numeric;
  referral_bonus numeric;
  commission numeric;
  attachments text[];
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_deal) <> 'object' then
    raise exception 'Invalid deal payload';
  end if;
  select * into profile_row
  from public.users_profile
  where id = caller and account_status = 'active' and verification_status = 'verified'
  for update;
  if not found then
    raise exception 'Only active verified agents can submit deals';
  end if;
  if nullif(trim(p_deal->>'propertyName'), '') is null
     or nullif(trim(p_deal->>'developerName'), '') is null
     or nullif(trim(p_deal->>'clientName'), '') is null
     or nullif(trim(p_deal->>'unitCode'), '') is null then
    raise exception 'Property, developer, client, and unit are required';
  end if;
  sale := nullif(p_deal->>'saleAmount', '')::numeric;
  if sale is null or sale < 100000 then
    raise exception 'Sale amount must be at least 100000';
  end if;
  if p_deal ? 'attachments' and jsonb_typeof(p_deal->'attachments') <> 'array' then
    raise exception 'Attachments must be an array';
  end if;
  attachments := array(select jsonb_array_elements_text(coalesce(p_deal->'attachments', '[]'::jsonb)));
  base_rate := least(10, greatest(0, coalesce(profile_row.base_commission_rate, 2.5)));
  referral_bonus := least(5, greatest(0, coalesce(profile_row.referral_bonus_rate, 0)));
  commission := least(10, base_rate + referral_bonus);
  insert into public.deals (
    deal_reference, agent_id, property_name, developer_name, client_name, sale_amount,
    unit_code, deal_sheet_photos, additional_documents, commission_rate, base_rate,
    referral_bonus, estimated_commission, status, admin_notes
  ) values (
    'BRX-' || upper(replace(substr(gen_random_uuid()::text, 1, 12), '-', '')),
    caller,
    trim(p_deal->>'propertyName'),
    trim(p_deal->>'developerName'),
    trim(p_deal->>'clientName'),
    sale,
    trim(p_deal->>'unitCode'),
    attachments,
    null,
    commission,
    base_rate,
    referral_bonus,
    sale * commission / 100,
    'submitted',
    nullif(trim(p_deal->>'notes'), '')
  ) returning * into result;
  return result;
end;
$function$;


CREATE OR REPLACE FUNCTION public.submit_verification_documents(p_paths text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  caller uuid := auth.uid();
  item text;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  if p_paths is null or coalesce(array_length(p_paths, 1), 0) < 1 or array_length(p_paths, 1) > 3 then
    raise exception 'Upload one to three verification documents';
  end if;
  foreach item in array p_paths loop
    if item is null or length(item) > 512 or item !~ ('^' || caller::text || '/[^/].*') then
      raise exception 'Invalid verification document path';
    end if;
  end loop;
  update public.users_profile
  set verification_documents_url = p_paths,
      verification_status = case when verification_status = 'verified' then verification_status else 'pending' end,
      updated_at = now()
  where id = caller;
  if not found then
    raise exception 'Profile not found';
  end if;
  return true;
end;
$function$;


CREATE OR REPLACE FUNCTION public.sync_support_ticket_message_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  update public.support_tickets
  set last_message_preview = new.message,
      last_message_at = new.created_at
  where id = new.ticket_id;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.touch_deal_stage_entries()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.touch_developer_contact_requests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.touch_project_unit_types_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.touch_support_ticket_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.trigger_eval_admin_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if tg_op in ('INSERT','UPDATE') then
    if new.agent_id is not null then
      perform public.evaluate_admin_rules_for_agent(new.agent_id);
    end if;
  end if;
  if tg_op = 'UPDATE' and old.agent_id is not null and old.agent_id <> new.agent_id then
    perform public.evaluate_admin_rules_for_agent(old.agent_id);
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.trigger_eval_admin_rules_properties()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.listed_by_agent_id is not null then
    perform public.evaluate_admin_rules_for_agent(new.listed_by_agent_id);
  end if;
  if tg_op = 'UPDATE' and old.listed_by_agent_id is not null and old.listed_by_agent_id <> new.listed_by_agent_id then
    perform public.evaluate_admin_rules_for_agent(old.listed_by_agent_id);
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.trigger_eval_admin_rules_referrals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.referred_by is not null then
    perform public.evaluate_admin_rules_for_agent(new.referred_by);
  end if;
  if tg_op = 'UPDATE' and old.referred_by is not null and old.referred_by <> new.referred_by then
    perform public.evaluate_admin_rules_for_agent(old.referred_by);
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.trigger_eval_gift_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  new_agent_id uuid;
  old_agent_id uuid;
begin
  if tg_table_name = 'users_profile' then
    new_agent_id := new.id;
    if tg_op = 'UPDATE' then
      old_agent_id := old.id;
    end if;
  else
    new_agent_id := nullif(to_jsonb(new)->>'agent_id', '')::uuid;
    if tg_op = 'UPDATE' then
      old_agent_id := nullif(to_jsonb(old)->>'agent_id', '')::uuid;
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') and new_agent_id is not null then
    perform public.evaluate_gift_rules_for_agent(new_agent_id);
  end if;

  if tg_op = 'UPDATE' and old_agent_id is not null and old_agent_id <> new_agent_id then
    perform public.evaluate_gift_rules_for_agent(old_agent_id);
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.trigger_eval_gift_rules_properties()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.listed_by_agent_id is not null then
    perform public.evaluate_gift_rules_for_agent(new.listed_by_agent_id);
  end if;
  if tg_op = 'UPDATE' and old.listed_by_agent_id is not null and old.listed_by_agent_id <> new.listed_by_agent_id then
    perform public.evaluate_gift_rules_for_agent(old.listed_by_agent_id);
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.update_agent_deal_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Update total_deals count
    UPDATE users_profile
    SET total_deals = (
        SELECT COUNT(*) FROM deals WHERE agent_id = NEW.agent_id
    )
    WHERE id = NEW.agent_id;
    
    -- Update successful_deals count
    UPDATE users_profile
    SET successful_deals = (
        SELECT COUNT(*) FROM deals 
        WHERE agent_id = NEW.agent_id AND status = 'paid'
    )
    WHERE id = NEW.agent_id;
    
    RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.update_agent_earnings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    UPDATE users_profile
    SET total_earnings = (
        SELECT COALESCE(SUM(amount), 0)
        FROM commissions
        WHERE agent_id = NEW.agent_id
    )
    WHERE id = NEW.agent_id;
    
    RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.update_referral_bonus()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  referrer_id UUID;
BEGIN
  SELECT referred_by INTO referrer_id
  FROM users_profile
  WHERE id = NEW.id;

  PERFORM refresh_referral_bonus_for_agent(referrer_id);
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.update_referral_bonus_from_deal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  referrer_id UUID;
BEGIN
  SELECT referred_by INTO referrer_id
  FROM users_profile
  WHERE id = NEW.agent_id;

  PERFORM refresh_referral_bonus_for_agent(referrer_id);
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public', 'extensions'
AS $function$
  select gen_random_uuid();
$function$;


-- Views
create view public.agent_deal_kpis as
 SELECT agent_id,
    count(*) FILTER (WHERE submitted_at >= (now() - '30 days'::interval)) AS deals_last_30d,
    count(*) FILTER (WHERE status = 'paid'::deal_status AND paid_at >= (now() - '30 days'::interval)) AS deals_paid_30d,
    avg(EXTRACT(epoch FROM approved_at - submitted_at) / 3600::numeric) FILTER (WHERE approved_at IS NOT NULL) AS avg_review_hours
   FROM deals d
  GROUP BY agent_id;;

create view public.agent_performance as
 SELECT u.id,
    u.display_name,
    u.verification_status,
    u.total_deals,
    u.successful_deals,
        CASE
            WHEN u.total_deals > 0 THEN u.successful_deals::double precision / u.total_deals::double precision * 100::double precision
            ELSE 0::double precision
        END AS success_rate,
    u.total_earnings,
    u.verified_referrals,
    u.total_commission_rate,
    count(DISTINCT d.id) FILTER (WHERE d.status = 'paid'::deal_status AND d.paid_at >= (now() - '30 days'::interval)) AS deals_last_30_days,
    COALESCE(sum(c.amount) FILTER (WHERE c.paid_at >= (now() - '30 days'::interval)), 0::numeric) AS earnings_last_30_days
   FROM users_profile u
     LEFT JOIN deals d ON u.id = d.agent_id
     LEFT JOIN commissions c ON u.id = c.agent_id
  GROUP BY u.id;;

create view public.agent_referral_stats as
 SELECT a.id AS agent_id,
    count(r.id) AS total_referrals,
    count(r.id) FILTER (WHERE r.verification_status = 'verified'::verification_status) AS verified_referrals,
    count(r.id) FILTER (WHERE r.total_deals > 0) AS referrals_with_first_deal
   FROM users_profile a
     LEFT JOIN users_profile r ON r.referred_by = a.id
  GROUP BY a.id;;

create view public.deal_pipeline as
 SELECT status,
    count(*) AS count,
    sum(estimated_commission) AS total_estimated_commission
   FROM deals
  WHERE status <> ALL (ARRAY['rejected'::deal_status, 'cancelled'::deal_status])
  GROUP BY status;;

create view public.property_statistics as
 SELECT a.name AS area_name,
    count(p.id) AS total_properties,
    avg(p.price) AS avg_price,
    min(p.price) AS min_price,
    max(p.price) AS max_price,
    sum(p.views_count) AS total_views,
    sum(p.inquiries_count) AS total_inquiries
   FROM properties p
     JOIN areas a ON p.area_id = a.id
  WHERE p.approval_status = 'approved'::property_approval_status AND p.is_active = true
  GROUP BY a.id, a.name;;

-- Indexes
CREATE INDEX developer_accounts_auth_user_id_idx ON public.developer_accounts USING btree (auth_user_id);
CREATE INDEX developer_accounts_developer_id_idx ON public.developer_accounts USING btree (developer_id);
CREATE INDEX developer_accounts_status_idx ON public.developer_accounts USING btree (status);
CREATE INDEX developer_contact_requests_developer_id_idx ON public.developer_contact_requests USING btree (developer_id);
CREATE INDEX developer_contact_requests_project_id_idx ON public.developer_contact_requests USING btree (project_id, created_at DESC);
CREATE INDEX developer_contact_requests_requester_user_id_idx ON public.developer_contact_requests USING btree (requester_user_id, created_at DESC);
CREATE INDEX idx_admin_activity_log_action_type ON public.admin_activity_log USING btree (action_type);
CREATE INDEX idx_admin_activity_log_admin_id ON public.admin_activity_log USING btree (admin_id);
CREATE INDEX idx_admin_activity_log_created_at ON public.admin_activity_log USING btree (created_at DESC);
CREATE INDEX idx_admin_rules_created_by_admin ON public.admin_rules USING btree (created_by_admin);
CREATE INDEX idx_admins_assigned_by ON public.admins USING btree (assigned_by);
CREATE INDEX idx_admins_is_active ON public.admins USING btree (is_active);
CREATE INDEX idx_admins_role ON public.admins USING btree (role);
CREATE INDEX idx_agent_badges_agent_id ON public.agent_badges USING btree (agent_id);
CREATE INDEX idx_agent_badges_badge_id ON public.agent_badges USING btree (badge_id);
CREATE INDEX idx_agent_badges_unlocked_at ON public.agent_badges USING btree (unlocked_at DESC);
CREATE INDEX idx_ai_chat_conversations_agent_id ON public.ai_chat_conversations USING btree (agent_id);
CREATE INDEX idx_ai_chat_conversations_updated_at ON public.ai_chat_conversations USING btree (updated_at DESC);
CREATE INDEX idx_ai_chat_messages_conversation_id ON public.ai_chat_messages USING btree (conversation_id);
CREATE INDEX idx_ai_chat_messages_created_at ON public.ai_chat_messages USING btree (created_at);
CREATE INDEX idx_areas_governorate ON public.areas USING btree (governorate);
CREATE INDEX idx_areas_name ON public.areas USING btree (name);
CREATE INDEX idx_badges_badge_type ON public.badges USING btree (badge_type);
CREATE INDEX idx_badges_is_active ON public.badges USING btree (is_active);
CREATE INDEX idx_commissions_agent_id ON public.commissions USING btree (agent_id);
CREATE INDEX idx_commissions_paid_at ON public.commissions USING btree (paid_at DESC);
CREATE INDEX idx_deal_stage_entries_agent_stage ON public.deal_stage_entries USING btree (agent_id, stage);
CREATE INDEX idx_deal_stage_entries_source ON public.deal_stage_entries USING btree (source_entry_id);
CREATE INDEX idx_deal_stage_entries_stage ON public.deal_stage_entries USING btree (stage);
CREATE INDEX idx_deal_status_history_changed_by ON public.deal_status_history USING btree (changed_by);
CREATE INDEX idx_deal_status_history_deal_id ON public.deal_status_history USING btree (deal_id);
CREATE INDEX idx_deals_agent_id ON public.deals USING btree (agent_id);
CREATE INDEX idx_deals_assigned_to_admin ON public.deals USING btree (assigned_to_admin);
CREATE INDEX idx_deals_deal_reference ON public.deals USING btree (deal_reference);
CREATE INDEX idx_deals_paid_at ON public.deals USING btree (paid_at DESC) WHERE (paid_at IS NOT NULL);
CREATE INDEX idx_deals_status ON public.deals USING btree (status);
CREATE INDEX idx_deals_submitted_at ON public.deals USING btree (submitted_at DESC);
CREATE INDEX idx_dev_commission_property_id ON public.developer_commission_rules USING btree (property_id);
CREATE UNIQUE INDEX idx_dev_commission_rule_default ON public.developer_commission_rules USING btree (developer_id) WHERE (property_id IS NULL);
CREATE UNIQUE INDEX idx_dev_commission_rule_unique ON public.developer_commission_rules USING btree (developer_id, property_id);
CREATE INDEX idx_developer_accounts_developer_id ON public.developer_accounts USING btree (developer_id);
CREATE INDEX idx_developer_projects_developer_id ON public.developer_projects USING btree (developer_id);
CREATE INDEX idx_developers_is_active ON public.developers USING btree (is_active);
CREATE INDEX idx_developers_name ON public.developers USING btree (name);
CREATE INDEX idx_export_logs_agent_id ON public.export_logs USING btree (agent_id);
CREATE INDEX idx_export_logs_created_at ON public.export_logs USING btree (created_at DESC);
CREATE INDEX idx_export_logs_expires_at ON public.export_logs USING btree (expires_at);
CREATE INDEX idx_gift_claims_agent_id ON public.gift_claims USING btree (agent_id);
CREATE INDEX idx_gift_claims_gift_id ON public.gift_claims USING btree (gift_id);
CREATE INDEX idx_gift_eligibilities_agent_id ON public.gift_eligibilities USING btree (agent_id);
CREATE INDEX idx_gift_rules_gift_id ON public.gift_rules USING btree (gift_id);
CREATE INDEX idx_notification_events_agent_id ON public.notification_events USING btree (agent_id);
CREATE INDEX idx_notifications_agent_id ON public.notifications USING btree (agent_id);
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);
CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);
CREATE INDEX idx_project_unit_types_project_id ON public.project_unit_types USING btree (project_id);
CREATE INDEX idx_properties_approval_status ON public.properties USING btree (approval_status);
CREATE INDEX idx_properties_area_id ON public.properties USING btree (area_id);
CREATE INDEX idx_properties_bedrooms ON public.properties USING btree (bedrooms);
CREATE INDEX idx_properties_developer_id ON public.properties USING btree (developer_id);
CREATE INDEX idx_properties_is_active ON public.properties USING btree (is_active);
CREATE INDEX idx_properties_is_featured ON public.properties USING btree (is_featured) WHERE (is_featured = true);
CREATE INDEX idx_properties_listed_by_agent_id ON public.properties USING btree (listed_by_agent_id);
CREATE INDEX idx_properties_price ON public.properties USING btree (price);
CREATE INDEX idx_properties_project_id ON public.properties USING btree (project_id);
CREATE INDEX idx_properties_property_type ON public.properties USING btree (property_type);
CREATE INDEX idx_properties_reviewed_by ON public.properties USING btree (reviewed_by);
CREATE INDEX idx_properties_search ON public.properties USING gin (to_tsvector('english'::regconfig, (((property_name)::text || ' '::text) || COALESCE(description, ''::text))));
CREATE INDEX idx_property_expiration_events_property_id ON public.property_expiration_events USING btree (property_id);
CREATE INDEX idx_property_expiration_events_target ON public.property_expiration_events USING btree (target_type, target_id);
CREATE INDEX idx_property_inquiries_agent_id ON public.property_inquiries USING btree (agent_id);
CREATE INDEX idx_property_inquiries_property_id ON public.property_inquiries USING btree (property_id);
CREATE INDEX idx_property_inquiries_status ON public.property_inquiries USING btree (status);
CREATE INDEX idx_property_renewal_requests_property_id ON public.property_renewal_requests USING btree (property_id);
CREATE INDEX idx_property_renewal_requests_reviewed_by ON public.property_renewal_requests USING btree (reviewed_by);
CREATE INDEX idx_property_renewal_requests_status ON public.property_renewal_requests USING btree (status);
CREATE INDEX idx_saved_properties_agent_id ON public.saved_properties USING btree (agent_id);
CREATE INDEX idx_saved_properties_property_id ON public.saved_properties USING btree (property_id);
CREATE INDEX idx_system_settings_updated_by ON public.system_settings USING btree (updated_by);
CREATE INDEX idx_user_tiers_tier_id ON public.user_tiers USING btree (tier_id);
CREATE INDEX idx_users_profile_account_status ON public.users_profile USING btree (account_status);
CREATE INDEX idx_users_profile_referral_code ON public.users_profile USING btree (referral_code);
CREATE INDEX idx_users_profile_referred_by ON public.users_profile USING btree (referred_by);
CREATE INDEX idx_users_profile_verification_status ON public.users_profile USING btree (verification_status);
CREATE INDEX project_unit_variants_min_price_idx ON public.project_unit_variants USING btree (min_price);
CREATE INDEX project_unit_variants_unit_type_idx ON public.project_unit_variants USING btree (project_unit_type_id);
CREATE INDEX support_ticket_messages_ticket_created_idx ON public.support_ticket_messages USING btree (ticket_id, created_at);
CREATE INDEX support_tickets_agent_activity_idx ON public.support_tickets USING btree (agent_id, last_message_at DESC);
CREATE INDEX support_tickets_status_activity_idx ON public.support_tickets USING btree (status, last_message_at DESC);
CREATE INDEX tasks_agent_status_idx ON public.tasks USING btree (agent_id, status);
CREATE INDEX tasks_due_idx ON public.tasks USING btree (due_at);

-- Triggers
CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_earnings_trigger AFTER INSERT ON commissions FOR EACH ROW EXECUTE FUNCTION update_agent_earnings();
CREATE TRIGGER deal_stage_entries_touch BEFORE UPDATE ON deal_stage_entries FOR EACH ROW EXECUTE FUNCTION touch_deal_stage_entries();
CREATE TRIGGER trg_eval_admin_rules_sales_claims AFTER INSERT OR UPDATE ON deal_stage_entries FOR EACH ROW WHEN (new.stage::text = 'SalesClaim'::text) EXECUTE FUNCTION trigger_eval_admin_rules();
CREATE TRIGGER trg_eval_gift_rules_sales_claims AFTER INSERT OR UPDATE ON deal_stage_entries FOR EACH ROW WHEN (new.stage::text = 'SalesClaim'::text) EXECUTE FUNCTION trigger_eval_gift_rules();
CREATE TRIGGER generate_deal_reference_trigger BEFORE INSERT ON deals FOR EACH ROW WHEN (new.deal_reference IS NULL) EXECUTE FUNCTION generate_deal_reference();
CREATE TRIGGER trg_eval_admin_rules_deals AFTER INSERT OR UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION trigger_eval_admin_rules();
CREATE TRIGGER trg_eval_gift_rules_deals AFTER INSERT OR UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION trigger_eval_gift_rules();
CREATE TRIGGER update_agent_stats_on_deal_change AFTER INSERT OR UPDATE OF status ON deals FOR EACH ROW EXECUTE FUNCTION update_agent_deal_stats();
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_referral_bonus_on_deal_trigger AFTER INSERT OR UPDATE OF status ON deals FOR EACH ROW EXECUTE FUNCTION update_referral_bonus_from_deal();
CREATE TRIGGER update_developer_commission_rules_updated_at BEFORE UPDATE ON developer_commission_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER developer_contact_requests_touch_updated_at BEFORE UPDATE ON developer_contact_requests FOR EACH ROW EXECUTE FUNCTION touch_developer_contact_requests_updated_at();
CREATE TRIGGER update_developers_updated_at BEFORE UPDATE ON developers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER project_unit_types_set_updated_at BEFORE UPDATE ON project_unit_types FOR EACH ROW EXECUTE FUNCTION touch_project_unit_types_updated_at();
CREATE TRIGGER properties_set_publication_window BEFORE INSERT OR UPDATE OF approval_status ON properties FOR EACH ROW EXECUTE FUNCTION set_listing_publication_window();
CREATE TRIGGER trg_eval_admin_rules_properties AFTER INSERT OR UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION trigger_eval_admin_rules_properties();
CREATE TRIGGER trg_eval_gift_rules_properties AFTER INSERT OR UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION trigger_eval_gift_rules_properties();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER support_ticket_messages_sync_activity AFTER INSERT ON support_ticket_messages FOR EACH ROW EXECUTE FUNCTION sync_support_ticket_message_activity();
CREATE TRIGGER support_tickets_touch_updated_at BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION touch_support_ticket_updated_at();
CREATE TRIGGER trg_eval_admin_rules_referrals AFTER INSERT OR UPDATE OF referred_by ON users_profile FOR EACH ROW EXECUTE FUNCTION trigger_eval_admin_rules_referrals();
CREATE TRIGGER trg_eval_gift_rules_referrals AFTER INSERT OR UPDATE OF referred_by ON users_profile FOR EACH ROW EXECUTE FUNCTION trigger_eval_gift_rules();
CREATE TRIGGER trg_grant_verified_badge AFTER UPDATE OF verification_status ON users_profile FOR EACH ROW EXECUTE FUNCTION grant_verified_badge();
CREATE TRIGGER update_referral_bonus_trigger AFTER UPDATE OF verification_status ON users_profile FOR EACH ROW WHEN (new.verification_status = 'verified'::verification_status AND old.verification_status <> 'verified'::verification_status) EXECUTE FUNCTION update_referral_bonus();
CREATE TRIGGER update_users_profile_updated_at BEFORE UPDATE ON users_profile FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER users_profile_reset_phone_verification BEFORE UPDATE OF phone ON users_profile FOR EACH ROW EXECUTE FUNCTION reset_phone_verification_on_change();

-- Row-level security
alter table public.admin_activity_log enable row level security;
alter table public.admin_rules enable row level security;
alter table public.admins enable row level security;
alter table public.agent_badges enable row level security;
alter table public.ai_chat_conversations enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.areas enable row level security;
alter table public.badges enable row level security;
alter table public.commissions enable row level security;
alter table public.deal_stage_entries enable row level security;
alter table public.deal_status_history enable row level security;
alter table public.deals enable row level security;
alter table public.developer_accounts enable row level security;
alter table public.developer_commission_rules enable row level security;
alter table public.developer_contact_requests enable row level security;
alter table public.developer_contact_requests force row level security;
alter table public.developer_impersonation_grants enable row level security;
alter table public.developer_impersonation_grants force row level security;
alter table public.developer_projects enable row level security;
alter table public.developers enable row level security;
alter table public.export_logs enable row level security;
alter table public.gift_claims enable row level security;
alter table public.gift_claims force row level security;
alter table public.gift_eligibilities enable row level security;
alter table public.gift_eligibilities force row level security;
alter table public.gift_rules enable row level security;
alter table public.gifts enable row level security;
alter table public.gifts force row level security;
alter table public.notification_events enable row level security;
alter table public.notifications enable row level security;
alter table public.phone_verification_rate_limits enable row level security;
alter table public.phone_verification_rate_limits force row level security;
alter table public.project_favorites enable row level security;
alter table public.project_unit_types enable row level security;
alter table public.project_unit_variants enable row level security;
alter table public.properties enable row level security;
alter table public.property_expiration_events enable row level security;
alter table public.property_favorites enable row level security;
alter table public.property_inquiries enable row level security;
alter table public.property_renewal_requests enable row level security;
alter table public.referral_bonus_rules enable row level security;
alter table public.saved_properties enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_messages force row level security;
alter table public.support_tickets enable row level security;
alter table public.support_tickets force row level security;
alter table public.system_settings enable row level security;
alter table public.tasks enable row level security;
alter table public.tiers enable row level security;
alter table public.user_tiers enable row level security;
alter table public.users_profile enable row level security;
alter table public.users_profile force row level security;

-- Policies
create policy admin_activity_read on public.admin_activity_log as permissive for select to authenticated
  using (true);

create policy admin_activity_service_role on public.admin_activity_log as permissive for all to service_role
  using (true)
  with check (true);

create policy admin_rules_admin_manage on public.admin_rules as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (a.is_active = true)))));

create policy admin_rules_service_role on public.admin_rules as permissive for all to service_role
  using (true)
  with check (true);

create policy admins_self_read on public.admins as permissive for select to authenticated
  using ((( SELECT auth.uid() AS uid) = id));

create policy admins_service_role on public.admins as permissive for all to service_role
  using (true)
  with check (true);

create policy agent_badges_admin_delete on public.agent_badges as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy agent_badges_admin_insert on public.agent_badges as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy agent_badges_admin_update on public.agent_badges as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy agent_badges_agent_read_own on public.agent_badges as permissive for select to authenticated
  using (((( SELECT auth.uid() AS uid) = agent_id) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy "Agents can manage their own conversations" on public.ai_chat_conversations as permissive for all to public
  using ((( SELECT auth.uid() AS uid) = agent_id));

create policy "Agents can create messages in their conversations" on public.ai_chat_messages as permissive for insert to public
  with check ((conversation_id IN ( SELECT ai_chat_conversations.id
   FROM ai_chat_conversations
  WHERE (ai_chat_conversations.agent_id = ( SELECT auth.uid() AS uid)))));

create policy "Agents can view their own messages" on public.ai_chat_messages as permissive for select to public
  using ((conversation_id IN ( SELECT ai_chat_conversations.id
   FROM ai_chat_conversations
  WHERE (ai_chat_conversations.agent_id = ( SELECT auth.uid() AS uid)))));

create policy areas_public_read on public.areas as permissive for select to public
  using (true);

create policy "Admins manage badges" on public.badges as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))))
  with check ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))));

create policy "Agents can view their own commissions" on public.commissions as permissive for select to public
  using (((( SELECT auth.uid() AS uid) = agent_id) OR (( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))));

create policy commissions_admin_delete on public.commissions as permissive for delete to public
  using ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))));

create policy commissions_admin_insert on public.commissions as permissive for insert to public
  with check ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))));

create policy commissions_admin_update on public.commissions as permissive for update to public
  using ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))))
  with check ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))));

create policy "deal-stage-delete" on public.deal_stage_entries as permissive for delete to public
  using ((agent_id = ( SELECT auth.uid() AS uid)));

create policy "deal-stage-insert" on public.deal_stage_entries as permissive for insert to public
  with check ((agent_id = ( SELECT auth.uid() AS uid)));

create policy "deal-stage-select" on public.deal_stage_entries as permissive for select to public
  using (((agent_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))));

create policy "deal-stage-update" on public.deal_stage_entries as permissive for update to public
  using (((agent_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))))
  with check (((agent_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))));

create policy deal_status_history_admin_delete on public.deal_status_history as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy deal_status_history_admin_insert on public.deal_status_history as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy deal_status_history_admin_update on public.deal_status_history as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy deal_status_history_agent_read_own on public.deal_status_history as permissive for select to authenticated
  using (((EXISTS ( SELECT 1
   FROM deals d
  WHERE ((d.id = deal_status_history.deal_id) AND (d.agent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy "Admins can update deals" on public.deals as permissive for update to public
  using ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))));

create policy "Agents can create deals" on public.deals as permissive for insert to public
  with check ((( SELECT auth.uid() AS uid) = agent_id));

create policy "Agents can read their own deals" on public.deals as permissive for select to public
  using (((( SELECT auth.uid() AS uid) = agent_id) OR (( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))));

create policy developer_accounts_admin_delete on public.developer_accounts as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy developer_accounts_admin_insert on public.developer_accounts as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy developer_accounts_read_own on public.developer_accounts as permissive for select to authenticated
  using (((auth_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy developer_accounts_service_role on public.developer_accounts as permissive for all to service_role
  using (true)
  with check (true);

create policy developer_accounts_update_own on public.developer_accounts as permissive for update to authenticated
  using (((auth_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))))
  with check (((auth_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy "Admins manage developer commission rules" on public.developer_commission_rules as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))))
  with check ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))));

create policy developer_projects_public_read on public.developer_projects as permissive for select to public
  using (true);

create policy developer_projects_update on public.developer_projects as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM developer_accounts a
  WHERE ((a.developer_id = developer_projects.developer_id) AND (a.auth_user_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM developer_accounts a
  WHERE ((a.developer_id = developer_projects.developer_id) AND (a.auth_user_id = ( SELECT auth.uid() AS uid))))));

create policy developers_public_read on public.developers as permissive for select to public
  using (true);

create policy "Agents can create exports" on public.export_logs as permissive for insert to public
  with check ((( SELECT auth.uid() AS uid) = agent_id));

create policy "Agents can view their own exports" on public.export_logs as permissive for select to public
  using ((( SELECT auth.uid() AS uid) = agent_id));

create policy gift_claims_agent_select on public.gift_claims as permissive for select to authenticated
  using ((agent_id = auth.uid()));

create policy gift_eligibilities_agent_select on public.gift_eligibilities as permissive for select to authenticated
  using ((agent_id = auth.uid()));

create policy gift_rules_admin_manage on public.gift_rules as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (a.is_active = true)))));

create policy gifts_authenticated_select on public.gifts as permissive for select to authenticated
  using ((is_active = true));

create policy notification_events_admin_delete on public.notification_events as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy notification_events_admin_insert on public.notification_events as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy notification_events_admin_update on public.notification_events as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy notification_events_agent_read_own on public.notification_events as permissive for select to authenticated
  using (((( SELECT auth.uid() AS uid) = agent_id) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy "Agents can update their own notifications" on public.notifications as permissive for update to public
  using ((( SELECT auth.uid() AS uid) = agent_id));

create policy "Agents can view their own notifications" on public.notifications as permissive for select to public
  using ((( SELECT auth.uid() AS uid) = agent_id));

create policy project_favorites_mutate on public.project_favorites as permissive for all to public
  using ((agent_id = ( SELECT auth.uid() AS uid)))
  with check ((agent_id = ( SELECT auth.uid() AS uid)));

create policy project_unit_types_select on public.project_unit_types as permissive for select to public
  using (true);

create policy project_unit_variants_delete on public.project_unit_variants as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM ((project_unit_types t
     JOIN developer_projects p ON ((p.id = t.project_id)))
     JOIN developer_accounts a ON ((a.developer_id = p.developer_id)))
  WHERE ((t.id = project_unit_variants.project_unit_type_id) AND (a.auth_user_id = ( SELECT auth.uid() AS uid))))));

create policy project_unit_variants_insert on public.project_unit_variants as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM ((project_unit_types t
     JOIN developer_projects p ON ((p.id = t.project_id)))
     JOIN developer_accounts a ON ((a.developer_id = p.developer_id)))
  WHERE ((t.id = project_unit_variants.project_unit_type_id) AND (a.auth_user_id = ( SELECT auth.uid() AS uid))))));

create policy project_unit_variants_read on public.project_unit_variants as permissive for select to authenticated
  using (true);

create policy project_unit_variants_update on public.project_unit_variants as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM ((project_unit_types t
     JOIN developer_projects p ON ((p.id = t.project_id)))
     JOIN developer_accounts a ON ((a.developer_id = p.developer_id)))
  WHERE ((t.id = project_unit_variants.project_unit_type_id) AND (a.auth_user_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM ((project_unit_types t
     JOIN developer_projects p ON ((p.id = t.project_id)))
     JOIN developer_accounts a ON ((a.developer_id = p.developer_id)))
  WHERE ((t.id = project_unit_variants.project_unit_type_id) AND (a.auth_user_id = ( SELECT auth.uid() AS uid))))));

create policy "Agents can create properties" on public.properties as permissive for insert to public
  with check ((( SELECT auth.uid() AS uid) = listed_by_agent_id));

create policy "Agents can delete their own properties" on public.properties as permissive for delete to public
  using ((( SELECT auth.uid() AS uid) = listed_by_agent_id));

create policy properties_select_combined on public.properties as permissive for select to public
  using ((((approval_status = 'approved'::property_approval_status) AND (is_active = true)) OR (( SELECT auth.uid() AS uid) = listed_by_agent_id) OR (( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))));

create policy properties_update_combined on public.properties as permissive for update to public
  using ((((( SELECT auth.uid() AS uid) = listed_by_agent_id) AND (approval_status = 'pending'::property_approval_status)) OR (( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))));

create policy property_expiration_events_admin_delete on public.property_expiration_events as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy property_expiration_events_admin_insert on public.property_expiration_events as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy property_expiration_events_admin_update on public.property_expiration_events as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy property_expiration_events_agent_read_own on public.property_expiration_events as permissive for select to authenticated
  using (((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = property_expiration_events.property_id) AND (p.listed_by_agent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy property_expiration_events_service_role on public.property_expiration_events as permissive for all to service_role
  using (true)
  with check (true);

create policy property_favorites_mutate on public.property_favorites as permissive for all to public
  using ((agent_id = ( SELECT auth.uid() AS uid)))
  with check ((agent_id = ( SELECT auth.uid() AS uid)));

create policy "Agents can view inquiries on their properties" on public.property_inquiries as permissive for select to public
  using ((( SELECT auth.uid() AS uid) = agent_id));

create policy property_renewal_requests_admin_delete on public.property_renewal_requests as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy property_renewal_requests_admin_update on public.property_renewal_requests as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy property_renewal_requests_agent_insert_own on public.property_renewal_requests as permissive for insert to authenticated
  with check (((((requested_by_role)::text = 'agent'::text) AND (requested_by_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy property_renewal_requests_agent_read_own on public.property_renewal_requests as permissive for select to authenticated
  using (((((requested_by_role)::text = 'agent'::text) AND (requested_by_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy property_renewal_requests_service_role on public.property_renewal_requests as permissive for all to service_role
  using (true)
  with check (true);

create policy "Admins manage referral tiers" on public.referral_bonus_rules as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))))
  with check ((( SELECT auth.uid() AS uid) IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true))));

create policy "Agents can manage their own saved properties" on public.saved_properties as permissive for all to public
  using ((( SELECT auth.uid() AS uid) = agent_id));

create policy support_ticket_messages_agent_insert on public.support_ticket_messages as permissive for insert to authenticated
  with check (((author_type = 'agent'::text) AND (author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM support_tickets ticket
  WHERE ((ticket.id = support_ticket_messages.ticket_id) AND (ticket.agent_id = ( SELECT auth.uid() AS uid)))))));

create policy support_ticket_messages_agent_select on public.support_ticket_messages as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM support_tickets ticket
  WHERE ((ticket.id = support_ticket_messages.ticket_id) AND (ticket.agent_id = ( SELECT auth.uid() AS uid))))));

create policy support_tickets_agent_insert on public.support_tickets as permissive for insert to authenticated
  with check (((agent_id = ( SELECT auth.uid() AS uid)) AND (status = 'new'::text) AND (channel = 'in_app'::text)));

create policy support_tickets_agent_select on public.support_tickets as permissive for select to authenticated
  using ((agent_id = ( SELECT auth.uid() AS uid)));

create policy system_settings_admin_manage on public.system_settings as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (a.is_active = true)))));

create policy tasks_admin_delete on public.tasks as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy tasks_admin_insert on public.tasks as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy tasks_admin_update on public.tasks as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy tasks_agent_read_own on public.tasks as permissive for select to authenticated
  using (((( SELECT auth.uid() AS uid) = agent_id) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy tiers_admin_delete on public.tiers as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy tiers_admin_insert on public.tiers as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy tiers_admin_update on public.tiers as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy tiers_read on public.tiers as permissive for select to authenticated
  using (true);

create policy user_tiers_admin_delete on public.user_tiers as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy user_tiers_admin_insert on public.user_tiers as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy user_tiers_admin_update on public.user_tiers as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true)))));

create policy user_tiers_user_read_own on public.user_tiers as permissive for select to authenticated
  using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM admins a
  WHERE ((a.id = ( SELECT auth.uid() AS uid)) AND (a.is_active = true))))));

create policy "users-profile-select" on public.users_profile as permissive for select to authenticated
  using ((( SELECT auth.uid() AS uid) = id));

create policy "users-profile-update" on public.users_profile as permissive for update to authenticated
  using ((( SELECT auth.uid() AS uid) = id))
  with check ((( SELECT auth.uid() AS uid) = id));

create policy "admin-badge-icons" on storage.objects as permissive for all to public
  using (((bucket_id = 'badge-icons'::text) AND (auth.uid() IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))))
  with check (((bucket_id = 'badge-icons'::text) AND (auth.uid() IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))));

create policy "admin-tier-icons" on storage.objects as permissive for all to public
  using (((bucket_id = 'tier-icons'::text) AND (auth.uid() IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))))
  with check (((bucket_id = 'tier-icons'::text) AND (auth.uid() IN ( SELECT admins.id
   FROM admins
  WHERE (admins.is_active = true)))));

create policy "cil-docs-authenticated-delete" on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'cil-docs'::text) AND (owner = auth.uid())));

create policy "cil-docs-authenticated-insert" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'cil-docs'::text) AND (owner = auth.uid())));

create policy "cil-docs-authenticated-select" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'cil-docs'::text) AND (owner = auth.uid())));

create policy "cil-docs-authenticated-update" on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'cil-docs'::text) AND (owner = auth.uid())))
  with check (((bucket_id = 'cil-docs'::text) AND (owner = auth.uid())));

create policy "deal-docs-authenticated-select" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'deal-docs'::text) AND (owner = auth.uid())));

create policy "deal-docs-delete" on storage.objects as permissive for delete to public
  using (((bucket_id = 'deal-docs'::text) AND (owner = auth.uid())));

create policy "deal-docs-insert" on storage.objects as permissive for insert to public
  with check (((bucket_id = 'deal-docs'::text) AND (auth.role() = 'authenticated'::text)));

create policy "deal-docs-update" on storage.objects as permissive for update to public
  using (((bucket_id = 'deal-docs'::text) AND (owner = auth.uid())))
  with check (((bucket_id = 'deal-docs'::text) AND (owner = auth.uid())));

create policy "eoi-docs-authenticated-delete" on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'eoi-docs'::text) AND (owner = auth.uid())));

create policy "eoi-docs-authenticated-insert" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'eoi-docs'::text) AND (owner = auth.uid())));

create policy "eoi-docs-authenticated-select" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'eoi-docs'::text) AND (owner = auth.uid())));

create policy "eoi-docs-authenticated-update" on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'eoi-docs'::text) AND (owner = auth.uid())))
  with check (((bucket_id = 'eoi-docs'::text) AND (owner = auth.uid())));

create policy "profile-media agents write" on storage.objects as permissive for all to public
  using (((bucket_id = 'profile-media'::text) AND (auth.role() = 'authenticated'::text)))
  with check (((bucket_id = 'profile-media'::text) AND (auth.role() = 'authenticated'::text)));

create policy "property-docs agents write" on storage.objects as permissive for all to public
  using (((bucket_id = 'property-docs'::text) AND (auth.role() = 'authenticated'::text)))
  with check (((bucket_id = 'property-docs'::text) AND (auth.role() = 'authenticated'::text)));

create policy "reservation-docs-authenticated-delete" on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'reservation-docs'::text) AND (owner = auth.uid())));

create policy "reservation-docs-authenticated-insert" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'reservation-docs'::text) AND (owner = auth.uid())));

create policy "reservation-docs-authenticated-select" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'reservation-docs'::text) AND (owner = auth.uid())));

create policy "reservation-docs-authenticated-update" on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'reservation-docs'::text) AND (owner = auth.uid())))
  with check (((bucket_id = 'reservation-docs'::text) AND (owner = auth.uid())));

create policy "sales-claim-docs-authenticated-delete" on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'sales-claim-docs'::text) AND (owner = auth.uid())));

create policy "sales-claim-docs-authenticated-insert" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'sales-claim-docs'::text) AND (owner = auth.uid())));

create policy "sales-claim-docs-authenticated-select" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'sales-claim-docs'::text) AND (owner = auth.uid())));

create policy "sales-claim-docs-authenticated-update" on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'sales-claim-docs'::text) AND (owner = auth.uid())))
  with check (((bucket_id = 'sales-claim-docs'::text) AND (owner = auth.uid())));

create policy verification_docs_delete on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'verification-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy verification_docs_insert on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'verification-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy verification_docs_select on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'verification-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy verification_docs_update on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'verification-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
  with check (((bucket_id = 'verification-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- Table and view grants
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_activity_log to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_activity_log to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_activity_log to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_rules to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_rules to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_rules to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admins to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admins to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admins to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_badges to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_badges to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_badges to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_deal_kpis to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_deal_kpis to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_deal_kpis to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_performance to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_performance to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_performance to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_referral_stats to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_referral_stats to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.agent_referral_stats to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.ai_chat_conversations to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.ai_chat_conversations to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.ai_chat_conversations to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.ai_chat_messages to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.ai_chat_messages to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.ai_chat_messages to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.areas to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.areas to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.areas to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.badges to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.badges to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.badges to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.commissions to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.commissions to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.commissions to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deal_pipeline to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deal_pipeline to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deal_pipeline to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deal_stage_entries to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deal_stage_entries to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deal_stage_entries to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deal_status_history to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deal_status_history to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deal_status_history to service_role;
grant DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deals to anon;
grant DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deals to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.deals to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_accounts to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_accounts to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_accounts to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_commission_rules to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_commission_rules to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_commission_rules to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_contact_requests to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_impersonation_grants to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_projects to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_projects to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developer_projects to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developers to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developers to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.developers to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.export_logs to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.export_logs to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.export_logs to service_role;
grant SELECT on table public.gift_claims to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.gift_claims to service_role;
grant SELECT on table public.gift_eligibilities to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.gift_eligibilities to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.gift_rules to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.gift_rules to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.gift_rules to service_role;
grant SELECT on table public.gifts to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.gifts to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_events to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_events to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_events to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notifications to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notifications to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notifications to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.phone_verification_rate_limits to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.project_favorites to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.project_favorites to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.project_favorites to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.project_unit_types to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.project_unit_types to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.project_unit_types to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.project_unit_variants to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.project_unit_variants to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.project_unit_variants to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.properties to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.properties to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.properties to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_expiration_events to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_expiration_events to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_expiration_events to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_favorites to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_favorites to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_favorites to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_inquiries to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_inquiries to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_inquiries to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_renewal_requests to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_renewal_requests to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_renewal_requests to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_statistics to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_statistics to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.property_statistics to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.referral_bonus_rules to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.referral_bonus_rules to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.referral_bonus_rules to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.saved_properties to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.saved_properties to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.saved_properties to service_role;
grant INSERT, SELECT on table public.support_ticket_messages to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.support_ticket_messages to service_role;
grant INSERT, SELECT on table public.support_tickets to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.support_tickets to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.system_settings to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.system_settings to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.system_settings to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tasks to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tasks to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tasks to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tiers to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tiers to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tiers to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_tiers to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_tiers to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_tiers to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.users_profile to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.users_profile to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.users_profile to service_role;

-- Function grants
grant execute on function public.agent_current_tier_level(p_agent_id uuid) to PUBLIC;
grant execute on function public.agent_current_tier_level(p_agent_id uuid) to anon;
grant execute on function public.agent_current_tier_level(p_agent_id uuid) to authenticated;
grant execute on function public.agent_current_tier_level(p_agent_id uuid) to service_role;
grant execute on function public.consume_phone_verification_attempt(p_user_id uuid, p_phone text, p_limit integer, p_window_seconds integer) to service_role;
grant execute on function public.create_gift_claim(p_gift_id uuid, p_agent_id uuid) to authenticated;
grant execute on function public.create_gift_claim(p_gift_id uuid, p_agent_id uuid) to service_role;
grant execute on function public.delete_expired_exports() to PUBLIC;
grant execute on function public.delete_expired_exports() to anon;
grant execute on function public.delete_expired_exports() to authenticated;
grant execute on function public.delete_expired_exports() to service_role;
grant execute on function public.delete_old_notifications() to PUBLIC;
grant execute on function public.delete_old_notifications() to anon;
grant execute on function public.delete_old_notifications() to authenticated;
grant execute on function public.delete_old_notifications() to service_role;
grant execute on function public.enqueue_agent_notification(p_agent_id uuid, p_title text, p_message text, p_property_id uuid) to PUBLIC;
grant execute on function public.enqueue_agent_notification(p_agent_id uuid, p_title text, p_message text, p_property_id uuid) to anon;
grant execute on function public.enqueue_agent_notification(p_agent_id uuid, p_title text, p_message text, p_property_id uuid) to authenticated;
grant execute on function public.enqueue_agent_notification(p_agent_id uuid, p_title text, p_message text, p_property_id uuid) to service_role;
grant execute on function public.evaluate_admin_rules_for_agent(p_agent_id uuid) to PUBLIC;
grant execute on function public.evaluate_admin_rules_for_agent(p_agent_id uuid) to anon;
grant execute on function public.evaluate_admin_rules_for_agent(p_agent_id uuid) to authenticated;
grant execute on function public.evaluate_admin_rules_for_agent(p_agent_id uuid) to service_role;
grant execute on function public.evaluate_admin_rules_for_all() to PUBLIC;
grant execute on function public.evaluate_admin_rules_for_all() to anon;
grant execute on function public.evaluate_admin_rules_for_all() to authenticated;
grant execute on function public.evaluate_admin_rules_for_all() to service_role;
grant execute on function public.evaluate_gift_rules_for_agent(p_agent_id uuid) to service_role;
grant execute on function public.evaluate_gift_rules_for_all() to service_role;
grant execute on function public.generate_deal_reference() to PUBLIC;
grant execute on function public.generate_deal_reference() to anon;
grant execute on function public.generate_deal_reference() to authenticated;
grant execute on function public.generate_deal_reference() to service_role;
grant execute on function public.gift_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb) to PUBLIC;
grant execute on function public.gift_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb) to anon;
grant execute on function public.gift_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb) to authenticated;
grant execute on function public.gift_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb) to service_role;
grant execute on function public.grant_verified_badge() to PUBLIC;
grant execute on function public.grant_verified_badge() to anon;
grant execute on function public.grant_verified_badge() to authenticated;
grant execute on function public.grant_verified_badge() to service_role;
grant execute on function public.log_property_expiration_event(p_property_id uuid, p_target property_renewal_actor, p_target_id uuid, p_event_type text, p_message text) to PUBLIC;
grant execute on function public.log_property_expiration_event(p_property_id uuid, p_target property_renewal_actor, p_target_id uuid, p_event_type text, p_message text) to anon;
grant execute on function public.log_property_expiration_event(p_property_id uuid, p_target property_renewal_actor, p_target_id uuid, p_event_type text, p_message text) to authenticated;
grant execute on function public.log_property_expiration_event(p_property_id uuid, p_target property_renewal_actor, p_target_id uuid, p_event_type text, p_message text) to service_role;
grant execute on function public.preview_admin_rule(target_type text, target_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb) to PUBLIC;
grant execute on function public.preview_admin_rule(target_type text, target_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb) to anon;
grant execute on function public.preview_admin_rule(target_type text, target_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb) to authenticated;
grant execute on function public.preview_admin_rule(target_type text, target_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb) to service_role;
grant execute on function public.preview_gift_rule(gift_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb) to PUBLIC;
grant execute on function public.preview_gift_rule(gift_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb) to anon;
grant execute on function public.preview_gift_rule(gift_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb) to authenticated;
grant execute on function public.preview_gift_rule(gift_id uuid, metric text, time_window text, operator text, value_single numeric, value_min numeric, value_max numeric, filters jsonb) to service_role;
grant execute on function public.process_property_expirations() to PUBLIC;
grant execute on function public.process_property_expirations() to anon;
grant execute on function public.process_property_expirations() to authenticated;
grant execute on function public.process_property_expirations() to service_role;
grant execute on function public.refresh_referral_bonus_for_agent(target_referrer uuid) to PUBLIC;
grant execute on function public.refresh_referral_bonus_for_agent(target_referrer uuid) to anon;
grant execute on function public.refresh_referral_bonus_for_agent(target_referrer uuid) to authenticated;
grant execute on function public.refresh_referral_bonus_for_agent(target_referrer uuid) to service_role;
grant execute on function public.request_property_renewal(p_property_id uuid, p_actor_role property_renewal_actor, p_actor_id uuid, p_notes text) to authenticated;
grant execute on function public.request_property_renewal(p_property_id uuid, p_actor_role property_renewal_actor, p_actor_id uuid, p_notes text) to service_role;
grant execute on function public.reset_phone_verification_on_change() to PUBLIC;
grant execute on function public.reset_phone_verification_on_change() to anon;
grant execute on function public.reset_phone_verification_on_change() to authenticated;
grant execute on function public.reset_phone_verification_on_change() to service_role;
grant execute on function public.resolve_commission_rate(dev_name text, project_name text) to service_role;
grant execute on function public.review_property_renewal_request(p_request_id uuid, p_admin_id uuid, p_approve boolean, p_notes text) to service_role;
grant execute on function public.reward_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb) to PUBLIC;
grant execute on function public.reward_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb) to anon;
grant execute on function public.reward_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb) to authenticated;
grant execute on function public.reward_agent_matches_rule(p_agent_id uuid, p_metric text, p_window text, p_operator text, p_value_single numeric, p_value_min numeric, p_value_max numeric, p_filters jsonb) to service_role;
grant execute on function public.reward_metric_value(p_agent_id uuid, p_metric text, p_window text, p_filters jsonb) to PUBLIC;
grant execute on function public.reward_metric_value(p_agent_id uuid, p_metric text, p_window text, p_filters jsonb) to anon;
grant execute on function public.reward_metric_value(p_agent_id uuid, p_metric text, p_window text, p_filters jsonb) to authenticated;
grant execute on function public.reward_metric_value(p_agent_id uuid, p_metric text, p_window text, p_filters jsonb) to service_role;
grant execute on function public.reward_window_start(p_window text) to PUBLIC;
grant execute on function public.reward_window_start(p_window text) to anon;
grant execute on function public.reward_window_start(p_window text) to authenticated;
grant execute on function public.reward_window_start(p_window text) to service_role;
grant execute on function public.set_listing_publication_window() to PUBLIC;
grant execute on function public.set_listing_publication_window() to anon;
grant execute on function public.set_listing_publication_window() to authenticated;
grant execute on function public.set_listing_publication_window() to service_role;
grant execute on function public.set_sales_claim_status(p_entry_id uuid, p_status text) to authenticated;
grant execute on function public.set_sales_claim_status(p_entry_id uuid, p_status text) to service_role;
grant execute on function public.submit_agent_deal(p_deal jsonb) to authenticated;
grant execute on function public.submit_agent_deal(p_deal jsonb) to service_role;
grant execute on function public.submit_verification_documents(p_paths text[]) to authenticated;
grant execute on function public.submit_verification_documents(p_paths text[]) to service_role;
grant execute on function public.sync_support_ticket_message_activity() to service_role;
grant execute on function public.touch_deal_stage_entries() to PUBLIC;
grant execute on function public.touch_deal_stage_entries() to anon;
grant execute on function public.touch_deal_stage_entries() to authenticated;
grant execute on function public.touch_deal_stage_entries() to service_role;
grant execute on function public.touch_developer_contact_requests_updated_at() to PUBLIC;
grant execute on function public.touch_developer_contact_requests_updated_at() to anon;
grant execute on function public.touch_developer_contact_requests_updated_at() to authenticated;
grant execute on function public.touch_developer_contact_requests_updated_at() to service_role;
grant execute on function public.touch_project_unit_types_updated_at() to PUBLIC;
grant execute on function public.touch_project_unit_types_updated_at() to anon;
grant execute on function public.touch_project_unit_types_updated_at() to authenticated;
grant execute on function public.touch_project_unit_types_updated_at() to service_role;
grant execute on function public.touch_support_ticket_updated_at() to PUBLIC;
grant execute on function public.touch_support_ticket_updated_at() to anon;
grant execute on function public.touch_support_ticket_updated_at() to authenticated;
grant execute on function public.touch_support_ticket_updated_at() to service_role;
grant execute on function public.trigger_eval_admin_rules() to PUBLIC;
grant execute on function public.trigger_eval_admin_rules() to anon;
grant execute on function public.trigger_eval_admin_rules() to authenticated;
grant execute on function public.trigger_eval_admin_rules() to service_role;
grant execute on function public.trigger_eval_admin_rules_properties() to PUBLIC;
grant execute on function public.trigger_eval_admin_rules_properties() to anon;
grant execute on function public.trigger_eval_admin_rules_properties() to authenticated;
grant execute on function public.trigger_eval_admin_rules_properties() to service_role;
grant execute on function public.trigger_eval_admin_rules_referrals() to PUBLIC;
grant execute on function public.trigger_eval_admin_rules_referrals() to anon;
grant execute on function public.trigger_eval_admin_rules_referrals() to authenticated;
grant execute on function public.trigger_eval_admin_rules_referrals() to service_role;
grant execute on function public.trigger_eval_gift_rules() to PUBLIC;
grant execute on function public.trigger_eval_gift_rules() to anon;
grant execute on function public.trigger_eval_gift_rules() to authenticated;
grant execute on function public.trigger_eval_gift_rules() to service_role;
grant execute on function public.trigger_eval_gift_rules_properties() to PUBLIC;
grant execute on function public.trigger_eval_gift_rules_properties() to anon;
grant execute on function public.trigger_eval_gift_rules_properties() to authenticated;
grant execute on function public.trigger_eval_gift_rules_properties() to service_role;
grant execute on function public.update_agent_deal_stats() to PUBLIC;
grant execute on function public.update_agent_deal_stats() to anon;
grant execute on function public.update_agent_deal_stats() to authenticated;
grant execute on function public.update_agent_deal_stats() to service_role;
grant execute on function public.update_agent_earnings() to PUBLIC;
grant execute on function public.update_agent_earnings() to anon;
grant execute on function public.update_agent_earnings() to authenticated;
grant execute on function public.update_agent_earnings() to service_role;
grant execute on function public.update_referral_bonus() to PUBLIC;
grant execute on function public.update_referral_bonus() to anon;
grant execute on function public.update_referral_bonus() to authenticated;
grant execute on function public.update_referral_bonus() to service_role;
grant execute on function public.update_referral_bonus_from_deal() to PUBLIC;
grant execute on function public.update_referral_bonus_from_deal() to anon;
grant execute on function public.update_referral_bonus_from_deal() to authenticated;
grant execute on function public.update_referral_bonus_from_deal() to service_role;
grant execute on function public.update_updated_at_column() to PUBLIC;
grant execute on function public.update_updated_at_column() to anon;
grant execute on function public.update_updated_at_column() to authenticated;
grant execute on function public.update_updated_at_column() to service_role;
grant execute on function public.uuid_generate_v4() to PUBLIC;
grant execute on function public.uuid_generate_v4() to anon;
grant execute on function public.uuid_generate_v4() to authenticated;
grant execute on function public.uuid_generate_v4() to service_role;

-- Comments
comment on column public.developer_projects.payment_plan_templates is 'Structured reusable payment plans for developer projects';
comment on column public.developer_projects.limited_time_offers is 'Structured limited-time offers layered on top of original plans';
comment on column public.developer_projects.launch_status is 'Controls whether the project should appear as a live, new launch, or upcoming launch.';

-- Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('badge-icons', 'badge-icons', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('cil-docs', 'cil-docs', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('deal-docs', 'deal-docs', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('developer-logos', 'developer-logos', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('developer-project-brochures', 'developer-project-brochures', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('developer-project-images', 'developer-project-images', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('developer-project-unit-images', 'developer-project-unit-images', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('developer-project-videos', 'developer-project-videos', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('developer-project-voice-notes', 'developer-project-voice-notes', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('eoi-docs', 'eoi-docs', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('EXPO_PUBLIC_SUPABASE_DEAL_BUCKET', 'EXPO_PUBLIC_SUPABASE_DEAL_BUCKET', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('gift-icons', 'gift-icons', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('profile-media', 'profile-media', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('property-docs', 'property-docs', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('reservation-docs', 'reservation-docs', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('sales-claim-docs', 'sales-claim-docs', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('tier-icons', 'tier-icons', 't', null, null) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('verification-docs', 'verification-docs', 'f', 5242880, '{image/*,application/pdf}'::text[]) on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

-- Realtime publication membership


commit;
