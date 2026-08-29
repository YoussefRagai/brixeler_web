export const GROWTH_LIFECYCLE_STATES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "archived",
] as const;

export type GrowthLifecycleState = (typeof GROWTH_LIFECYCLE_STATES)[number];

export const GROWTH_APPROVAL_STATES = ["not_required", "pending", "approved", "rejected"] as const;
export type GrowthApprovalState = (typeof GROWTH_APPROVAL_STATES)[number];

export const GROWTH_METRICS = [
  "deals_count",
  "deals_volume",
  "revenue",
  "referrals",
  "claim_acceptance",
  "listings_count",
] as const;

export type GrowthMetric = (typeof GROWTH_METRICS)[number];
export const GROWTH_TIME_WINDOWS = ["all_time", "last_30d", "last_90d", "quarter", "year"] as const;
export type GrowthTimeWindow = (typeof GROWTH_TIME_WINDOWS)[number];
export const GROWTH_OPERATORS = [">=", "<=", "between", "top_n", "top_percent"] as const;
export type GrowthOperator = (typeof GROWTH_OPERATORS)[number];

export type GrowthRuleInput = {
  gift_id?: string;
  target_type?: "tier" | "badge";
  target_id?: string;
  audience_id?: string | null;
  metric: GrowthMetric;
  time_window: GrowthTimeWindow;
  operator: GrowthOperator;
  value_single?: number | null;
  value_min?: number | null;
  value_max?: number | null;
  filters: Record<string, unknown>;
  lifecycle_state?: GrowthLifecycleState;
  start_at?: string | null;
  end_at?: string | null;
};

export type GrowthAudienceCondition = {
  field: string;
  operator: string;
  value: unknown;
  max?: unknown;
  time_window?: GrowthTimeWindow;
  filters?: Record<string, unknown>;
  mode?: "include" | "exclude";
};

export type GrowthAudienceDefinition = {
  match: "all" | "any";
  conditions: GrowthAudienceCondition[];
  agent_ids?: string[];
};

