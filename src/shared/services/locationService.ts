/**
 * Location Service for Philippine Standard Geographic Code (PSGC) API
 * Endpoints: https://psgc.gitlab.io/api/
 * 
 * Includes in-memory caching and offline/fast-fallback data for 
 * Cagayan de Oro (Misamis Oriental, Region X) and Metro Manila (NCR).
 */

export interface LocationItem {
  code: string;
  name: string;
  displayName?: string;
  aliases?: string[];
}

export interface Region extends LocationItem {
  regionName: string;
}

export interface Province extends LocationItem {
  regionCode: string;
}

export interface CityMunicipality extends LocationItem {
  provinceCode?: string;
  regionCode?: string;
  isCity?: boolean;
}

export interface Barangay extends LocationItem {
  cityCode?: string;
}

const PSGC_BASE_URL = 'https://psgc.gitlab.io/api';
const FETCH_TIMEOUT_MS = 5000;

// In-memory cache
const cache = {
  regions: null as Region[] | null,
  provincesByRegion: new Map<string, Province[]>(),
  citiesByProvince: new Map<string, CityMunicipality[]>(),
  citiesByRegion: new Map<string, CityMunicipality[]>(),
  barangaysByCity: new Map<string, Barangay[]>(),
};

// Common city zip codes in Region X & Key cities
const ZIP_CODE_MAP: Record<string, string> = {
  '104305000': '9000', // City of Cagayan De Oro
  'cagayan de oro': '9000',
  'el salvador': '9017',
  'gingoog': '9014',
  'iligan': '9200',
  'malaybalay': '8700',
  'valencia': '8709',
  'quezon city': '1100',
  'city of manila': '1000',
  'makati': '1200',
  'taguig': '1630',
  'pasig': '1600',
  'cebu city': '6000',
  'davao city': '8000',
};

// Fast / Offline Fallbacks for SerbiSure launch hubs
export const FALLBACK_REGIONS: Region[] = [
  { code: '100000000', name: 'Region X', regionName: 'Northern Mindanao', displayName: 'Region X - Northern Mindanao' },
  { code: '130000000', name: 'NCR', regionName: 'National Capital Region', displayName: 'National Capital Region (NCR)' },
  { code: '070000000', name: 'Region VII', regionName: 'Central Visayas', displayName: 'Region VII - Central Visayas' },
  { code: '110000000', name: 'Region XI', regionName: 'Davao Region', displayName: 'Region XI - Davao Region' },
  { code: '030000000', name: 'Region III', regionName: 'Central Luzon', displayName: 'Region III - Central Luzon' },
  { code: '040000000', name: 'Region IV-A', regionName: 'CALABARZON', displayName: 'Region IV-A - CALABARZON' },
  { code: '060000000', name: 'Region VI', regionName: 'Western Visayas', displayName: 'Region VI - Western Visayas' },
  { code: '090000000', name: 'Region IX', regionName: 'Zamboanga Peninsula', displayName: 'Region IX - Zamboanga Peninsula' },
  { code: '120000000', name: 'Region XII', regionName: 'SOCCSKSARGEN', displayName: 'Region XII - SOCCSKSARGEN' },
  { code: '160000000', name: 'Region XIII', regionName: 'Caraga', displayName: 'Region XIII - Caraga' },
];

export const FALLBACK_REGION_X_PROVINCES: Province[] = [
  { code: '104300000', name: 'Misamis Oriental', regionCode: '100000000', displayName: 'Misamis Oriental' },
  { code: '101300000', name: 'Bukidnon', regionCode: '100000000', displayName: 'Bukidnon' },
  { code: '101800000', name: 'Camiguin', regionCode: '100000000', displayName: 'Camiguin' },
  { code: '103500000', name: 'Lanao del Norte', regionCode: '100000000', displayName: 'Lanao del Norte' },
  { code: '104200000', name: 'Misamis Occidental', regionCode: '100000000', displayName: 'Misamis Occidental' },
];

