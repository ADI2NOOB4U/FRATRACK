import { useEffect, useMemo, useState } from 'react'
import { geoJSON } from 'leaflet'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
const RISK_LEVELS = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const RISK_COLORS = { LOW: '#4fa56c', MEDIUM: '#d6ad4f', HIGH: '#e37b3c', CRITICAL: '#d9534f', NO_DATA: '#8b9890' }
const STATE_ALIASES = {
  'andaman and nicobar islands': 'AN', 'andaman nicobar': 'AN', 'andhra pradesh': 'AP', 'arunachal pradesh': 'AR', 'assam': 'AS',
  'bihar': 'BR', 'chandigarh': 'CH', 'chhattisgarh': 'CG', 'delhi': 'DL', 'goa': 'GA', 'gujarat': 'GJ', 'haryana': 'HR',
  'himachal pradesh': 'HP', 'jammu and kashmir': 'JK', 'jharkhand': 'JH', 'karnataka': 'KA', 'kerala': 'KL', 'ladakh': 'LA',
  'lakshadweep': 'LD', 'madhya pradesh': 'MP', 'maharashtra': 'MH', 'manipur': 'MN', 'meghalaya': 'ML', 'mizoram': 'MZ',
  'nagaland': 'NL', 'odisha': 'OD', 'puducherry': 'PY', 'punjab': 'PB', 'rajasthan': 'RJ', 'sikkim': 'SK', 'tamil nadu': 'TN',
  'telangana': 'TS', 'tripura': 'TR', 'uttar pradesh': 'UP', 'uttarakhand': 'UK', 'west bengal': 'WB',
}
let cachedRiskPromise
const RISK_REQUEST_TIMEOUT = 20000

const styles = `
.gis-explorer{min-height:100vh;padding:28px;box-sizing:border-box;color:#24313d;background:#f3f5f2;font-family:"Trebuchet MS","Segoe UI",sans-serif;text-align:left}.gis-shell{max-width:1480px;margin:0 auto}.gis-header{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:22px}.gis-kicker{margin:0 0 7px;color:#2f855a;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.gis-title{margin:0;color:#17232b;font-family:Georgia,serif;font-size:clamp(30px,4vw,52px);line-height:1}.gis-subtitle{max-width:520px;margin:10px 0 0;color:#5d6b72;font-size:15px;line-height:1.5}.gis-disclosure{max-width:340px;padding:12px 14px;border-left:3px solid #d69e2e;background:#fffaf0;color:#6b541e;font-size:12px;line-height:1.45}.gis-toolbar{display:grid;grid-template-columns:minmax(190px,1fr) minmax(180px,.8fr) minmax(200px,1fr);gap:12px;margin-bottom:14px}.gis-field{display:flex;flex-direction:column;gap:5px}.gis-field label{color:#62717a;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.gis-field input,.gis-field select{width:100%;min-height:42px;box-sizing:border-box;padding:0 12px;border:1px solid #cfd8d4;border-radius:4px;background:#fff;color:#24313d;font:inherit;font-size:14px}.gis-filter{display:flex;flex-wrap:wrap;gap:6px;align-items:end}.gis-filter button{min-height:42px;padding:0 13px;border:1px solid #cfd8d4;border-radius:4px;background:#fff;color:#50606a;cursor:pointer;font:inherit;font-size:13px}.gis-filter button[aria-pressed="true"]{border-color:#245c43;background:#245c43;color:#fff}.gis-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}.gis-map-frame{overflow:hidden;min-height:620px;border:1px solid #cfd8d4;border-radius:5px;background:#dfe8e3;box-shadow:0 8px 22px rgba(32,54,44,.08)}.gis-map{height:620px;width:100%}.gis-panel{min-height:620px;box-sizing:border-box;padding:20px;border:1px solid #d4ddd8;background:#fff}.gis-panel h2{margin:0 0 4px;color:#17232b;font-family:Georgia,serif;font-size:27px;line-height:1.1}.gis-panel h3{margin:24px 0 10px;color:#718078;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.gis-state{margin:0 0 18px;color:#718078;font-size:13px}.gis-metric-list{display:grid;gap:9px;margin:0}.gis-metric{display:flex;justify-content:space-between;gap:12px;padding-bottom:9px;border-bottom:1px solid #edf0ee;font-size:13px}.gis-metric dt{color:#718078}.gis-metric dd{max-width:150px;margin:0;color:#24313d;font-weight:700;text-align:right;overflow-wrap:anywhere}.gis-risk{display:inline-flex;align-items:center;gap:7px;font-size:12px}.gis-risk-dot{width:9px;height:9px;border-radius:50%}.gis-empty{color:#718078;font-size:14px;line-height:1.5}.gis-status{margin:0 0 12px;color:#718078;font-size:12px}.gis-status.error{color:#b84439}.gis-legend{display:flex;flex-wrap:wrap;gap:10px 15px;margin-top:14px;color:#596970;font-size:12px}.gis-legend-item{display:inline-flex;align-items:center;gap:6px}.gis-legend-swatch{width:12px;height:12px;border:1px solid rgba(36,49,61,.35);border-radius:2px}@media(max-width:900px){.gis-header,.gis-layout{grid-template-columns:1fr;display:grid}.gis-disclosure{max-width:none}.gis-panel{min-height:auto}}@media(max-width:650px){.gis-explorer{padding:16px}.gis-toolbar{grid-template-columns:1fr}.gis-map-frame,.gis-map{min-height:500px;height:500px}}
`

