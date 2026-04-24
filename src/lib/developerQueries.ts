import { supabaseServer } from "./supabaseServer";

const fallbackPhotos = [
  "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
];

type ProjectMediaPayload = Record<string, unknown> | null | undefined;

export type ProjectUnitType = {
  id: string;
  project_id: string;
  category?: string | null;
  label: string;
  min_price: number;
  max_price?: number | null;
  unit_area_min?: number | null;
  unit_area_max?: number | null;
  land_area_min?: number | null;
  land_area_max?: number | null;
  finishing_status?: string | null;
  description?: string | null;
  hero_image_url?: string | null;
  project_unit_variants?: ProjectUnitVariant[] | null;
};

export type ProjectUnitVariant = {
  id: string;
  project_unit_type_id: string;
  category?: string | null;
  label?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  has_garden?: boolean | null;
  has_roof?: boolean | null;
  finishing_status?: string | null;
  delivery_date?: string | null;
  min_price: number;
  max_price?: number | null;
  unit_area_min?: number | null;
  unit_area_max?: number | null;
  land_area_min?: number | null;
  land_area_max?: number | null;
  layout_options?: string[] | null;
  down_payment_percent?: number | null;
  installment_years?: number | null;
  stock_count?: number | null;
  description?: string | null;
  amenities?: string[] | null;
};

export type StructuredPaymentPlan = {
  title?: string | null;
  down_payment_percent?: number | null;
  installment_years?: number | null;
  discount_percent?: number | null;
  payment_frequency?: string | null;
};

export type LimitedTimeOffer = StructuredPaymentPlan & {
  offer_title?: string | null;
};

function assertDeveloperId(developerId?: string) {
  if (!developerId) {
    throw new Error("Developer session missing. Please log back in.");
  }
  return developerId;
}

export type DeveloperListing = {
  id: string;
  name: string;
  price: number;
  status: string;
  visibility: string;
  updated_at: string | null;
  inquiries: number;
  expires_at: string | null;
  published_at: string | null;
  renewal_status?: string | null;
  sale_type?: string | null;
  project_id?: string | null;
};

export async function fetchDeveloperListings(developerId: string): Promise<DeveloperListing[]> {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer
      .from("properties")
      .select(
        "id, property_name, price, approval_status, updated_at, inquiries_count, expires_at, published_at, renewal_status, sale_type, project_id",
      )
      .eq("developer_id", id)
      .order("updated_at", { ascending: false });
    if (error || !data) {
      console.warn("Unable to fetch developer listings", error);
      return [];
    }
    return data.map((row) => ({
      id: row.id,
      name: row.property_name,
      price: Number(row.price ?? 0),
      status: row.approval_status ?? "pending",
      visibility: "public",
      updated_at: row.updated_at,
      inquiries: Number(row.inquiries_count ?? 0),
      expires_at: row.expires_at ?? null,
      published_at: row.published_at ?? null,
      renewal_status: row.renewal_status ?? null,
      sale_type: row.sale_type ?? null,
      project_id: row.project_id ?? null,
    }));
  } catch (error) {
    console.warn("fetchDeveloperListings fallback", error);
    return [];
  }
}

export async function fetchDeveloperResales(developerId: string): Promise<DeveloperListing[]> {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer
      .from("properties")
      .select(
        "id, property_name, price, approval_status, updated_at, inquiries_count, expires_at, published_at, renewal_status, sale_type, project_id, developer_projects!inner(id, developer_id)",
      )
      .eq("developer_projects.developer_id", id)
      .eq("sale_type", "resale")
      .order("updated_at", { ascending: false });
    if (error || !data) {
      console.warn("Unable to fetch developer resales", error);
      return [];
    }
    return data.map((row) => ({
      id: row.id,
      name: row.property_name,
      price: Number(row.price ?? 0),
      status: row.approval_status ?? "pending",
      visibility: "public",
      updated_at: row.updated_at,
      inquiries: Number(row.inquiries_count ?? 0),
      expires_at: row.expires_at ?? null,
      published_at: row.published_at ?? null,
      renewal_status: row.renewal_status ?? null,
      sale_type: row.sale_type ?? null,
      project_id: row.project_id ?? null,
    }));
  } catch (error) {
    console.warn("fetchDeveloperResales fallback", error);
    return [];
  }
}

