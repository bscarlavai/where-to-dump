/**
 * County lists from the Census Bureau's public national county file.
 * Format: STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT
 */

const CENSUS_COUNTIES_URL =
  'https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt';

const STATE_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
};

/** Returns county names (e.g. "Marion County") for a state name like "Indiana". */
export async function fetchCounties(stateName: string): Promise<string[]> {
  const abbr = STATE_ABBR[stateName.toLowerCase()];
  if (!abbr) throw new Error(`Unknown state: ${stateName}`);
  const res = await fetch(CENSUS_COUNTIES_URL);
  if (!res.ok) throw new Error(`Census county file fetch failed: ${res.status}`);
  const text = await res.text();
  const counties: string[] = [];
  for (const line of text.split('\n')) {
    const [state, , , , countyName] = line.split('|');
    if (state === abbr && countyName) counties.push(countyName.trim());
  }
  if (counties.length === 0) throw new Error(`No counties found for ${stateName} (${abbr})`);
  return counties;
}