function normalizeToken(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '')
}

function normalizeState(value) {
  const token = normalizeToken(value)
  const raw = String(value ?? '').toLowerCase().trim()
  return STATE_ALIASES[raw] || STATE_ALIASES[token] || token.toUpperCase()
}

function normalizeDistrict(value) {
  return normalizeToken(value).replace(/(?:district|dist)$/i, '')
}

function firstValue(record, keys) {
  return keys.map((key) => record?.[key]).find((value) => value !== undefined && value !== null && value !== '')
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function recordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.districts)) return payload.districts
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function levelFromRecord(record) {
  const level = normalizeToken(firstValue(record, ['risk_level', 'riskLevel'])).toUpperCase()
  return RISK_LEVELS.includes(level) && level !== 'ALL' ? level : 'NO_DATA'
}

// This is the only district identity function used by lookup, filters, search, and selection.
function canonicalDistrictIdentity(source) {
  const properties = source?.properties || source || {}
  const rawId = firstValue(properties, ['district_id', 'districtId', 'id'])
  const rawName = firstValue(properties, ['district_name', 'district', 'districtName', 'name'])
  const rawStateId = firstValue(properties, ['state_id', 'stateId', 'state', 'stcode'])
  const rawStateName = firstValue(properties, ['state_name', 'stateName'])
  const stateId = normalizeState(rawStateId || rawStateName)
  const districtId = normalizeDistrict(rawId)
  const districtName = normalizeDistrict(rawName)
  const idSuffix = districtId.startsWith(stateId.toLowerCase()) ? districtId.slice(stateId.length) : districtId
  const keys = new Set()
  if (districtId) keys.add(`${stateId}:${districtId}`)
  if (districtName) keys.add(`${stateId}:${districtName}`)
  if (idSuffix) keys.add(`${stateId}:${idSuffix}`)
  if (districtName.length >= 3) keys.add(`${stateId}:${districtName.slice(0, 3)}`)
  if (idSuffix.length >= 3) keys.add(`${stateId}:${idSuffix.slice(0, 3)}`)
  return { stateId, stateName: rawStateName || rawStateId || 'Unknown state', districtId, districtName, displayName: rawName || rawId || 'Unnamed district', keys }
}

function identityKeys(source) {
  return canonicalDistrictIdentity(source).keys
}

function candidateDistrictIds(identity) {
  const prefix = identity.districtName.slice(0, 3).toUpperCase()
  const fullName = identity.districtName.toLowerCase()
  return [...new Set([`${identity.stateId}_${prefix}`, `${identity.stateId}_${fullName}`])]
}

function findRiskRecord(feature, lookup) {
  return [...identityKeys(feature)].map((key) => lookup.get(key)).find(Boolean) || null
}

function riskRecord(record) {
  return record ? { ...record, risk_level: levelFromRecord(record), claim_count: firstValue(record, ['claim_count', 'total_claims']), anomaly_count: firstValue(record, ['anomaly_count']) } : { risk_level: 'NO_DATA', claim_count: null, anomaly_count: null }
}