export const FALLBACK_MISAMIS_ORIENTAL_CITIES: CityMunicipality[] = [
  {
    code: '104305000',
    name: 'City of Cagayan De Oro',
    displayName: 'City of Cagayan De Oro (CDO)',
    provinceCode: '104300000',
    regionCode: '100000000',
    isCity: true,
    aliases: ['cdo', 'cagayan', 'cagayan de oro', 'cagayan de oro city'],
  },
  { code: '104307000', name: 'City of El Salvador', displayName: 'City of El Salvador', provinceCode: '104300000', isCity: true },
  { code: '104308000', name: 'City of Gingoog', displayName: 'City of Gingoog', provinceCode: '104300000', isCity: true },
  { code: '104301000', name: 'Alubijid', displayName: 'Alubijid', provinceCode: '104300000' },
  { code: '104302000', name: 'Balingasag', displayName: 'Balingasag', provinceCode: '104300000' },
  { code: '104303000', name: 'Balingoan', displayName: 'Balingoan', provinceCode: '104300000' },
  { code: '104304000', name: 'Binuangan', displayName: 'Binuangan', provinceCode: '104300000' },
  { code: '104306000', name: 'Claveria', displayName: 'Claveria', provinceCode: '104300000' },
  { code: '104309000', name: 'Gitagum', displayName: 'Gitagum', provinceCode: '104300000' },
  { code: '104310000', name: 'Initao', displayName: 'Initao', provinceCode: '104300000' },
  { code: '104311000', name: 'Jasaan', displayName: 'Jasaan', provinceCode: '104300000' },
  { code: '104312000', name: 'Kinoguitan', displayName: 'Kinoguitan', provinceCode: '104300000' },
  { code: '104313000', name: 'Lagonglong', displayName: 'Lagonglong', provinceCode: '104300000' },
  { code: '104314000', name: 'Laguindingan', displayName: 'Laguindingan', provinceCode: '104300000' },
  { code: '104315000', name: 'Libertad', displayName: 'Libertad', provinceCode: '104300000' },
  { code: '104316000', name: 'Lugait', displayName: 'Lugait', provinceCode: '104300000' },
  { code: '104317000', name: 'Magsaysay', displayName: 'Magsaysay', provinceCode: '104300000' },
  { code: '104318000', name: 'Manticao', displayName: 'Manticao', provinceCode: '104300000' },
  { code: '104319000', name: 'Medina', displayName: 'Medina', provinceCode: '104300000' },
  { code: '104320000', name: 'Naawan', displayName: 'Naawan', provinceCode: '104300000' },
  { code: '104321000', name: 'Opol', displayName: 'Opol', provinceCode: '104300000' },
  { code: '104322000', name: 'Salay', displayName: 'Salay', provinceCode: '104300000' },
  { code: '104323000', name: 'Sugbongcogon', displayName: 'Sugbongcogon', provinceCode: '104300000' },
  { code: '104324000', name: 'Tagoloan', displayName: 'Tagoloan', provinceCode: '104300000' },
  { code: '104325000', name: 'Talisayan', displayName: 'Talisayan', provinceCode: '104300000' },
  { code: '104326000', name: 'Villanueva', displayName: 'Villanueva', provinceCode: '104300000' },
];

