/**
 * Services Catalogue Service
 * 
 * Handles fetching the public service catalogue including categories,
 * services, options, and materials.
 * 
 * RLS allows public read access to these tables (USING (true))
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface ServiceCategory {
  id: string
  name: string
  slug: string
  description: string | null
  icon_key: string | null
  is_active: boolean
  sort_order: number
  /** Absent until migration 119 is applied; treat a missing value as bookable. */
  availability?: string
  created_at: string
  updated_at: string
}

export interface ServiceOption {
  id: string
  service_id: string
  name: string
  option_type: string
  is_required: boolean
  sort_order: number
}

export interface ServiceOptionValue {
  id: string
  service_option_id: string
  label: string
  value: string
  price_modifier: number | null
  is_active: boolean
  sort_order: number
}

export interface Service {
  id: string
  category_id: string
  name: string
  slug: string
  description: string | null
  pricing_model: 'fixed' | 'inspection' | 'quote_after_inspection'
  base_price: number | null
  inspection_fee: number | null
  estimated_duration_minutes: number | null
  requires_inspection: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ServiceWithOptions extends Service {
  options: (ServiceOption & {
    values: ServiceOptionValue[]
  })[]
}

export interface Brand {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface Material {
  id: string
  name: string
  brand_id: string | null
  specification: string | null
  unit: string
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Maps the joined `service_options` / `service_option_values` rows onto the `options[].values` shape. */
function withOptions<S extends { service_options: Array<{ service_option_values: unknown[] }> }>(service: S) {
  type O = S['service_options'][number];
  return {
    ...service,
    options: service.service_options.map((o: O) => ({ ...o, values: o.service_option_values as O['service_option_values'] })),
  };
}

/**
 * Fetch all active service categories that customers can book now. Filtering happens in code, not in
 * the query, so the page keeps working before the availability column exists.
 */
export async function getServiceCategories(): Promise<ServiceCategory[]> {
  return (await loadActiveCategories()).filter((c) => c.availability !== 'coming_soon')
}

/** Categories we plan to offer but cannot yet serve. Shown as "coming soon", never as bookable. */
export async function getComingSoonCategories(): Promise<ServiceCategory[]> {
  return (await loadActiveCategories()).filter((c) => c.availability === 'coming_soon')
}

/** Memoised per request, so the bookable and coming-soon lists share one query. */
const loadActiveCategories = cache(async (): Promise<ServiceCategory[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Error fetching service categories:', error)
    throw new Error(`Failed to fetch service categories: ${error.message}`)
  }

  return (data || []) as ServiceCategory[]
})

/**
 * Fetch a single category with all its services and options
 */
export async function getServiceCategory(categoryId: string): Promise<{
  category: ServiceCategory
  services: ServiceWithOptions[]
} | null> {
  const supabase = await createClient()

  // Get category
  const { data: categoryData, error: categoryError } = await supabase
    .from('service_categories')
    .select('*')
    .eq('id', categoryId)
    .eq('is_active', true)
    .single()

  if (categoryError) {
    console.error('Error fetching category:', categoryError)
    return null
  }

  // Get services for this category with options
  const { data: servicesData, error: servicesError } = await supabase
    .from('services')
    .select(
      `
      *,
      service_options (
        *,
        service_option_values (*)
      )
    `
    )
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (servicesError) {
    console.error('Error fetching services:', servicesError)
    throw new Error(`Failed to fetch services: ${servicesError.message}`)
  }

  // Map service_options to options key
  const mappedServices = (servicesData || []).map((svc) => withOptions(svc) as ServiceWithOptions);

  return {
    category: categoryData,
    services: mappedServices,
  }
}

/**
 * Fetch a single service with all its options
 */
export async function getService(serviceId: string): Promise<ServiceWithOptions | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('services')
    .select(
      `
      *,
      service_options (
        *,
        service_option_values (*)
      )
    `
    )
    .eq('id', serviceId)
    .eq('is_active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching service:', error)
    throw new Error(`Failed to fetch service: ${error.message}`)
  }

  // Map service_options to options key
  // pricing_model is a plain string column; the app type narrows it to the allowed values.
  return data ? (withOptions(data) as ServiceWithOptions) : null
}

/**
 * Search services by category and name
 */
export async function searchServices(
  categoryId?: string,
  searchTerm?: string
): Promise<Service[]> {
  const supabase = await createClient()

  let query = supabase
    .from('services')
    .select('*')
    .eq('is_active', true)

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  if (searchTerm) {
    query = query.ilike('name', `%${searchTerm}%`)
  }

  const { data, error } = await query.order('name', { ascending: true })

  if (error) {
    console.error('Error searching services:', error)
    throw new Error(`Failed to search services: ${error.message}`)
  }

  return (data || []) as Service[]
}

/**
 * Get all brands (for material selection)
 */
export async function getBrands(): Promise<Brand[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching brands:', error)
    throw new Error(`Failed to fetch brands: ${error.message}`)
  }

  return data || []
}

/**
 * Get materials for a service
 */
export async function getServiceMaterials(serviceId: string): Promise<Material[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('service_materials')
    .select(
      `
      material_id,
      is_customer_selectable,
      materials (*)
    `
    )
    .eq('service_id', serviceId)
    .eq('is_customer_selectable', true)

  if (error) {
    console.error('Error fetching service materials:', error)
    throw new Error(`Failed to fetch service materials: ${error.message}`)
  }

  // Flatten the response
  return (data || [])
    .map((item) => item.materials)
    .filter((m: Material | null) => m !== null && m.is_active)
}

/**
 * Get full catalogue (all categories with services)
 * This is a heavy query - consider pagination for production
 */
export async function getFullCatalogue(): Promise<
  (ServiceCategory & {
    services: ServiceWithOptions[]
  })[]
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('service_categories')
    .select(
      `
      *,
      services (
        *,
        service_options (
          *,
          service_option_values (*)
        )
      )
    `
    )
    .eq('is_active', true)
    .eq('services.is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Error fetching full catalogue:', error)
    throw new Error(`Failed to fetch catalogue: ${error.message}`)
  }

  // Map service_options to options key for each service
  const mappedData = (data || []).map((category) => ({
    ...category,
    services: (category.services || []).map((svc) => withOptions(svc) as ServiceWithOptions),
  }));

  return mappedData
}

/**
 * Get service pricing info
 * Useful for booking flow calculation
 */
export async function getServicePricing(serviceId: string): Promise<{
  pricingModel: string
  basePrice: number | null
  inspectionFee: number | null
} | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('services')
    .select('pricing_model, base_price, inspection_fee')
    .eq('id', serviceId)
    .single()

  if (error) {
    console.error('Error fetching service pricing:', error)
    return null
  }

  return {
    pricingModel: data.pricing_model,
    basePrice: data.base_price,
    inspectionFee: data.inspection_fee,
  }
}