async function loadRiskRecords(url) {
  if (!cachedRiskPromise) {
    const request = async (requestUrl) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), RISK_REQUEST_TIMEOUT)
      try {
        return await fetch(requestUrl, { signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }
    }
    cachedRiskPromise = request(`${url}?page=1&limit=100&sort=risk_score&order=desc`).then(async (response) => {
      if (!response.ok) throw new Error('Risk data request failed')
      const first = await response.json()
      const records = recordsFromPayload(first)
      const pages = Math.max(1, Math.ceil(Number(first.count || records.length) / 100))
      for (let page = 2; page <= pages; page += 1) {
        const pageResponse = await request(`${url}?page=${page}&limit=100&sort=risk_score&order=desc`)
        if (!pageResponse.ok) throw new Error('Risk data request failed')
        records.push(...recordsFromPayload(await pageResponse.json()))
      }
      return records
    }).catch((error) => { cachedRiskPromise = undefined; throw error })
  }
  return cachedRiskPromise
}

function MapFocus({ selectedFeature, stateCollection }) {
  const map = useMap()
  useEffect(() => {
    const target = selectedFeature || stateCollection
    if (!target) return
    const bounds = geoJSON(target).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: selectedFeature ? 8 : 6 })
  }, [map, selectedFeature, stateCollection])
  return null
}