// Official PSGC barangays for Misamis Oriental cities & municipalities outside CDO
const FALLBACK_MISOR_BARANGAYS_BY_CITY: Record<string, readonly string[]> = {
  '104301000': ['Baybay', 'Benigwayan', 'Calatcat', 'Lagtang', 'Lanao', 'Loguilo', 'Lourdes', 'Lumbo', 'Molocboloc', 'Poblacion', 'Sampatulog', 'Sungay', 'Talaba', 'Taparak', 'Tugasnon', 'Tula'],
  '104302000': ['Balagnan', 'Baliwagan', 'Barangay 1 (Pob.)', 'Barangay 2 (Pob.)', 'Barangay 3 (Pob.)', 'Barangay 4 (Pob.)', 'Barangay 5 (Pob.)', 'Barangay 6 (Pob.)', 'Binitinan', 'Blanco', 'Calawag', 'Camuayan', 'Cogon', 'Dansuli', 'Dumarait', 'Hermano', 'Kibanban', 'Linabu', 'Linggangao', 'Mambayaan', 'Mandangoa', 'Napaliran', 'Quezon', 'Rosario', 'Samay', 'San Francisco', 'San Isidro', 'San Juan', 'Talusan', 'Waterfall'],
  '104303000': ['Baukbauk Pob.', 'Dahilig', 'Kabangasan', 'Kabulakan', 'Kauswagan', 'Lapinig (Pob.)', 'Mantangale', 'Mapua', 'San Alonzo'],
  '104304000': ['Dampias', 'Kitamban', 'Kitambis', 'Mabini', 'Mosangot', 'Nabataan', 'Poblacion', 'Valdeconcha'],
  '104306000': ['Ani-e', 'Aposkahoy', 'Bulahan', 'Cabacungan', 'Gumaod', 'Hinaplanan', 'Kalawitan', 'Lanise', 'Luna', 'Madaguing', 'Malagana', 'Mat-i', 'Minalwang', 'Pambugas', 'Panampawan', 'Patrocenio', 'Pelaez', 'Plaridel', 'Poblacion', 'Punong', 'Rizal', 'Santa Cruz', 'Tamboboan', 'Tipolohon'],
  '104307000': ['Amoros', 'Bolisong', 'Bolobolo', 'Calongonan', 'Cogon', 'Himaya', 'Hinigdaan', 'Kalabaylabay', 'Kibonbon', 'Molugan', 'Poblacion', 'Sambulawan', 'Sinaloc', 'Taytay', 'Ulaliman'],
  '104308000': ['Agay-ayan', 'Alagatan', 'Anakan', 'Bagubad', 'Bakidbakid', 'Bal-ason', 'Bantaawan', 'Barangay 1 (Pob.)', 'Barangay 10 (Pob.)', 'Barangay 11 (Pob.)', 'Barangay 12 (Pob.)', 'Barangay 13 (Pob.)', 'Barangay 14 (Pob.)', 'Barangay 15 (Pob.)', 'Barangay 16 (Pob.)', 'Barangay 17 (Pob.)', 'Barangay 18 (Pob.)', 'Barangay 18-A (Pob.)', 'Barangay 19 (Pob.)', 'Barangay 2 (Pob.)', 'Barangay 20 (Pob.)', 'Barangay 21 (Pob.)', 'Barangay 22 (Pob.)', 'Barangay 22-A (Pob.)', 'Barangay 23 (Pob.)', 'Barangay 24 (Pob.)', 'Barangay 24-A (Pob.)', 'Barangay 25 (Pob.)', 'Barangay 26 (Pob.)', 'Barangay 3 (Pob.)', 'Barangay 4 (Pob.)', 'Barangay 5 (Pob.)', 'Barangay 6 (Pob.)', 'Barangay 7 (Pob.)', 'Barangay 8 (Pob.)', 'Barangay 9 (Pob.)', 'Binakalan', 'Capitulangan', 'Daan-Lungsod', 'Dinawehan', 'Eureka', 'Hindangon', 'Kalagonoy', 'Kalipay', 'Kamanikan', 'Kianlagan', 'Kibuging', 'Kipuntos', 'Lawaan', 'Lawit', 'Libertad', 'Libon', 'Lunao', 'Lunotan', 'Malibud', 'Malinao', 'Maribucao', 'Mimbalagon', 'Mimbunga', 'Mimbuntong', 'Minsapinit', 'Murallon', 'Odiongan', 'Pangasihan', 'Pigsaluhan', 'Punong', 'Ricoro', 'Samay', 'San Jose', 'San Juan', 'San Luis', 'San Miguel', 'Sangalan', 'Santiago', 'Tagpako', 'Talisay', 'Talon', 'Tinabalan', 'Tinulongan'],
  '104309000': ['Burnay', 'Carlos P. Garcia', 'Cogon', 'Gregorio Pelaez', 'Kilangit', 'Matangad', 'Pangayawan', 'Poblacion', 'Quezon', 'Tala-o', 'Ulab'],
  '104310000': ['Aluna', 'Andales', 'Apas', 'Calacapan', 'Gimangpang', 'Jampason', 'Kamelon', 'Kanitoan', 'Oguis', 'Pagahan', 'Poblacion', 'Pontacon', 'San Pedro', 'Sinalac', 'Tawantawan', 'Tubigan'],
  '104311000': ['Aplaya', 'Bobontugan', 'Corrales', 'Danao', 'I. S. Cruz', 'Jampason', 'Kimaya', 'Lower Jasaan (Pob.)', 'Luz Banzon', 'Natubo', 'San Antonio', 'San Isidro', 'San Nicolas', 'Solana', 'Upper Jasaan (Pob.)'],
  '104312000': ['Beray', 'Bolisong', 'Buko', 'Calubo', 'Campo', 'Esperanza', 'Kagumahan', 'Kalitian', 'Kitotok', 'Panabol', 'Poblacion', 'Salicapawan', 'Salubsob', 'Suarez', 'Sumalag'],
  '104313000': ['Banglay', 'Dampil', 'Gaston', 'Kabulawan', 'Kauswagan', 'Lumbo', 'Manaol', 'Poblacion', 'Tabok', 'Umagos'],
  '104314000': ['Aromahon', 'Gasi', 'Kibaghot', 'Lapad', 'Liberty', 'Mauswagon', 'Moog', 'Poblacion', 'Sambulawan', 'Sinai', 'Tubajon'],
  '104315000': ['Dulong', 'Gimaylan', 'Kimalok', 'Lubluban', 'Poblacion', 'Retablo', 'Santo Niño', 'Tangcub', 'Taytayan'],
  '104316000': ['Aya-aya', 'Betahon', 'Biga', 'Calangahan', 'Kaluknayan', 'Lower Talacogon', 'Poblacion', 'Upper Talacogon'],
  '104317000': ['Abunda', 'Artadi', 'Bonifacio Aquino', 'Cabalawan', 'Cabantian', 'Cabubuhan', 'Candiis', 'Consuelo', 'Damayuhan', 'Gumabon', 'Katipunan', 'Kauswagan', 'Kibungsod', 'Mahayahay', 'Mindulao', 'Pag-asa', 'Poblacion', 'San Isidro', 'San Vicente', 'Santa Cruz', 'Tama', 'Tibon-tibon', 'Tinaan', 'Tulang', 'Villa Felipa'],
  '104318000': ['Argayoso', 'Balintad', 'Cabalantian', 'Camanga', 'Digkilaan', 'Mahayahay', 'Pagawan', 'Paniangan', 'Patag', 'Poblacion', 'Punta Silum', 'Tuod', 'Upper Malubog'],
  '104319000': ['Bangbang', 'Bulwa', 'Cabug', 'Dig-aguyan', 'Duka', 'Gasa', 'Maanas', 'Mananum Bag-o', 'Mananum Daan', 'North Poblacion', 'Pahindong', 'Portulin', 'San Isidro', 'San Jose', 'San Roque', 'San Vicente', 'South Poblacion', 'Tambagan', 'Tup-on'],
  '104320000': ['Don Pedro', 'Linangkayan', 'Lubilan', 'Mapulog', 'Maputi', 'Mat-i', 'Patag', 'Poblacion', 'Tagbalogo', 'Tuboran'],
  '104321000': ['Awang', 'Bagocboc', 'Barra', 'Bonbon', 'Cauyonan', 'Igpit', 'Limonda', 'Luyongbonbon', 'Malanang', 'Nangcaon', 'Patag', 'Poblacion', 'Taboc', 'Tingalan'],
  '104322000': ['Alipuaton', 'Ampenican', 'Bunal', 'Casulog', 'Dinagsaan', 'Guinalaban', 'Ili-ilihon', 'Inobulan', 'Looc', 'Matampa', 'Membuli', 'Poblacion', 'Salagsag', 'Salay River I', 'Salay River II', 'Saray', 'Tinagaan', 'Yungod'],
  '104323000': ['Alicomohan', 'Ampianga', 'Kaulayanan', 'Kidampas', 'Kiraging', 'Mangga', 'Mimbuahan', 'Poblacion', 'Santa Cruz', 'Silad'],
  '104324000': ['Baluarte', 'Casinglot', 'Gracia', 'Mohon', 'Natumolan', 'Poblacion', 'Rosario', 'Santa Ana', 'Santa Cruz', 'Sugbongcogon'],
  '104325000': ['Bugdang', 'Calamcam', 'Casibole', 'Macopa', 'Magkarila', 'Mahayag', 'Mandahilag', 'Mintabon', 'Pangpangon', 'Poblacion', 'Pook', 'Punta Santiago', 'Puting Balas', 'San Jose', 'Santa Ines', 'Sibantang', 'Sindangan', 'Tagbocboc'],
  '104326000': ['Balacanas', 'Dayawan', 'Imelda', 'Katipunan', 'Kimaya', 'Looc', 'Poblacion 1', 'Poblacion 2', 'Poblacion 3', 'San Martin', 'Tambobong'],
};