export type GrowthAudienceInput = {
  key?: string | null;
  name: string;
  name_ar?: string | null;
  description?: string | null;
  description_ar?: string | null;
  definition: GrowthAudienceDefinition;
  lifecycle_state?: GrowthLifecycleState;
  start_at?: string | null;
  end_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type GrowthValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const MAX_JSON_BODY_BYTES = 1_000_000;
const MAX_FILTER_BYTES = 16_000;
const MAX_AUDIENCE_BYTES = 24_000;

const PROFILE_FIELDS = new Set([
  "agent_id",
  "agent_ids",
  "verification_status",
  "account_status",
  "status",
  "language_preference",
  "total_deals",
  "total_referrals",
  "verified_referrals",
  "base_commission_rate",
  "tier_level",
  "current_tier_level",
  "tier_id",
  "developer_name",
  "project_id",
  "property_type",
  ...GROWTH_METRICS,
]);

const PROFILE_OPERATORS = new Set([
  "equals",
  "eq",
  "=",
  "not_equals",
  "neq",
  "<>",
  "in",
  "not_in",
  "gte",
  ">=",
  "lte",
  "<=",
  "gt",
  "lt",
  "between",
  "contains",
]);

const NUMERIC_PROFILE_OPERATORS = new Set([
  "equals",
  "eq",
  "=",
  "not_equals",
  "neq",
  "<>",
  "gte",
  ">=",
  "lte",
  "<=",
  "gt",
  "lt",
  "between",
]);

const TEXT_PROFILE_OPERATORS = new Set([
  "equals",
  "eq",
  "=",
  "not_equals",
  "neq",
  "<>",
  "in",
  "not_in",
]);

const MEMBERSHIP_OPERATORS = new Set([
  "equals",
  "eq",
  "=",
  "not_equals",
  "neq",
  "<>",
  "in",
  "not_in",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function isGrowthUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function text(value: unknown, field: string, max: number, required = false): GrowthValidationResult<string | null> {
  if (value === null || value === undefined) {
    return required ? { ok: false, error: `${field} is required` } : { ok: true, value: null };
  }
  if (typeof value !== "string") return { ok: false, error: `${field} must be text` };
  const trimmed = value.trim();
  if (required && trimmed.length === 0) return { ok: false, error: `${field} is required` };
  if (trimmed.length > max) return { ok: false, error: `${field} is too long` };
  return { ok: true, value: trimmed || null };
}

function numberValue(value: unknown, field: string, options?: { integer?: boolean; min?: number; max?: number }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false as const, error: `${field} must be a finite number` };
  if (options?.integer && !Number.isInteger(value)) return { ok: false as const, error: `${field} must be an integer` };
  if (options?.min !== undefined && value < options.min) return { ok: false as const, error: `${field} is below the minimum` };
  if (options?.max !== undefined && value > options.max) return { ok: false as const, error: `${field} is above the maximum` };
  return { ok: true as const, value };
}

function dateValue(value: unknown, field: string): GrowthValidationResult<string | null> {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || (!ISO_DATE_PATTERN.test(value) && !LOCAL_DATE_PATTERN.test(value)) || Number.isNaN(Date.parse(value))) {
    return { ok: false, error: `${field} must be an ISO-8601 timestamp` };
  }
  return { ok: true, value: new Date(value).toISOString() };
}

export function parseLifecycleFields(payload: Record<string, unknown>, defaultState: GrowthLifecycleState = "draft") {
  const rawState = payload.lifecycle_state ?? payload.lifecycleState ?? payload.lifecycle_status ?? payload.lifecycleStatus ?? payload.status ?? defaultState;
  if (typeof rawState !== "string" || !(GROWTH_LIFECYCLE_STATES as readonly string[]).includes(rawState)) {
    return { ok: false as const, error: "Invalid lifecycle state" };
  }
  const start = dateValue(payload.start_at ?? payload.startAt ?? payload.starts_at ?? payload.startsAt ?? null, "start_at");
  if (!start.ok) return start;
  const end = dateValue(payload.end_at ?? payload.endAt ?? payload.ends_at ?? payload.endsAt ?? null, "end_at");
  if (!end.ok) return end;
  if (start.value && end.value && Date.parse(end.value) <= Date.parse(start.value)) {
    return { ok: false as const, error: "end_at must be after start_at" };
  }
  if (rawState === "scheduled" && !start.value) {
    return { ok: false as const, error: "Scheduled resources require start_at" };
  }
  return { ok: true as const, value: { lifecycle_state: rawState as GrowthLifecycleState, start_at: start.value, end_at: end.value } };
}

function parseObject(value: unknown, field: string, maxBytes: number): GrowthValidationResult<Record<string, unknown>> {
  if (!isRecord(value)) return { ok: false, error: `${field} must be an object` };
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, error: `${field} is not serializable` };
  }
  if (serialized.length > maxBytes) return { ok: false, error: `${field} is too large` };
  return { ok: true, value };
}

export function parseFilters(value: unknown): GrowthValidationResult<Record<string, unknown>> {
  const parsed = parseObject(value ?? {}, "filters", MAX_FILTER_BYTES);
  if (!parsed.ok) return parsed;
  const allowed = new Set(["developer_name", "developer_id", "project_id", "property_type"]);
  for (const key of Object.keys(parsed.value)) {
    if (!allowed.has(key)) return { ok: false, error: `Unsupported filter: ${key}` };
    if (key.endsWith("_id") && parsed.value[key] !== null && !isGrowthUuid(parsed.value[key])) {
      return { ok: false, error: `${key} must be a UUID` };
    }
    if (key === "developer_name" || key === "property_type") {
      if (typeof parsed.value[key] !== "string" || parsed.value[key].trim().length === 0 || parsed.value[key].length > 160) {
        return { ok: false, error: `${key} must be a non-blank string` };
      }
    }
  }
  return parsed;
}