export async function fetchDeveloperListing(listingId: string, developerId: string) {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer
      .from("properties")
      .select(
        "id, property_name, price, description, amenities, photos, specific_location, expires_at, renewal_status, property_type, sale_type, bedrooms, bathrooms, unit_area, down_payment_percentage, installment_years, monthly_installment, delivery_date, finishing_status, floor_plan_url, video_tour_url, project_id"
      )
      .eq("developer_id", id)
      .eq("id", listingId)
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.warn('fetchDeveloperListing failed', error);
    return null;
  }
}

export type DeveloperListingPayload = {
  name: string;
  area?: string;
  projectId?: string | null;
  price: number;
  description?: string;
  photoUrls: string[];
  propertyType: string;
  saleType: string;
  bedrooms: number;
  bathrooms: number;
  unitArea: number;
  downPayment: number;
  installmentYears: number;
  monthlyInstallment?: number;
  deliveryDate?: string | null;
  finishingStatus: string;
  amenities: string[];
  brochureUrl?: string | null;
  videoUrl?: string | null;
};

export async function createDeveloperListing(
  developerId: string,
  payload: DeveloperListingPayload,
) {
  const id = assertDeveloperId(developerId);
  const photos = payload.photoUrls.length >= 3 ? payload.photoUrls : fallbackPhotos;
  const monthlyInstallment =
    payload.monthlyInstallment && payload.monthlyInstallment > 0
      ? payload.monthlyInstallment
      : Math.round(payload.price / Math.max(payload.installmentYears, 1) / 12);
  const { error } = await supabaseServer.from("properties").insert({
    developer_id: id,
    project_id: payload.projectId ?? null,
    property_name: payload.name,
    specific_location: payload.area ?? null,
    price: payload.price,
    description: payload.description ?? "Submitted via developer console",
    photos,
    cover_photo_url: photos[0],
    approval_status: "pending",
    property_type: payload.propertyType,
    sale_type: payload.saleType,
    bedrooms: payload.bedrooms,
    bathrooms: payload.bathrooms,
    unit_area: payload.unitArea,
    down_payment_percentage: payload.downPayment,
    installment_years: payload.installmentYears,
    monthly_installment: monthlyInstallment,
    delivery_date: payload.deliveryDate ?? null,
    finishing_status: payload.finishingStatus,
    amenities: payload.amenities.length ? payload.amenities : ["Developer submission"],
    floor_plan_url: payload.brochureUrl ?? null,
    video_tour_url: payload.videoUrl ?? null,
  });
  return { error };
}

export async function updateDeveloperListing(
  developerId: string,
  listingId: string,
  payload: DeveloperListingPayload & { visibility: string },
) {
  const id = assertDeveloperId(developerId);
  const photos = payload.photoUrls.length >= 3 ? payload.photoUrls : fallbackPhotos;
  const monthlyInstallment =
    payload.monthlyInstallment && payload.monthlyInstallment > 0
      ? payload.monthlyInstallment
      : Math.round(payload.price / Math.max(payload.installmentYears, 1) / 12);
  const { error } = await supabaseServer
    .from("properties")
    .update({
      price: payload.price,
      description: payload.description ?? null,
      project_id: payload.projectId ?? null,
      property_type: payload.propertyType,
      sale_type: payload.saleType,
      bedrooms: payload.bedrooms,
      bathrooms: payload.bathrooms,
      unit_area: payload.unitArea,
      down_payment_percentage: payload.downPayment,
      installment_years: payload.installmentYears,
      monthly_installment: monthlyInstallment,
      delivery_date: payload.deliveryDate ?? null,
      finishing_status: payload.finishingStatus,
      amenities: payload.amenities.length ? payload.amenities : ["Developer submission"],
      floor_plan_url: payload.brochureUrl ?? null,
      video_tour_url: payload.videoUrl ?? null,
      photos,
      cover_photo_url: photos[0],
    })
    .eq("developer_id", id)
    .eq("id", listingId);
  return { error };
}

export async function toggleListingVisibility(developerId: string, listingId: string, visibility: string) {
  assertDeveloperId(developerId);
  void listingId;
  void visibility;
  return { error: null };
}

export async function deleteListing(developerId: string, listingId: string) {
  const id = assertDeveloperId(developerId);
  const { error } = await supabaseServer
    .from("properties")
    .delete()
    .eq("developer_id", id)
    .eq("id", listingId);
  return { error };
}

