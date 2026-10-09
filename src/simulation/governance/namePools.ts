// Deterministic, culturally plausible fallback leader names for initial parties whose
// real leadership could not be evidenced at the scenario date. Names are chosen from a
// coarse regional pool derived from the Country's continent/subregion, are human-looking,
// unique per Country, and never assert a real person. Provenance records keep these
// identities explicitly fictional.

export interface LeaderNamePool { given: string[]; family: string[] }

const EUROPE_WEST: LeaderNamePool = {
  given: ['Henri', 'Marcel', 'Élise', 'Camille', 'Antoine', 'Louise', 'Pierre', 'Margaux', 'Théo', 'Claire', 'Victor', 'Adèle'],
  family: ['Laurent', 'Moreau', 'Dubois', 'Fournier', 'Rousseau', 'Blanc', 'Girard', 'Mercier', 'Caron', 'Perrin', 'Lambert', 'Garnier'],
};
const EUROPE_EAST: LeaderNamePool = {
  given: ['Marek', 'Tomas', 'Ivan', 'Katarina', 'Petr', 'Anna', 'Dmitri', 'Lena', 'Stefan', 'Milena', 'Viktor', 'Olga'],
  family: ['Novak', 'Kovac', 'Horvat', 'Volkov', 'Petrov', 'Jovanovic', 'Kowalski', 'Popescu', 'Szabo', 'Varga', 'Ivanov', 'Sokolov'],
};
const LATIN: LeaderNamePool = {
  given: ['Mateo', 'Valentina', 'Diego', 'Camila', 'Santiago', 'Lucía', 'Andrés', 'Mariana', 'Ricardo', 'Carolina', 'Javier', 'Isabel'],
  family: ['Rojas', 'Morales', 'Silva', 'Fernández', 'Castillo', 'Guzmán', 'Vargas', 'Ortega', 'Mendoza', 'Ramos', 'Aguilar', 'Torres'],
};
const AFRICA: LeaderNamePool = {
  given: ['Kwame', 'Amara', 'Kwesi', 'Nadia', 'Tariq', 'Zainab', 'Kwabena', 'Fatima', 'Idris', 'Amina', 'Malik', 'Safiya'],
  family: ['Mensah', 'Diallo', 'Nkosi', 'Okafor', 'Sow', 'Keita', 'Ndiaye', 'Okafor', 'Traore', 'Okonkwo', 'Asante', 'Kamara'],
};
const ARAB: LeaderNamePool = {
  given: ['Youssef', 'Layla', 'Omar', 'Fatima', 'Hassan', 'Amina', 'Karim', 'Salma', 'Tariq', 'Nadia', 'Sami', 'Huda'],
  family: ['Haddad', 'Saleh', 'Nasr', 'Khoury', 'Mansour', 'Fares', 'Saad', 'Khalil', 'Aziz', 'Bouazizi', 'El-Amin', 'Nasser'],
};
const SOUTH_ASIA: LeaderNamePool = {
  given: ['Arjun', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Meera', 'Sanjay', 'Kavita', 'Rajesh', 'Sunita', 'Amit', 'Pooja'],
  family: ['Sharma', 'Patel', 'Singh', 'Gupta', 'Rao', 'Mehta', 'Khan', 'Chopra', 'Bose', 'Reddy', 'Nair', 'Iyer'],
};
const EAST_ASIA: LeaderNamePool = {
  given: ['Wei', 'Xiu', 'Chen', 'Hua', 'Jun', 'Mei', 'Yuan', 'Lan', 'Zhen', 'Qing', 'Bo', 'Yan'],
  family: ['Li', 'Wang', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun'],
};
const SOUTHEAST_ASIA: LeaderNamePool = {
  given: ['Budi', 'Siti', 'Agus', 'Dewi', 'Rizky', 'Putri', 'Hendra', 'Maya', 'Wati', 'Eko', 'Sari', 'Joko'],
  family: ['Santoso', 'Wijaya', 'Siregar', 'Halim', 'Kusuma', 'Pratama', 'Nugroho', 'Saputra', 'Lestari', 'Hartono', 'Susanto', 'Firmansyah'],
};
const NORTH_AMERICA: LeaderNamePool = {
  given: ['James', 'Margaret', 'Robert', 'Evelyn', 'Thomas', 'Audrey', 'William', 'Charlotte', 'Henry', 'Grace', 'Edward', 'Clara'],
  family: ['Campbell', 'Macleod', 'Sinclair', 'Bennett', 'Fraser', 'Robertson', 'Wallace', 'Cameron', 'Hamilton', 'Burns', 'Stewart', 'Reid'],
};
const OCEANIA: LeaderNamePool = {
  given: ['Tane', 'Moana', 'Rangi', 'Aroha', 'Hemi', 'Whetu', 'Kauri', 'Ata', 'Nikau', 'Maia', 'Rawiri', 'Pania'],
  family: ['Puketapu', 'Waititi', 'Henare', 'Ngata', 'Ropata', 'Tama', 'Kerehoma', 'Parata', 'Wihongi', 'Tuwhare', 'Raniera', 'Hikuroa'],
};
const FALLBACK: LeaderNamePool = EUROPE_WEST;

export function namePoolForCountry(country: { continent?: string; unSubregion?: string }): LeaderNamePool {
  const continent = country.continent ?? '';
  const region = country.unSubregion ?? '';
  if (continent === 'Europe' && (region === 'Eastern Europe' || region === 'Northern Europe')) return EUROPE_EAST;
  if (continent === 'Europe') return EUROPE_WEST;
  if (continent === 'Americas' && region === 'South America') return LATIN;
  if (continent === 'Americas' && (region === 'Central America' || region === 'Caribbean')) return LATIN;
  if (continent === 'Americas') return NORTH_AMERICA;
  if (continent === 'Africa' && (region === 'Northern Africa')) return ARAB;
  if (continent === 'Africa') return AFRICA;
  if (continent === 'Asia' && region === 'Western Asia') return ARAB;
  if (continent === 'Asia' && region === 'Southern Asia') return SOUTH_ASIA;
  if (continent === 'Asia' && region === 'Eastern Asia') return EAST_ASIA;
  if (continent === 'Asia' && region === 'South-eastern Asia') return SOUTHEAST_ASIA;
  if (continent === 'Asia') return SOUTH_ASIA;
  if (continent === 'Oceania') return OCEANIA;
  return FALLBACK;
}