export function parseGrowthRule(payload: unknown): GrowthValidationResult<GrowthRuleInput> {
  if (!isRecord(payload)) return { ok: false, error: "Rule payload must be an object" };
  const metric = payload.metric;
  const timeWindow = payload.time_window ?? payload.timeWindow;
  const operator = payload.operator;
  if (typeof metric !== "string" || !(GROWTH_METRICS as readonly string[]).includes(metric)) return { ok: false, error: "Invalid metric" };
  if (typeof timeWindow !== "string" || !(GROWTH_TIME_WINDOWS as readonly string[]).includes(timeWindow)) return { ok: false, error: "Invalid time window" };
  if (typeof operator !== "string" || !(GROWTH_OPERATORS as readonly string[]).includes(operator)) return { ok: false, error: "Invalid operator" };
  const filters = parseFilters(payload.filters);
  if (!filters.ok) return filters;

  const result: GrowthRuleInput = {
    metric: metric as GrowthMetric,
    time_window: timeWindow as GrowthTimeWindow,
    operator: operator as GrowthOperator,
    filters: filters.value,
  };
  if (payload.audience_id !== undefined && payload.audience_id !== null && !isGrowthUuid(payload.audience_id)) return { ok: false, error: "audience_id must be a UUID" };
  if (payload.gift_id !== undefined && !isGrowthUuid(payload.gift_id)) return { ok: false, error: "gift_id must be a UUID" };
  if (payload.target_id !== undefined && !isGrowthUuid(payload.target_id)) return { ok: false, error: "target_id must be a UUID" };
  if (payload.target_type !== undefined && payload.target_type !== "tier" && payload.target_type !== "badge") return { ok: false, error: "Invalid target_type" };
  if (payload.gift_id) result.gift_id = payload.gift_id as string;
  if (payload.target_id) result.target_id = payload.target_id as string;
  if (payload.target_type) result.target_type = payload.target_type as "tier" | "badge";
  result.audience_id = payload.audience_id === null ? null : (payload.audience_id as string | undefined);

  const single = payload.value_single ?? payload.value;
  const min = payload.value_min ?? payload.min;
  const max = payload.value_max ?? payload.max;
  if (operator === "between") {
    const minResult = numberValue(min, "value_min");
    const maxResult = numberValue(max, "value_max");
    if (!minResult.ok) return minResult;
    if (!maxResult.ok) return maxResult;
    if (minResult.value > maxResult.value) return { ok: false, error: "value_min must be <= value_max" };
    result.value_min = minResult.value;
    result.value_max = maxResult.value;
  } else {
    const singleResult = numberValue(single, "value_single", { min: 0, max: operator === "top_percent" ? 100 : undefined, integer: operator === "top_n" });
    if (!singleResult.ok) return singleResult;
    if (operator === ">=" && singleResult.value === 0) return { ok: false, error: "A >= 0 rule is too broad" };
    if (operator === "top_percent" && singleResult.value === 100) return { ok: false, error: "A 100% rule is too broad" };
    if (operator === "top_n" && singleResult.value < 1) return { ok: false, error: "top_n must be at least 1" };
    result.value_single = singleResult.value;
  }

  const lifecycle = parseLifecycleFields(payload, "draft");
  if (!lifecycle.ok) return lifecycle;
  return { ok: true, value: { ...result, ...lifecycle.value } };
}