export async function requestListingRenewal(listingId: string, actorUserId: string | null) {
  const { error } = await supabaseServer.rpc("request_property_renewal", {
    p_property_id: listingId,
    p_actor_role: "developer",
    p_actor_id: actorUserId,
  });
  if (error) {
    console.error("Failed to request renewal", error);
    throw new Error(error.message);
  }
}

export type PropertyRenewalRequest = {
  id: string;
  status: string;
  requested_by_role: string;
  requested_at: string;
  requested_by_id?: string | null;
  notes?: string | null;
  property: {
    id: string;
    property_name: string;
    expires_at: string | null;
    unit_area?: number | null;
    price?: number | null;
    description?: string | null;
    photos?: string[] | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    property_type?: string | null;
    amenities?: string[] | null;
    renewal_status?: string | null;
    approval_status?: string | null;
    developer_id?: string | null;
    developers?: { name?: string | null } | { name?: string | null }[] | null;
  } | null;
};

type RenewalPropertyRow = {
  id: string;
  property_name: string;
  unit_area: number | null;
  price: number | null;
  description: string | null;
  photos: string[] | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string | null;
  amenities: string[] | null;
};

type RenewalRequestRow = {
  id: string;
  status: string | null;
  requested_by_role: string | null;
  requested_at: string | null;
  requested_by_id: string | null;
  notes: string | null;
  property: RenewalPropertyRow | RenewalPropertyRow[] | null;
};

export async function fetchPropertyRenewalRequests(status: string = "pending"): Promise<PropertyRenewalRequest[]> {
  const { data, error } = await supabaseServer
    .from("property_renewal_requests")
    .select(
      `
      id,
      status,
      requested_by_role,
      requested_at,
      requested_by_id,
      notes,
      property:properties (
        id,
        property_name,
        expires_at,
        unit_area,
        price,
        description,
        photos,
        bedrooms,
        bathrooms,
        property_type,
        amenities,
        renewal_status,
        approval_status,
        developer_id,
        developers (name)
      )
    `,
    )
    .eq("status", status)
    .order("requested_at", { ascending: true });

  if (error || !data) {
    console.warn("Failed to load property renewal requests", error);
    return [];
  }

  return (data as RenewalRequestRow[]).map((row) => ({
    id: row.id,
    status: row.status,
    requested_by_role: row.requested_by_role,
    requested_at: row.requested_at,
    requested_by_id: row.requested_by_id,
    notes: row.notes,
    property: Array.isArray(row.property) ? row.property[0] : row.property,
  })) as PropertyRenewalRequest[];
}

export async function reviewRenewalRequest(requestId: string, approve: boolean, adminId?: string | null, notes?: string | null) {
  const { error } = await supabaseServer.rpc("review_property_renewal_request", {
    p_request_id: requestId,
    p_admin_id: adminId ?? null,
    p_approve: approve,
    p_notes: notes ?? null,
  });
  if (error) {
    console.error("Failed to review renewal request", error);
    throw new Error(error.message);
  }
}

export async function fetchDeveloperProjects(developerId: string) {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer
      .from("developer_projects")
      .select("id, name, description, amenities, hero_media, voice_notes, video_links, location, acres, footprint, maintenance, payment_plans, payment_plan_templates, limited_time_offers, launch_status, launch_date, eoi_value_apt, eoi_value_villa, ch_fees, project_types, inventory_url, project_unit_types(id, project_id, category, label, min_price, max_price, unit_area_min, unit_area_max, land_area_min, land_area_max, finishing_status, hero_image_url, description, project_unit_variants(id, project_unit_type_id, category, label, bedrooms, bathrooms, has_garden, has_roof, finishing_status, delivery_date, min_price, max_price, unit_area_min, unit_area_max, land_area_min, land_area_max, layout_options, down_payment_percent, installment_years, stock_count, description, amenities))")
      .eq("developer_id", id)
      .order("updated_at", { ascending: false });
    if (error || !data) return [];
    return data;
  } catch (error) {
    console.warn('fetchDeveloperProjects failed', error);
    return [];
  }
}