export function getFallbackBarangays(cityCode: string): Barangay[] {
  if (cityCode === '104305000') return FALLBACK_CDO_BARANGAYS;
  const names = FALLBACK_MISOR_BARANGAYS_BY_CITY[cityCode];
  if (!names) return [];
  const prefix = cityCode.slice(0, 6);
  return names.map((name, index) => ({
    code: `${prefix}${String(index + 1).padStart(3, '0')}`,
    name,
    displayName: name.startsWith('Barangay') ? name : `Brgy. ${name}`,
    cityCode,
  }));
}

export const FALLBACK_CDO_BARANGAYS: Barangay[] = [
  'Agusan', 'Baikingon', 'Bulua', 'Balubal', 'Balulang',
  'Bayabas', 'Bayanga', 'Besigan', 'Bonbon', 'Bugo',
  'Camaman-an', 'Canito-an', 'Carmen', 'Consolacion', 'Cugman',
  'Dansolihon', 'F. S. Catanico', 'Gusa', 'Indahag', 'Iponan',
  'Kauswagan', 'Lapasan', 'Lumbia', 'Macabalan', 'Macasandig',
  'Mambuaya', 'Nazareth', 'Pagalungan', 'Pagatpat', 'Patag',
  'Pigsag-an', 'Puerto', 'Puntod', 'San Simon', 'Tablon',
  'Taglimao', 'Tagpangi', 'Tignapoloan', 'Tuburan', 'Tumpagon',
  'Barangay 1 (Pob.)', 'Barangay 2 (Pob.)', 'Barangay 3 (Pob.)', 'Barangay 4 (Pob.)',
  'Barangay 5 (Pob.)', 'Barangay 6 (Pob.)', 'Barangay 7 (Pob.)', 'Barangay 8 (Pob.)',
  'Barangay 9 (Pob.)', 'Barangay 10 (Pob.)', 'Barangay 11 (Pob.)', 'Barangay 12 (Pob.)',
  'Barangay 13 (Pob.)', 'Barangay 14 (Pob.)', 'Barangay 15 (Pob.)', 'Barangay 16 (Pob.)',
  'Barangay 17 (Pob.)', 'Barangay 18 (Pob.)', 'Barangay 19 (Pob.)', 'Barangay 20 (Pob.)',
  'Barangay 21 (Pob.)', 'Barangay 22 (Pob.)', 'Barangay 23 (Pob.)', 'Barangay 24 (Pob.)',
  'Barangay 25 (Pob.)', 'Barangay 26 (Pob.)', 'Barangay 27 (Pob.)', 'Barangay 28 (Pob.)',
  'Barangay 29 (Pob.)', 'Barangay 30 (Pob.)', 'Barangay 31 (Pob.)', 'Barangay 32 (Pob.)',
  'Barangay 33 (Pob.)', 'Barangay 34 (Pob.)', 'Barangay 35 (Pob.)', 'Barangay 36 (Pob.)',
  'Barangay 37 (Pob.)', 'Barangay 38 (Pob.)', 'Barangay 39 (Pob.)', 'Barangay 40 (Pob.)',
].map((name, index) => ({
  code: `104305${String(index + 1).padStart(3, '0')}`,
  name,
  displayName: name.startsWith('Barangay') ? name : `Brgy. ${name}`,
  cityCode: '104305000',
}));