export function parseAudienceDefinition(value: unknown): GrowthValidationResult<GrowthAudienceDefinition> {
  const parsed = parseObject(value, "definition", MAX_AUDIENCE_BYTES);
  if (!parsed.ok) return parsed as GrowthValidationResult<GrowthAudienceDefinition>;
  const definition = parsed.value;
  const match = definition.match;
  if (match !== "all" && match !== "any") return { ok: false, error: "definition.match must be all or any" };
  if (!Array.isArray(definition.conditions) || definition.conditions.length < 1 || definition.conditions.length > 50) {
    return { ok: false, error: "definition.conditions must contain between 1 and 50 conditions" };
  }
  const conditions: GrowthAudienceCondition[] = [];
  for (const candidate of definition.conditions) {
    if (!isRecord(candidate)) return { ok: false, error: "Each audience condition must be an object" };
    const field = candidate.field;
    const operator = candidate.operator;
    const mode = candidate.mode ?? "include";
    if (typeof field !== "string" || !PROFILE_FIELDS.has(field)) return { ok: false, error: `Unsupported audience field: ${String(field)}` };
    if (typeof operator !== "string" || !PROFILE_OPERATORS.has(operator)) return { ok: false, error: `Unsupported audience operator: ${String(operator)}` };
    if (mode !== "include" && mode !== "exclude") return { ok: false, error: "Audience condition mode must be include or exclude" };
    if (!hasOwn(candidate, "value") || candidate.value === null || candidate.value === "") return { ok: false, error: `Audience condition ${field} needs a value` };
    const isMetric = (GROWTH_METRICS as readonly string[]).includes(field);
    const isNumericProfileField = isMetric || field === "total_deals" || field === "total_referrals" || field === "verified_referrals" || field === "base_commission_rate" || field === "tier_level" || field === "current_tier_level";
    const isMembershipField = field === "agent_id" || field === "agent_ids" || field === "tier_id" || field === "project_id";
    const isContainsField = field === "language_preference" || field === "developer_name" || field === "property_type";
    const allowedOperators = isNumericProfileField
      ? NUMERIC_PROFILE_OPERATORS
      : isMembershipField
        ? MEMBERSHIP_OPERATORS
        : isContainsField
          ? new Set([...TEXT_PROFILE_OPERATORS, "contains"])
          : TEXT_PROFILE_OPERATORS;
    if (!allowedOperators.has(operator)) return { ok: false, error: `${field} does not support ${operator}` };
    if ((operator === "in" || operator === "not_in") && (!Array.isArray(candidate.value) || candidate.value.length < 1 || candidate.value.length > 100)) {
      return { ok: false, error: `${field} ${operator} needs between 1 and 100 values` };
    }
    const timeWindow = candidate.time_window ?? candidate.timeWindow;
    if (isNumericProfileField) {
      if (timeWindow !== undefined && (typeof timeWindow !== "string" || !(GROWTH_TIME_WINDOWS as readonly string[]).includes(timeWindow))) return { ok: false, error: "Invalid audience time window" };
      const filters = parseFilters(candidate.filters);
      if (!filters.ok) return filters;
      const numericCandidate = typeof candidate.value === "number" ? candidate.value : typeof candidate.value === "string" && candidate.value.trim() !== "" ? Number(candidate.value) : Number.NaN;
      if (!Number.isFinite(numericCandidate) || ([">=", "gte"].includes(operator) && numericCandidate === 0)) return { ok: false, error: `${field} needs a positive numeric value` };
      let numericMax: number | undefined;
      if (operator === "between") {
        numericMax = typeof candidate.max === "number" ? candidate.max : typeof candidate.max === "string" && candidate.max.trim() !== "" ? Number(candidate.max) : Number.NaN;
        if (!Number.isFinite(numericMax) || numericCandidate > numericMax) return { ok: false, error: `${field} between needs a valid max` };
      }
      conditions.push({ field, operator, value: numericCandidate, max: numericMax, time_window: (timeWindow as GrowthTimeWindow | undefined) ?? "all_time", filters: filters.value, mode });
    } else {
      if (operator === "contains" && typeof candidate.value !== "string") return { ok: false, error: `${field} contains needs text` };
      if (["equals", "eq", "=", "not_equals", "neq", "<>", "contains"].includes(operator) && typeof candidate.value !== "string") return { ok: false, error: `${field} needs text` };
      if (isMembershipField) {
        const values = Array.isArray(candidate.value) ? candidate.value : [candidate.value];
        if (values.some((entry) => !isGrowthUuid(entry))) return { ok: false, error: `${field} values must be UUIDs` };
      }
      conditions.push({ field, operator, value: candidate.value, max: candidate.max, mode });
    }
  }
  return { ok: true, value: { match, conditions } };
}

export function parseGrowthAudience(payload: unknown): GrowthValidationResult<GrowthAudienceInput> {
  if (!isRecord(payload)) return { ok: false, error: "Audience payload must be an object" };
  const name = text(payload.name, "name", 160, true);
  if (!name.ok || !name.value) return { ok: false, error: name.ok ? "name is required" : name.error };
  const key = payload.key === undefined ? { ok: true as const, value: null } : text(payload.key, "key", 80, true);
  if (!key.ok) return key;
  const nameAr = text(payload.name_ar, "name_ar", 160);
  if (!nameAr.ok) return nameAr;
  const description = text(payload.description, "description", 2000);
  if (!description.ok) return description;
  const descriptionAr = text(payload.description_ar, "description_ar", 2000);
  if (!descriptionAr.ok) return descriptionAr;
  const definition = parseAudienceDefinition(payload.definition);
  if (!definition.ok) return definition;
  const lifecycle = parseLifecycleFields(payload, "draft");
  if (!lifecycle.ok) return lifecycle;
  const metadata = parseObject(payload.metadata ?? {}, "metadata", MAX_FILTER_BYTES);
  if (!metadata.ok) return metadata;
  return {
    ok: true,
    value: {
      key: key.value,
      name: name.value,
      name_ar: nameAr.value,
      description: description.value,
      description_ar: descriptionAr.value,
      definition: definition.value,
      ...lifecycle.value,
      metadata: metadata.value,
    },
  };
}

