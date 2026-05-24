export interface City {
  name: string
  displayName: string
  lat: number
  lon: number
  country: string
  admin1?: string
  alternateNames?: string[]
}

export interface LivedCity extends City {
  start: string
  end: string | null
}

export interface KundliInput {
  birthDate: string
  birthCity: City
  livedCities: LivedCity[]
}

export interface ResidenceRow {
  id: string
  city: City | null
  range: [number, number]
}