export const FALLBACK_NCR_CITIES: CityMunicipality[] = [
  'City of Manila', 'City of Mandaluyong', 'City of Marikina', 'City of Pasig', 'Quezon City',
  'City of San Juan', 'Caloocan City', 'City of Malabon', 'City of Navotas', 'City of Valenzuela',
  'City of Las Piñas', 'City of Makati', 'City of Muntinlupa', 'City of Parañaque', 'Pasay City',
  'City of Taguig', 'Pateros'
].map((name, index) => ({
  code: `13390${index}`,
  name,
  displayName: name,
  regionCode: '130000000',
  isCity: true,
}));

/**
 * Fetch with timeout helper
 */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Fetch all Philippine regions
 */
export async function getRegions(): Promise<Region[]> {
  if (cache.regions && cache.regions.length > 0) {
    return cache.regions;
  }

  try {
    const res = await fetchWithTimeout(`${PSGC_BASE_URL}/regions.json`);
    if (res.ok) {
      const data = await res.json();
      const mapped: Region[] = data.map((r: any) => ({
        code: r.code,
        name: r.name,
        regionName: r.regionName,
        displayName: `${r.name} - ${r.regionName}`,
      }));

      // Sort with Region X (Northern Mindanao) and NCR at the top for SerbiSure users
      mapped.sort((a, b) => {
        if (a.code === '100000000') return -1;
        if (b.code === '100000000') return 1;
        if (a.code === '130000000') return -1;
        if (b.code === '130000000') return 1;
        return a.displayName?.localeCompare(b.displayName || '') || 0;
      });

      cache.regions = mapped;
      return mapped;
    }
  } catch (err) {
    console.warn('[locationService] Failed to fetch regions from PSGC API, using fallback:', err);
  }

  return FALLBACK_REGIONS;
}