export function parseApprovalInput(payload: unknown): GrowthValidationResult<{
  entity_type: "audience" | "gift" | "gift_rule" | "admin_rule" | "tier" | "badge" | "notification_campaign";
  entity_id: string;
  decision: "approved" | "rejected";
  rejection_reason: string | null;
}> {
  if (!isRecord(payload)) return { ok: false, error: "Approval payload must be an object" };
  const entityType = payload.entity_type;
  if (!["audience", "gift", "gift_rule", "admin_rule", "tier", "badge", "notification_campaign"].includes(String(entityType))) return { ok: false, error: "Invalid approval entity type" };
  if (!isGrowthUuid(payload.entity_id)) return { ok: false, error: "entity_id must be a UUID" };
  const decision = payload.decision === "approve" ? "approved" : payload.decision === "reject" ? "rejected" : payload.decision;
  if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "decision must be approve or reject" };
  const reason = text(payload.rejection_reason ?? payload.reason, "rejection_reason", 1000);
  if (!reason.ok) return reason;
  if (decision === "rejected" && !reason.value) return { ok: false, error: "rejection_reason is required when rejecting" };
  return { ok: true, value: { entity_type: entityType as "audience" | "gift" | "gift_rule" | "admin_rule" | "tier" | "badge" | "notification_campaign", entity_id: payload.entity_id, decision: decision as "approved" | "rejected", rejection_reason: reason.value } };
}

export async function readGrowthJson(request: Request): Promise<GrowthValidationResult<Record<string, unknown>>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) return { ok: false, error: "Request body is too large" };
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  if (!isRecord(body)) return { ok: false, error: "Request body must be an object" };
  return { ok: true, value: body };
}

export function parseGrowthPreview(payload: unknown): GrowthValidationResult<Record<string, unknown>> {
  if (!isRecord(payload)) return { ok: false, error: "Preview payload must be an object" };
  let limitValue = 25;
  if (payload.limit !== undefined) {
    const limit = numberValue(payload.limit, "limit", { integer: true, min: 1, max: 100 });
    if (!limit.ok) return limit;
    limitValue = limit.value;
  }
  if (payload.audience_id !== undefined && payload.audience_id !== null && !isGrowthUuid(payload.audience_id)) return { ok: false, error: "audience_id must be a UUID" };
  if (payload.target_id !== undefined && payload.target_id !== null && !isGrowthUuid(payload.target_id)) return { ok: false, error: "target_id must be a UUID" };
  if (payload.definition !== undefined) {
    const definition = parseAudienceDefinition(payload.definition);
    if (!definition.ok) return definition;
  }
  if (payload.metric !== undefined) {
    const rule = parseGrowthRule(payload);
    if (!rule.ok) return rule;
  }
  return { ok: true, value: { ...payload, limit: limitValue } };
}

export function parseClaimFormValue(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseClaimUpdate(values: {
  claimId: unknown;
  status: unknown;
  notes?: unknown;
  ownerId?: unknown;
  dueAt?: unknown;
  reference?: unknown;
}): GrowthValidationResult<{
  claim_id: string;
  status: "pending" | "approved" | "rejected" | "fulfilled" | "cancelled";
  notes: string | null;
  fulfillment_owner_id: string | null;
  fulfillment_due_at: string | null;
  fulfillment_reference: string | null;
}> {
  if (!isGrowthUuid(values.claimId)) return { ok: false, error: "claim_id must be a UUID" };
  const statuses = ["pending", "approved", "rejected", "fulfilled", "cancelled"] as const;
  if (typeof values.status !== "string" || !statuses.includes(values.status as (typeof statuses)[number])) return { ok: false, error: "Invalid claim status" };
  const notes = text(values.notes, "notes", 4000);
  if (!notes.ok) return notes;
  const reference = text(values.reference, "fulfillment_reference", 500);
  if (!reference.ok) return reference;
  const owner = values.ownerId === null || values.ownerId === undefined || values.ownerId === "" ? null : values.ownerId;
  if (owner !== null && !isGrowthUuid(owner)) return { ok: false, error: "fulfillment_owner_id must be a UUID" };
  const dueAt = dateValue(values.dueAt, "fulfillment_due_at");
  if (!dueAt.ok) return dueAt;
  return { ok: true, value: { claim_id: values.claimId, status: values.status as (typeof statuses)[number], notes: notes.value, fulfillment_owner_id: owner, fulfillment_due_at: dueAt.value, fulfillment_reference: reference.value } };
}

export function growthErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message && !/secret|password|token|key|cookie|authorization/i.test(error.message)) return error.message;
  return fallback;
}
