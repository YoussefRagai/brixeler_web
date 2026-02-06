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
  label: string;
  finishing_status?: string | null;
  description?: string | null;
  hero_image_url?: string | null;
  project_unit_variants?: ProjectUnitVariant[] | null;
};

export type ProjectUnitVariant = {
  id: string;
  project_unit_type_id: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  min_price: number;
  unit_area_min?: number | null;
  unit_area_max?: number | null;
  down_payment_percent?: number | null;
  installment_years?: number | null;
  stock_count?: number | null;
  description?: string | null;
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
      .select("id, property_name, price, approval_status, visibility_status, updated_at, inquiries_count, expires_at, published_at, renewal_status")
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
      visibility: row.visibility_status ?? "public",
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
        "id, property_name, price, approval_status, visibility_status, updated_at, inquiries_count, expires_at, published_at, renewal_status, sale_type, project_id, developer_projects!inner(id, developer_id)",
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
      visibility: row.visibility_status ?? "public",
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
        "id, property_name, price, description, visibility_status, amenities, photos, specific_location, expires_at, renewal_status, property_type, sale_type, bedrooms, bathrooms, unit_area, down_payment_percentage, installment_years, monthly_installment, delivery_date, finishing_status, floor_plan_url, video_tour_url"
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
    property_name: payload.name,
    specific_location: payload.area ?? null,
    price: payload.price,
    description: payload.description ?? "Submitted via developer console",
    photos,
    cover_photo_url: photos[0],
    approval_status: "pending",
    visibility_status: "public",
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
      visibility_status: payload.visibility,
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
  const id = assertDeveloperId(developerId);
  const { error } = await supabaseServer
    .from("properties")
    .update({ visibility_status: visibility })
    .eq("developer_id", id)
    .eq("id", listingId);
  return { error };
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
    renewal_status?: string | null;
    approval_status?: string | null;
    developer_id?: string | null;
    developers?: { name?: string | null } | { name?: string | null }[] | null;
  } | null;
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

  return data.map((row: any) => ({
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
      .select("id, name, description, amenities, hero_media, voice_notes, video_links, project_unit_types(id, project_id, label, finishing_status, hero_image_url, description, project_unit_variants(id, project_unit_type_id, bedrooms, bathrooms, min_price, unit_area_min, unit_area_max, down_payment_percent, installment_years, stock_count, description, amenities))")
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
    label: string;
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
      label: payload.label,
      min_price: 0,
      unit_area_min: null,
      unit_area_max: null,
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
    bedrooms?: number;
    bathrooms?: number;
    minPrice: number;
    unitAreaMin?: number;
    unitAreaMax?: number;
    downPaymentPercent?: number;
    installmentYears?: number;
    stockCount?: number;
    description?: string;
    amenities?: string[];
  },
) {
  const developer = assertDeveloperId(developerId);
  const { data: unitType, error: unitTypeError } = await supabaseServer
    .from("project_unit_types")
    .select("id, project_id, developer_projects!inner(developer_id)")
    .eq("id", unitTypeId)
    .maybeSingle();
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
      bedrooms: payload.bedrooms ?? null,
      bathrooms: payload.bathrooms ?? null,
      min_price: payload.minPrice,
      unit_area_min: payload.unitAreaMin ?? null,
      unit_area_max: payload.unitAreaMax ?? null,
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
  const { data: unitType } = await supabaseServer
    .from("project_unit_types")
    .select("id, developer_projects!inner(developer_id)")
    .eq("id", variant.project_unit_type_id)
    .maybeSingle();
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

export async function findDeveloperAccountByUser(authUserId: string) {
  if (!authUserId) return null;
  const { data, error } = await supabaseServer
    .from("developer_accounts")
    .select("developer_id, developers(name)")
    .eq("auth_user_id", authUserId)
    .single();
  if (error || !data) {
    console.warn("Developer account lookup failed", error);
    return null;
  }
  const developerRelation = Array.isArray(data.developers) ? data.developers[0] : data.developers;
  return {
    developerId: data.developer_id as string,
    developerName: developerRelation?.name ?? null,
  };
}