/**
 * Fetch provinces for a given region
 */
export async function getProvinces(regionCode: string): Promise<Province[]> {
  // Check in-memory cache
  if (cache.provincesByRegion.has(regionCode)) {
    return cache.provincesByRegion.get(regionCode)!;
  }

  // Handle NCR special case (NCR has no provinces, acts as Metro Manila)
  if (regionCode === '130000000') {
    const ncrProvince: Province[] = [{
      code: '130000000',
      name: 'Metro Manila',
      displayName: 'Metro Manila',
      regionCode: '130000000',
    }];
    cache.provincesByRegion.set(regionCode, ncrProvince);
    return ncrProvince;
  }

  try {
    const res = await fetchWithTimeout(`${PSGC_BASE_URL}/regions/${regionCode}/provinces.json`);
    if (res.ok) {
      const data = await res.json();
      const mapped: Province[] = data.map((p: any) => ({
        code: p.code,
        name: p.name,
        displayName: p.name,
        regionCode: p.regionCode,
      }));

      // If Region X, sort Misamis Oriental to top
      if (regionCode === '100000000') {
        mapped.sort((a, b) => {
          if (a.name.toLowerCase().includes('misamis oriental')) return -1;
          if (b.name.toLowerCase().includes('misamis oriental')) return 1;
          return a.name.localeCompare(b.name);
        });
      } else {
        mapped.sort((a, b) => a.name.localeCompare(b.name));
      }

      cache.provincesByRegion.set(regionCode, mapped);
      return mapped;
    }
  } catch (err) {
    console.warn(`[locationService] Failed to fetch provinces for region ${regionCode}:`, err);
  }

  // Region X fallback
  if (regionCode === '100000000') {
    return FALLBACK_REGION_X_PROVINCES;
  }

  return [];
}

/**
 * Fetch cities and municipalities for a given province and/or region
 */