function GISExplorer({ districtData, districtDataUrl = `${API_URL}/api/districts/` }) {
  const [districts, setDistricts] = useState(null)
  const [indiaBoundary, setIndiaBoundary] = useState(null)
  const [records, setRecords] = useState(() => recordsFromPayload(districtData))
  const [status, setStatus] = useState(districtData ? 'ready' : 'loading')
  const [error, setError] = useState('')
  const [riskFilter, setRiskFilter] = useState('ALL')
  const [stateFilter, setStateFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState({ data: null, loading: false, error: '' })

  useEffect(() => {
    let active = true
    const districtPayloadPromise = window.__fraDistrictMapPromise || fetch('/geojson/district_map.geojson').then((response) => {
      if (!response.ok) throw new Error('District map data unavailable')
      return response.json()
    })
    window.__fraDistrictMapPromise ||= districtPayloadPromise
    Promise.all([districtPayloadPromise, fetch('/geojson/india_boundary.geojson')]).then(async ([districtPayload, boundaryResponse]) => {
      if (!boundaryResponse.ok) throw new Error('Map boundary data unavailable')
      const boundaryPayload = await boundaryResponse.json()
      if (active) { setDistricts(districtPayload); setIndiaBoundary(boundaryPayload) }
    }).catch((loadError) => { if (active) { setStatus('error'); setError(loadError.message) } })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (districtData) { setRecords(recordsFromPayload(districtData)); setStatus('ready'); return undefined }
    let active = true
    loadRiskRecords(districtDataUrl).then((loaded) => { if (active) { setRecords(loaded); setStatus('ready') } }).catch((loadError) => { if (active) { setRecords([]); setStatus('error'); setError(loadError.name === 'AbortError' ? 'The backend risk route timed out; boundaries remain visible as NO DATA.' : loadError.message) } })
    return () => { active = false }
  }, [districtData, districtDataUrl])

  const lookup = useMemo(() => {
    const map = new Map()
    records.forEach((record) => { const value = riskRecord(record); identityKeys(record).forEach((key) => map.set(key, value)) })
    return map
  }, [records])
  const features = districts?.features || []
  const stateNames = useMemo(() => {
    const states = new Map(features.map((feature) => { const identity = canonicalDistrictIdentity(feature); return [identity.stateId, identity.stateName] }))
    return ['ALL', ...Array.from(states.values()).sort()]
  }, [features])
  const matchingFeature = useMemo(() => {
    const query = normalizeDistrict(search)
    if (!query) return null
    return features.find((feature) => {
      const identity = canonicalDistrictIdentity(feature)
      return (stateFilter === 'ALL' || identity.stateId === normalizeState(stateFilter)) && (identity.districtName === query || identity.districtName.includes(query))
    }) || null
  }, [features, search, stateFilter])
  const stateCollection = useMemo(() => stateFilter === 'ALL' ? null : { type: 'FeatureCollection', features: features.filter((feature) => canonicalDistrictIdentity(feature).stateId === normalizeState(stateFilter)) }, [features, stateFilter])
  const matchingCount = useMemo(() => features.filter((feature) => {
    const identity = canonicalDistrictIdentity(feature)
    const record = findRiskRecord(feature, lookup)
    const level = record?.risk_level || 'NO_DATA'
    return (stateFilter === 'ALL' || identity.stateId === normalizeState(stateFilter)) && (!search || feature === matchingFeature) && (riskFilter === 'ALL' || level === riskFilter)
  }).length, [features, lookup, matchingFeature, riskFilter, search, stateFilter])

  useEffect(() => {
    if (matchingFeature) setSelected((current) => current?.feature === matchingFeature ? current : { feature: matchingFeature, data: findRiskRecord(matchingFeature, lookup) })
  }, [matchingFeature, lookup])

  useEffect(() => {
    if (!selected) return
    const identity = canonicalDistrictIdentity(selected.feature)
    const outsideState = stateFilter !== 'ALL' && identity.stateId !== normalizeState(stateFilter)
    const outsideSearch = Boolean(search) && selected.feature !== matchingFeature
    if (outsideState || outsideSearch) setSelected(null)
  }, [matchingFeature, search, selected, stateFilter])

  useEffect(() => {
    if (!selected) { setDetail({ data: null, loading: false, error: '' }); return undefined }
    const controller = new AbortController()
    const identity = canonicalDistrictIdentity(selected.feature)
    setDetail({ data: null, loading: true, error: '' })
    const resolveRecord = selected.data?.district_id ? Promise.resolve(selected.data) : candidateDistrictIds(identity).reduce((promise, candidateId) => promise.catch(() => fetch(`${API_URL}/api/districts/${candidateId}`, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error('District candidate not found'); return response.json() })), Promise.reject(new Error('District lookup failed')))
    resolveRecord.then((record) => {
      if (!record?.district_id) throw new Error('No backend district record for this boundary')
      return Promise.all([fetch(`${API_URL}/api/districts/${record.district_id}`, { signal: controller.signal }), fetch(`${API_URL}/api/risk-score/${record.district_id}`, { signal: controller.signal }), fetch(`${API_URL}/api/anomalies/${record.district_id}`, { signal: controller.signal })]).then(async ([districtResponse, riskResponse, anomalyResponse]) => {
        if (!districtResponse.ok || !riskResponse.ok || !anomalyResponse.ok) throw new Error('District detail request failed')
        const [district, risk, anomalies] = await Promise.all([districtResponse.json(), riskResponse.json(), anomalyResponse.json()])
        return { ...district, ...risk, ...anomalies }
      })
    }).then((data) => setDetail({ data, loading: false, error: '' })).catch((detailError) => { if (detailError.name !== 'AbortError') setDetail({ data: null, loading: false, error: detailError.message }) })
    return () => controller.abort()
  }, [selected])

  function styleFor(feature) {
    const identity = canonicalDistrictIdentity(feature)
    const selectedMatch = selected?.feature === feature
    const record = selectedMatch && detail.data ? riskRecord(detail.data) : findRiskRecord(feature, lookup)
    const level = record?.risk_level || 'NO_DATA'
    const matchesState = stateFilter === 'ALL' || identity.stateId === normalizeState(stateFilter)
    const matchesRisk = riskFilter === 'ALL' || level === riskFilter
    const matchesSearch = !search || feature === matchingFeature
    const emphasized = matchesState && matchesRisk && matchesSearch
    return { color: selectedMatch ? '#17232b' : matchesState ? '#65766c' : '#9aa69f', weight: selectedMatch ? 4 : 1.2, opacity: 1, fillColor: RISK_COLORS[level], fillOpacity: emphasized ? (level === 'NO_DATA' ? 0.22 : 0.78) : 0.12 }
  }

  function selectFeature(feature) { setSelected({ feature, data: findRiskRecord(feature, lookup) }) }

  const selectedData = detail.data || selected?.data
  const selectedIdentity = selected ? canonicalDistrictIdentity(selected.feature) : null
  const selectedLevel = detail.data?.risk_level || selectedData?.risk_level || 'NO_DATA'
  const anomalyCount = detail.data ? (detail.data.anomalies?.length || 0) + (detail.data.district_anomalies?.length || 0) : selectedData?.anomaly_count

  return <main className="gis-explorer"><style>{styles}</style><div className="gis-shell"><header className="gis-header"><div><p className="gis-kicker">FRATRACK / GIS explorer</p><h1 className="gis-title">District risk atlas</h1><p className="gis-subtitle">Explore every district boundary with backend-provided risk signals. Unmatched boundaries remain visible as NO DATA.</p></div><div className="gis-disclosure"><strong>Synthetic/demo data.</strong> Claim and risk signals come from the connected backend dataset and are not live government records.</div></header><section className="gis-toolbar" aria-label="Map filters"><div className="gis-field"><label htmlFor="district-search">District search</label><input id="district-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by district name" /></div><div className="gis-field"><label htmlFor="state-filter">State</label><select id="state-filter" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>{stateNames.map((state) => <option key={state} value={state}>{state === 'ALL' ? 'All states' : state}</option>)}</select></div><div className="gis-field"><label>Risk level</label><div className="gis-filter">{RISK_LEVELS.map((level) => <button key={level} type="button" aria-pressed={riskFilter === level} onClick={() => setRiskFilter(level)}>{level === 'ALL' ? 'All' : level}</button>)}</div></div></section>{status === 'loading' && <p className="gis-status">Loading district boundaries and cached risk data...</p>}{status === 'error' && <p className="gis-status error">Unable to load live GIS data: {error}</p>}{status === 'ready' && <p className="gis-status">Showing {matchingCount} emphasized districts of {features.length} visible boundaries. {records.length} risk records cached.</p>}{status === 'ready' && matchingCount === 0 && <p className="gis-status">NO DATA: no districts match the current filters; all boundaries remain visible.</p>}<section className="gis-layout"><div><div className="gis-map-frame"><MapContainer className="gis-map" center={[22.5, 78.9]} zoom={5} scrollWheelZoom><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapFocus selectedFeature={selected?.feature} stateCollection={stateCollection} />{features.length > 0 && <GeoJSON key={`${riskFilter}:${stateFilter}:${search}:${selected?.feature?.properties?.id || 'none'}:${records.length}:${detail.data?.risk_score || 'none'}`} data={{ type: 'FeatureCollection', features }} style={styleFor} onEachFeature={(feature, layer) => layer.on({ click: () => { selectFeature(feature); layer._map?.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 8 }) } })} />}{indiaBoundary && <GeoJSON data={indiaBoundary} style={{ color: '#17232b', weight: 2, fillOpacity: 0, fill: false }} />}</MapContainer></div><div className="gis-legend" aria-label="Risk legend">{RISK_LEVELS.slice(1).concat('NO_DATA').map((level) => <span className="gis-legend-item" key={level}><span className="gis-legend-swatch" style={{ backgroundColor: RISK_COLORS[level] }} />{level.replace('_', ' ')}</span>)}</div></div><aside className="gis-panel" aria-live="polite">{selected ? <><h2>{selectedIdentity.displayName}</h2><p className="gis-state">{selectedIdentity.stateName}</p><div className="gis-risk"><span className="gis-risk-dot" style={{ backgroundColor: RISK_COLORS[selectedLevel] }} />{selectedLevel}</div><h3>District details</h3><dl className="gis-metric-list">{[['Claim count', firstValue(selectedData, ['total_claims', 'claim_count'])], ['Pending', selectedData?.pending_claims], ['Approved', selectedData?.approved_claims], ['Rejected', selectedData?.rejected_claims], ['Withdrawn', selectedData?.withdrawn_claims], ['Anomaly count', anomalyCount], ['Risk score', selectedData?.risk_score], ['Risk level', selectedLevel]].map(([label, value]) => <div className="gis-metric" key={label}><dt>{label}</dt><dd>{hasValue(value) ? String(value) : 'NO DATA'}</dd></div>)}</dl>{detail.loading && <p className="gis-status">Loading live district details...</p>}{detail.error && <p className="gis-status error">{detail.error}</p>}{!detail.loading && !detail.error && selectedLevel === 'NO_DATA' && <p className="gis-empty">NO DATA: the backend has no risk record for this boundary.</p>}</> : <p className="gis-empty">Search or click a district to highlight it, zoom to its boundary, and load live details.</p>}</aside></section></div></main>
}

export default GISExplorer