export async function upsertDeveloperProject(
  developerId: string,
  payload: {
    id?: string;
    name: string;
    description?: string;
    location?: string;
    acres?: number | null;
    footprint?: number | null;
    maintenance?: number | null;
    payment_plans?: string;
    payment_plan_templates?: StructuredPaymentPlan[];
    limited_time_offers?: LimitedTimeOffer[];
    launch_status?: string;
    launch_date?: string | null;
    eoi_value_apt?: number | null;
    eoi_value_villa?: number | null;
    ch_fees?: number | null;
    project_types?: string[];
    inventory_url?: string | null;
    hero_media?: ProjectMediaPayload;
    voice_notes?: string[];
    video_links?: string[];
    amenities?: string[];
  },
) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer
    .from("developer_projects")
    .upsert({ ...payload, developer_id: id }, { onConflict: "id" })
    .select("id")
    .single();
  return { error, data };
}

export async function deleteDeveloperProject(developerId: string, projectId: string) {
  const id = assertDeveloperId(developerId);
  const { error } = await supabaseServer
    .from("developer_projects")
    .delete()
    .eq("developer_id", id)
    .eq("id", projectId);
  return { error };
}

export async function upsertProjectUnitType(
  developerId: string,
  projectId: string,
  payload: {
    id?: string;
    category?: string;
    label: string;
    minPrice: number;
    maxPrice?: number;
    unitAreaMin?: number;
    unitAreaMax?: number;
    landAreaMin?: number;
    landAreaMax?: number;
    finishingStatus?: string;
    description?: string;
    heroImageUrl?: string;
  },
) {
  const developer = assertDeveloperId(developerId);
  const project = await supabaseServer
    .from("developer_projects")
    .select("id, developer_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project.data || project.data.developer_id !== developer) {
    throw new Error("Unauthorized project access");
  }

  const { data, error } = await supabaseServer
    .from("project_unit_types")
    .upsert({
      id: payload.id,
      project_id: projectId,
      category: payload.category ?? null,
      label: payload.label,
      min_price: payload.minPrice,
      max_price: payload.maxPrice ?? null,
      unit_area_min: payload.unitAreaMin ?? null,
      unit_area_max: payload.unitAreaMax ?? null,
      land_area_min: payload.landAreaMin ?? null,
      land_area_max: payload.landAreaMax ?? null,
      down_payment_percent: null,
      installment_years: null,
      stock_count: null,
      finishing_status: payload.finishingStatus ?? null,
      hero_image_url: payload.heroImageUrl ?? null,
      description: payload.description ?? null,
    }, { onConflict: "id" })
    .select("id")
    .single();

  return { error, data };
}

export async function upsertProjectUnitVariant(
  developerId: string,
  unitTypeId: string,
  payload: {
    id?: string;
    category?: string;
    label?: string;
    bedrooms?: number;
    bathrooms?: number;
    hasGarden?: boolean;
    hasRoof?: boolean;
    finishingStatus?: string;
    deliveryDate?: string;
    minPrice: number;
    maxPrice?: number;
    unitAreaMin?: number;
    unitAreaMax?: number;
    landAreaMin?: number;
    landAreaMax?: number;
    layoutOptions?: string[];
    downPaymentPercent?: number;
    installmentYears?: number;
    stockCount?: number;
    description?: string;
    amenities?: string[];
  },
) {
  const developer = assertDeveloperId(developerId);
  type UnitTypeOwnerRow = {
    id: string;
    project_id: string;
    developer_projects: { developer_id: string }[] | { developer_id: string } | null;
  };
  const { data: unitType, error: unitTypeError } = await supabaseServer
    .from("project_unit_types")
    .select("id, project_id, developer_projects!inner(developer_id)")
    .eq("id", unitTypeId)
    .maybeSingle<UnitTypeOwnerRow>();
  if (unitTypeError) throw unitTypeError;
  const ownerId = Array.isArray(unitType?.developer_projects)
    ? unitType?.developer_projects?.[0]?.developer_id
    : unitType?.developer_projects?.developer_id;
  if (!unitType || ownerId !== developer) {
    throw new Error("Unauthorized unit type access");
  }

  const { error } = await supabaseServer.from("project_unit_variants").upsert(
    {
      id: payload.id,
      project_unit_type_id: unitTypeId,
      category: payload.category ?? null,
      label: payload.label ?? null,
      bedrooms: payload.bedrooms ?? null,
      bathrooms: payload.bathrooms ?? null,
      has_garden: payload.hasGarden ?? null,
      has_roof: payload.hasRoof ?? null,
      finishing_status: payload.finishingStatus ?? null,
      delivery_date: payload.deliveryDate ?? null,
      min_price: payload.minPrice,
      max_price: payload.maxPrice ?? null,
      unit_area_min: payload.unitAreaMin ?? null,
      unit_area_max: payload.unitAreaMax ?? null,
      land_area_min: payload.landAreaMin ?? null,
      land_area_max: payload.landAreaMax ?? null,
      layout_options: payload.layoutOptions?.length ? payload.layoutOptions : null,
      down_payment_percent: payload.downPaymentPercent ?? null,
      installment_years: payload.installmentYears ?? null,
      stock_count: payload.stockCount ?? null,
      description: payload.description ?? null,
      amenities: payload.amenities ?? null,
    },
    { onConflict: "id" },
  );

  return { error };
}