export async function getCities(provinceCode: string, regionCode?: string): Promise<CityMunicipality[]> {
  const cacheKey = `${regionCode || ''}_${provinceCode}`;
  if (cache.citiesByProvince.has(cacheKey)) {
    return cache.citiesByProvince.get(cacheKey)!;
  }

  // NCR cities come directly from region endpoint
  if (regionCode === '130000000' || provinceCode === '130000000') {
    try {
      const res = await fetchWithTimeout(`${PSGC_BASE_URL}/regions/130000000/cities-municipalities.json`);
      if (res.ok) {
        const data = await res.json();
        const mapped: CityMunicipality[] = data.map((c: any) => ({
          code: c.code,
          name: c.name,
          displayName: c.name,
          regionCode: '130000000',
          isCity: c.isCity,
        }));
        mapped.sort((a, b) => a.name.localeCompare(b.name));
        cache.citiesByProvince.set(cacheKey, mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('[locationService] Failed to fetch NCR cities, using fallback:', err);
      return FALLBACK_NCR_CITIES;
    }
    return FALLBACK_NCR_CITIES;
  }

  try {
    const res = await fetchWithTimeout(`${PSGC_BASE_URL}/provinces/${provinceCode}/cities-municipalities.json`);
    if (res.ok) {
      const data = await res.json();
      const mapped: CityMunicipality[] = data.map((c: any) => {
        const isCdo = c.name.toLowerCase().includes('cagayan de oro');
        return {
          code: c.code,
          name: c.name,
          displayName: isCdo ? 'City of Cagayan De Oro (CDO)' : c.name,
          provinceCode: c.provinceCode,
          regionCode: c.regionCode,
          isCity: c.isCity,
          aliases: isCdo ? ['cdo', 'cagayan', 'cagayan de oro', 'cagayan de oro city'] : undefined,
        };
      });

      // Place City of Cagayan De Oro first if in Misamis Oriental
      mapped.sort((a, b) => {
        const aCdo = a.name.toLowerCase().includes('cagayan de oro');
        const bCdo = b.name.toLowerCase().includes('cagayan de oro');
        if (aCdo) return -1;
        if (bCdo) return 1;
        return a.name.localeCompare(b.name);
      });

      cache.citiesByProvince.set(cacheKey, mapped);
      return mapped;
    }
  } catch (err) {
    console.warn(`[locationService] Failed to fetch cities for province ${provinceCode}:`, err);
  }

  // Misamis Oriental fallback
  if (provinceCode === '104300000') {
    return FALLBACK_MISAMIS_ORIENTAL_CITIES;
  }

  return [];
}

/**
 * Fetch barangays for a given city or municipality
 */
export async function getBarangays(cityCode: string): Promise<Barangay[]> {
  if (cache.barangaysByCity.has(cityCode)) {
    return cache.barangaysByCity.get(cityCode)!;
  }

  try {
    const res = await fetchWithTimeout(`${PSGC_BASE_URL}/cities-municipalities/${cityCode}/barangays.json`);
    if (res.ok) {
      const data = await res.json();
      const mapped: Barangay[] = data.map((b: any) => ({
        code: b.code,
        name: b.name,
        displayName: b.name.startsWith('Barangay') ? b.name : `Brgy. ${b.name}`,
        cityCode: b.cityCode || b.municipalityCode,
      }));

      mapped.sort((a, b) => a.name.localeCompare(b.name));
      cache.barangaysByCity.set(cityCode, mapped);
      return mapped;
    }
  } catch (err) {
    console.warn(`[locationService] Failed to fetch barangays for city ${cityCode}:`, err);
  }

  // Offline Misamis Oriental fallback (CDO + all 25 municipalities/cities)
  const fallback = getFallbackBarangays(cityCode);
  if (fallback.length > 0) {
    return fallback;
  }

  return [];
}

/**
 * Auto-suggest zip code based on city code or city name
 */
export function getZipCodeForCity(cityCode: string, cityName?: string): string {
  const codeZip = ZIP_CODE_MAP[cityCode];
  if (codeZip) {
    return codeZip;
  }

  if (cityName) {
    const lower = cityName.toLowerCase();
    for (const [key, zip] of Object.entries(ZIP_CODE_MAP)) {
      if (lower.includes(key)) {
        return zip;
      }
    }
  }

  return '';
}

/**
 * Formats a user's registered location into Barangay and City (e.g., "Pagatpat, CDO").
 * Handles street addresses storing the barangay (e.g. "Brgy. Pagatpat, Z4 Blk4 H26"),
 * Standardizes a supplied Cagayan de Oro city name; never invents missing address parts.
 */
export function formatRegisteredLocation(
  street?: string | null,
  city?: string | null,
  province?: string | null
): string {
  let brgy = '';

  if (street) {
    // Check if street starts with Brgy. or Barangay
    const brgyMatch = street.match(/(?:brgy\.?|barangay)\s*([^,]+)/i);
    if (brgyMatch && brgyMatch[1]) {
      brgy = brgyMatch[1].trim();
    } else {
      const parts = street.split(',');
      const firstPart = (parts[0] || '').trim();
      if (firstPart && !firstPart.match(/^(lot|blk|block|zone|street|st\.|phase|h\s*\d+)/i)) {
        brgy = firstPart;
      }
    }
  }

  // Normalize city name
  let cityClean = (city || '').trim();
  if (cityClean.toLowerCase() === 'pagatpat') {
    brgy = 'Pagatpat';
    cityClean = '';
  } else if (cityClean.toLowerCase().includes('cagayan de oro')) {
    cityClean = 'CDO';
  } else if (cityClean) {
    cityClean = cityClean.replace(/^city of\s+/i, '').replace(/\s+city$/i, '').trim();
  }

  // Clean up brgy prefix if it still has "Brgy. " or "Barangay "
  if (brgy) {
    brgy = brgy.replace(/^(brgy\.?|barangay)\s+/i, '').trim();
  }

  // If no brgy extracted from street, check if street contains known CDO barangay
  if (!brgy && street) {
    const lowerStreet = street.toLowerCase();
    for (const b of FALLBACK_CDO_BARANGAYS) {
      if (lowerStreet.includes(b.name.toLowerCase())) {
        brgy = b.name;
        break;
      }
    }
  }

  if (brgy && cityClean) {
    return `${brgy}, ${cityClean}`;
  }
  if (brgy) {
    return brgy;
  }
  if (cityClean) {
    return cityClean;
  }
  if (province) {
    return province.trim();
  }
  return '';
}
