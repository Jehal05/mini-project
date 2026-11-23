// Feature 51 fallback: when a case has no live location (the person never shared GPS), the search starts from the centre
// of the city on their profile. Fictional-demo scope: Pune and the areas the seed uses. [longitude, latitude].
export const CITY_CENTRES = Object.freeze({
  pune: [73.8567, 18.5204],
  kothrud: [73.8077, 18.5074],
  hadapsar: [73.926, 18.5089],
  shivajinagar: [73.8478, 18.5314],
  hinjewadi: [73.7389, 18.5912],
  pimpri: [73.7997, 18.6279],
})

/** The best known centre for an address and city, or null. Looks at the address first (an area is more precise than a city). */
export function centreFor({ address, city } = {}) {
  const text = `${address ?? ''} ${city ?? ''}`.toLowerCase()
  const key = Object.keys(CITY_CENTRES).find((k) => text.includes(k))
  return key ? { point: CITY_CENTRES[key], label: key[0].toUpperCase() + key.slice(1) } : null
}