export async function deleteProjectUnitVariant(developerId: string, variantId: string) {
  const developer = assertDeveloperId(developerId);
  const { data: variant, error: variantError } = await supabaseServer
    .from("project_unit_variants")
    .select("id, project_unit_type_id")
    .eq("id", variantId)
    .maybeSingle();
  if (variantError) return { error: variantError };
  if (!variant) return { error: null };
  type UnitTypeOwnerRow = {
    id: string;
    developer_projects: { developer_id: string }[] | { developer_id: string } | null;
  };
  const { data: unitType } = await supabaseServer
    .from("project_unit_types")
    .select("id, developer_projects!inner(developer_id)")
    .eq("id", variant.project_unit_type_id)
    .maybeSingle<UnitTypeOwnerRow>();
  const ownerId = Array.isArray(unitType?.developer_projects)
    ? unitType?.developer_projects?.[0]?.developer_id
    : unitType?.developer_projects?.developer_id;
  if (!unitType || ownerId !== developer) {
    throw new Error("Unauthorized unit type access");
  }
  const { error } = await supabaseServer.from("project_unit_variants").delete().eq("id", variantId);
  return { error };
}

export async function deleteProjectUnitType(developerId: string, unitTypeId: string) {
  const developer = assertDeveloperId(developerId);
  const { data: existing, error: fetchError } = await supabaseServer
    .from("project_unit_types")
    .select("id, project_id")
    .eq("id", unitTypeId)
    .maybeSingle();
  if (fetchError) {
    return { error: fetchError };
  }
  if (!existing) {
    return { error: null };
  }
  const { data: project, error: projectError } = await supabaseServer
    .from("developer_projects")
    .select("developer_id")
    .eq("id", existing.project_id)
    .single();
  if (projectError || !project || project.developer_id !== developer) {
    throw new Error("Unauthorized project access");
  }
  const { error } = await supabaseServer.from("project_unit_types").delete().eq("id", unitTypeId);
  return { error };
}

export async function fetchDeveloperProfile(developerId: string) {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer
      .from("developers")
      .select("id, name, logo_url, description")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.warn('fetchDeveloperProfile failed', error);
    return null;
  }
}

export async function updateDeveloperProfile(
  developerId: string,
  payload: { name: string; logo_url?: string; description?: string },
) {
  const id = assertDeveloperId(developerId);
  const { error } = await supabaseServer
    .from("developers")
    .update(payload)
    .eq("id", id);
  return { error };
}

export async function fetchDeveloperStats(developerId: string) {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer.rpc("developer_dashboard_metrics", { dev_id: id });
    if (error || !data || !data.length) {
      return { listings: 0, hidden: 0, pending: 0, inquiries: 0 };
    }
    const row = data[0] as { listings: number; hidden: number; pending: number; inquiries: number };
    return row;
  } catch (error) {
    console.warn('fetchDeveloperStats failed', error);
    return { listings: 0, hidden: 0, pending: 0, inquiries: 0 };
  }
}

export async function findDeveloperAccountByUser(authUserId: string, options?: { includeInactive?: boolean }) {
  if (!authUserId) return null;
  const query = supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, status, developers(name)")
    .eq("auth_user_id", authUserId);
  if (!options?.includeInactive) {
    query.eq("status", "active");
  }
  const { data, error } = await query.order("invitation_sent_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) {
    console.warn("Developer account lookup failed", error);
    return null;
  }
  const developerRelation = Array.isArray(data.developers) ? data.developers[0] : data.developers;
  return {
    accountId: data.id as string,
    developerId: data.developer_id as string,
    developerName: developerRelation?.name ?? null,
    status: (data.status as string | null) ?? null,
  };
}
