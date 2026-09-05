import { useEffect, useMemo, useRef, useState } from 'react'
import { geoJSON } from 'leaflet'
import { MapContainer, TileLayer, CircleMarker, Tooltip, ZoomControl, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import GISExplorer from './components/gis/GISExplorer'

const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')

// ============================================================================
// DISTRICT METADATA & DEMO DATA
// ============================================================================

const DISTRICT_META = [
  ['MP_MAN', 'Mandla', 'MP', 'Madhya Pradesh', 22.5833, 80.6333, 'Central', 42.5],
  ['MP_BRS', 'Balaghat', 'MP', 'Madhya Pradesh', 21.9167, 80.1667, 'Central', 48.2],
  ['MP_DIN', 'Dindori', 'MP', 'Madhya Pradesh', 22.8667, 81.5333, 'Central', 51.3],
  ['MP_HOS', 'Hoshangabad', 'MP', 'Madhya Pradesh', 22.4333, 77.7333, 'Central', 35.8],
  ['CG_BAS', 'Bastar', 'CG', 'Chhattisgarh', 19.3333, 81.8333, 'Central', 69.5],
  ['CG_KAN', 'Kanker', 'CG', 'Chhattisgarh', 19.9333, 81.3333, 'Central', 72.1],
  ['CG_RIA', 'Raigarh', 'CG', 'Chhattisgarh', 21.4833, 83.4, 'Central', 45.3],
  ['OD_KAL', 'Kalahandi', 'OD', 'Odisha', 19.8, 82.7, 'East', 58.2],
  ['OD_NBA', 'Nuapada', 'OD', 'Odisha', 19.45, 82.0833, 'East', 61.8],
  ['AR_PPA', 'Papum Pare', 'AR', 'Arunachal Pradesh', 28.2167, 93.6, 'Northeast', 78.5],
  ['JH_WES', 'West Singhbhum', 'JH', 'Jharkhand', 22.7333, 84.55, 'East', 42.7],
  ['AP_VIS', 'Visakhapatnam', 'AP', 'Andhra Pradesh', 17.6869, 83.2197, 'South', 35.2],
  ['KA_UDU', 'Udupi', 'KA', 'Karnataka', 13.3344, 74.7421, 'South', 28.5],
  ['KL_IDA', 'Idukki', 'KL', 'Kerala', 10.0469, 76.8811, 'South', 56.3],
  ['MH_GAD', 'Gadchiroli', 'MH', 'Maharashtra', 20.1833, 79.5667, 'West', 71.4],
  ['GJ_DAH', 'Dahod', 'GJ', 'Gujarat', 22.8667, 74.1667, 'West', 39.1],
  ['RJ_BAN', 'Banswara', 'RJ', 'Rajasthan', 23.5456, 74.4306, 'North', 32.4],
  ['AS_KAM', 'Kamrup', 'AS', 'Assam', 26.2, 91.5833, 'Northeast', 19.3],
  ['UP_SON', 'Sonbhadra', 'UP', 'Uttar Pradesh', 24.2667, 83.2333, 'North', 44.2],
  ['WB_PIL', 'Purulia', 'WB', 'West Bengal', 23.5, 84.75, 'East', 26.8],
]

const districtMeta = Object.fromEntries(DISTRICT_META.map(([id, name, stateId, stateName, latitude, longitude, region, forestArea]) => [
  id, { district_id: id, district_name: name, state_id: stateId, state_name: stateName, latitude, longitude, region, forest_area_percent: forestArea },
]))

const _demoDistricts = DISTRICT_META.map(([id], index) => ({
  ...districtMeta[id],
  risk_score: [82, 76, 69, 63, 56, 51, 48, 44, 42, 38, 35, 32, 30, 28, 25, 22, 19, 17, 15, 12][index],
  risk_level: index < 2 ? 'HIGH' : index < 9 ? 'MEDIUM' : 'LOW',
  pending_claims: [284, 198, 176, 147, 121, 98, 86, 74, 69, 62, 54, 48, 42, 37, 31, 26, 22, 18, 15, 12][index],
  total_claims: [1120, 844, 791, 690, 614, 582, 538, 514, 521, 403, 387, 369, 342, 318, 294, 271, 242, 218, 191, 174][index],
  approval_rate: [39.2, 44.8, 52.1, 58.4, 61.3, 65.6, 67.2, 68.3, 69.8, 72.4, 73.1, 74.6, 75.8, 76.2, 77.5, 78.4, 79.1, 80.2, 81.1, 82.3][index],
  avg_processing_days: [298, 246, 217, 184, 169, 142, 135, 131, 126, 119, 114, 108, 103, 98, 93, 88, 84, 79, 73, 69][index],
}))

const scopeOptions = [
  ['All India', ''],
  ['Chhattisgarh', 'CG'],
  ['Maharashtra', 'MH'],
  ['Odisha', 'OD'],
  ['Madhya Pradesh', 'MP'],
  ['Kerala', 'KL'],
]

const emptyMetrics = {
  total_claims: 0,
  pending_claims: 0,
  approved_claims: 0,
  rejected_claims: 0,
  withdrawn_claims: 0,
  pending_rate: 0,
  approval_rate: 0,
  rejection_rate: 0,
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Math.round(value || 0))
}

function riskColor(score) {
  if (score >= 70) return '#d8533c'
  if (score >= 40) return '#c5a86a'
  return '#5a8d5e'
}

function riskLabel(score, level) {
  if (level) return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase()
  if (score >= 70) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}

function districtRiskLevel(district) {
  const level = String(district?.risk_level || '').toUpperCase()
  if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(level)) return level
  const score = Number(district?.risk_score)
  if (score >= 85) return 'CRITICAL'
  if (score >= 70) return 'HIGH'
  if (score >= 40) return 'MEDIUM'
  return 'LOW'
}

function mergeDistrict(district) {
  const generatedId = String(district.district_id || '').toLowerCase()
  const metadata = districtMeta[district.district_id] || DISTRICT_META.reduce((match, [id, name, stateId]) => {
    const candidate = `${stateId}_${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    return match || (candidate === generatedId ? districtMeta[id] : null)
  }, {}) || {}
  return { ...metadata, ...district, district_name: metadata.district_name || district.district_id }
}

let districtRankingPromise

function fetchAllDistricts() {
  if (!districtRankingPromise) {
    districtRankingPromise = fetch(`${API_URL}/api/districts/?page=1&limit=100&sort=risk_score&order=desc`)
      .then(response => {
        if (!response.ok) throw new Error('Live district risk data unavailable')
        return response.json()
      })
      .then(async firstPage => {
        const total = Number(firstPage.count || firstPage.districts?.length || 0)
        const pageCount = Math.max(1, Math.ceil(total / 100))
        const remainingPages = []
        for (let page = 2; page <= pageCount; page += 1) {
          const response = await fetch(`${API_URL}/api/districts/?page=${page}&limit=100&sort=risk_score&order=desc`)
          if (!response.ok) throw new Error('Live district risk data unavailable')
          remainingPages.push(await response.json())
        }
        return [firstPage, ...remainingPages].flatMap(page => page.districts || [])
      })
      .catch(error => {
        districtRankingPromise = null
        throw error
      })
  }
  return districtRankingPromise
}

// ============================================================================
// MAP COMPONENT
// ============================================================================

function MapControls() {
  const map = useMap()
  useEffect(() => {
    map.setView([22.5, 82], 5)
  }, [map])
  return null
}

function MapScene({ districts, selectedDistrict, onSelect }) {
  return (
    <div className="map-experience">
      <MapContainer center={[22.5, 82]} zoom={5} className="leaflet-map">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <MapControls />
        <ZoomControl position="bottomleft" />
        
        {districts.filter(district => district.latitude != null && district.longitude != null).map(district => (
          <CircleMarker
            key={district.district_id}
            center={[district.latitude, district.longitude]}
            radius={7}
            fillColor={riskColor(district.risk_score)}
            color={selectedDistrict?.district_id === district.district_id ? '#1f6b4a' : '#fff'}
            weight={selectedDistrict?.district_id === district.district_id ? 3 : 1}
            opacity={1}
            fillOpacity={0.8}
            eventHandlers={{ click: () => onSelect(district) }}
          >
            <Tooltip permanent={false} direction="top">
              <strong>{district.district_name}</strong><br />
              Risk: {district.risk_score} ({riskLabel(district.risk_score, district.risk_level)})
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="map-vignette" />
      <div className="map-attribution-saas">
        &copy; OpenStreetMap · वन Vision
      </div>
    </div>
  )
}

function ShellIndiaMap() {
  const [india, setIndia] = useState(null)
  const mapFrameRef = useRef(null)
  const atmosphereRef = useRef(null)
  const contoursRef = useRef(null)

  useEffect(() => {
    window.__fraDistrictMapPromise ||= fetch('/geojson/district_map.geojson')
      .then((response) => {
        if (!response.ok) throw new Error('District map unavailable')
        return response.json()
      })
    window.__fraDistrictMapPromise
      .then((data) => setIndia(data))
      .catch(() => setIndia(null))
  }, [])

  useEffect(() => {
    let frame = 0
    const updatePosition = () => {
      frame = 0
      const scrollDistance = Math.min(window.scrollY, 520)
      if (mapFrameRef.current) mapFrameRef.current.style.transform = `translate3d(0, ${scrollDistance * 0.018}px, 0)`
      if (atmosphereRef.current) atmosphereRef.current.style.transform = `translate3d(0, ${scrollDistance * 0.018}px, 0) scale(1.015)`
      if (contoursRef.current) contoursRef.current.style.transform = `translate3d(0, ${scrollDistance * 0.052}px, 0)`
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updatePosition)
    }
    updatePosition()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return <div className="india-hero-map">
    <div className="india-hero-map-depth">
      <div ref={atmosphereRef} className="india-hero-atmosphere" />
      <svg ref={contoursRef} className="india-hero-contours" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-10 180 Q90 105 190 180 T410 180" />
        <path d="M-10 218 Q110 140 230 218 T410 218" />
        <path d="M-10 254 Q130 190 260 254 T410 254" />
      </svg>
      <div ref={mapFrameRef} className="india-hero-map-layer">
        {!india && <svg className="india-map-image india-fallback-map" viewBox="0 0 520 520" role="img" aria-label="India forest territory map">
          <path d="M151 49 181 35 214 42 241 35 273 48 300 55 326 76 350 83 362 105 389 111 401 132 423 143 413 164 431 181 418 201 430 224 413 239 407 264 389 278 383 304 367 325 356 358 337 375 326 405 307 433 290 466 270 484 255 461 239 450 226 425 208 409 193 382 177 368 168 344 150 329 142 305 125 289 131 264 115 244 123 220 108 199 124 181 119 157 136 140 129 113 146 94Z" />
          <path className="india-fallback-river" d="M160 166c52 12 98 12 148-4 31-10 63-8 94 4M146 224c52 13 100 12 150-3 30-9 62-7 90 5M158 280c49 13 92 13 137-1 31-10 62-9 89 3" />
          <path className="india-fallback-border" d="M151 49 181 35 214 42 241 35 273 48 300 55 326 76 350 83 362 105 389 111 401 132 423 143 413 164 431 181 418 201 430 224 413 239 407 264 389 278 383 304 367 325 356 358 337 375 326 405 307 433 290 466 270 484 255 461 239 450 226 425 208 409 193 382 177 368 168 344 150 329 142 305 125 289 131 264 115 244 123 220 108 199 124 181 119 157 136 140 129 113 146 94Z" />
        </svg>}
        {india && <MapContainer center={[22.5, 79]} zoom={3.4} zoomControl={false} attributionControl={false} keyboard={false} scrollWheelZoom={false} dragging={false} doubleClickZoom={false} touchZoom={false} style={{ height: '100%', width: '100%', background: 'transparent' }}>
          <OverviewMapFit data={india} />
          <GeoJSON data={india} style={{ color: 'rgba(226, 244, 222, .48)', weight: .32, fillColor: '#4e8a5d', fillOpacity: .24 }} />
        </MapContainer>}
      </div>
    </div>
    <strong>INDIA</strong>
    <div className="map-readout"><span>Territory at a glance</span><b>733 districts monitored</b><small>District boundaries and claim signals</small></div>
  </div>
}

function OverviewMapFit({ data }) {
  const map = useMap()
  useEffect(() => {
    const bounds = geoJSON(data).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [46, 46], maxZoom: 4.2, animate: false })
  }, [data, map])
  return null
}

// ============================================================================
// DETAIL PANEL COMPONENT
// ============================================================================

function DetailPanel({ selectedDistrict, anomalyData, loading }) {
  if (!selectedDistrict) {
    return (
      <div className="detail-panel">
        <div className="detail-empty">
          <div className="detail-empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20c0-6.2 2.2-10.7 7-14-1.2 6.1-3.5 10.6-7 14Z" /><path d="M12 20C8.6 16.9 6.4 12.9 5.5 8c4.1 1.2 6.3 4.3 6.5 12Z" /><path d="M12 20V9" /></svg></div>
          <p>Select a district on the map to view detailed environmental assessment.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div>
          <h3 className="detail-title">{selectedDistrict.district_name}</h3>
          <p className="detail-subtitle">{selectedDistrict.state_name} · {selectedDistrict.region}</p>
        </div>
        <div className="detail-risk-badge" style={{ backgroundColor: riskColor(selectedDistrict.risk_score), color: '#fff' }}>
          {selectedDistrict.risk_score}
        </div>
      </div>

      <div className="detail-metrics">
        <div className="metric-mini">
          <span className="metric-label">Risk Level</span>
          <span className="metric-value">{riskLabel(selectedDistrict.risk_score, selectedDistrict.risk_level)}</span>
        </div>
        <div className="metric-mini">
          <span className="metric-label">Pending Claims</span>
          <span className="metric-value">{formatNumber(selectedDistrict.pending_claims)}</span>
        </div>
        <div className="metric-mini">
          <span className="metric-label">Approval Rate</span>
          <span className="metric-value">{selectedDistrict.approval_rate.toFixed(1)}%</span>
        </div>
      </div>

      <div className="detail-section">
        <h4>Key Indicators</h4>
        <ul className="indicator-list">
          <li>Environmental Risk Assessment: {riskLabel(selectedDistrict.risk_score, selectedDistrict.risk_level)}</li>
          <li>Forest Coverage: {selectedDistrict.forest_area_percent}%</li>
          <li>Monitoring Status: Active</li>
          <li>Last Updated: Live</li>
        </ul>
      </div>

      {loading && <p className="detail-status">Loading anomaly data…</p>}
      {!loading && anomalyData.anomalies?.length > 0 && (
        <div className="detail-section">
          <h4>Recent Anomalies</h4>
          <ul className="anomaly-list">
            {anomalyData.anomalies.slice(0, 3).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SIDEBAR BROWSER
// ============================================================================

function DistrictBrowser({ districts, selectedDistrict, onSelect, scope, onScopeChange }) {
  const [search, setSearch] = useState('')

  const filteredDistricts = useMemo(() => {
    return districts.filter(d => {
      const matchSearch = !search || d.district_name?.toLowerCase().includes(search.toLowerCase()) || d.state_name?.toLowerCase().includes(search.toLowerCase())
      const matchScope = !scope || d.state_id === scope
      return matchSearch && matchScope
    })
  }, [districts, search, scope])

  return (
    <div className="district-browser">
      <div className="browser-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search district…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
        <select value={scope} onChange={e => onScopeChange(e.target.value)} className="scope-select">
          {scopeOptions.map(([label, value]) => (
            <option key={label} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="browser-list">
        {filteredDistricts.slice(0, 12).map((district, idx) => (
          <button
            key={district.district_id}
            className={`browser-row ${selectedDistrict?.district_id === district.district_id ? 'active' : ''}`}
            onClick={() => onSelect(district)}
          >
            <span className="row-index">{String(idx + 1).padStart(2, '0')}</span>
            <div className="row-info">
              <strong>{district.district_name}</strong>
              <small>{district.state_name}</small>
            </div>
            <div className="row-score" style={{ color: riskColor(district.risk_score) }}>
              {district.risk_score}
            </div>
          </button>
        ))}
      </div>

      <div className="browser-footer">
        <span>{filteredDistricts.length} districts in view</span>
        <span className="live-indicator">● Live data</span>
      </div>
    </div>
  )
}

// ============================================================================
// AI EXPLANATION PANEL
// ============================================================================

function AIPanel({ selectedDistrict, aiData, loading }) {
  if (!selectedDistrict) return null

  return (
    <div className="ai-panel">
      <div className="ai-header">
        <h4>AI Risk Analysis</h4>
        <span className="ai-badge">AI</span>
      </div>

      {loading && <p className="ai-text muted">Reading district assessment…</p>}
      
      {!loading && aiData?.explanation ? (
        <>
          <p className="ai-text">{aiData.explanation}</p>
          {aiData.key_findings && (
            <div className="ai-findings">
              <strong>Key Findings</strong>
              <ul>
                {aiData.key_findings.slice(0, 3).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="ai-text muted">AI analysis not available for this district yet.</p>
      )}
    </div>
  )
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

function _LegacyApp() {
  const [districts, setDistricts] = useState([])
  const [selectedDistrict, setSelectedDistrict] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [scope, setScope] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [liveMetrics, setLiveMetrics] = useState(null)
  const [liveStates, setLiveStates] = useState([])
  const [overviewError, setOverviewError] = useState(null)
  const [totalDistrictCount, setTotalDistrictCount] = useState(0)
  const [detailState, setDetailState] = useState({ anomalies: {}, ai: null, loading: false })
  const detailAbortRef = useRef(null)

  const metrics = useMemo(() => {
    const high = districts.filter(d => ['HIGH', 'CRITICAL'].includes(districtRiskLevel(d))).length
    const medium = districts.filter(d => districtRiskLevel(d) === 'MEDIUM').length
    const low = districts.filter(d => districtRiskLevel(d) === 'LOW').length
    return {
      ...(liveMetrics || emptyMetrics),
      high_risk: high,
      medium_risk: medium,
      low_risk: low,
    }
  }, [districts, liveMetrics])

  // Fetch live data on mount
  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        setIsLoading(true)
        const [statesResp, metricsResp] = await Promise.all([
          fetch(`${API_URL}/api/states/`),
          fetch(`${API_URL}/api/metrics/`),
        ])
        if (!statesResp.ok || !metricsResp.ok) throw new Error('Live dashboard data unavailable')
        const states = await statesResp.json()
        const liveMetricsResponse = await metricsResp.json()
        setLiveMetrics(liveMetricsResponse || emptyMetrics)
        setLiveStates(states.states || [])
        const liveDistricts = await fetchAllDistricts()
        setDistricts(liveDistricts.map(mergeDistrict))
        setTotalDistrictCount(liveDistricts.length)
        setOverviewError(null)
      } catch (error) {
        setOverviewError(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLiveData()
  }, [])

  // Fetch detail data when district is selected
  useEffect(() => {
    if (!selectedDistrict?.district_id) {
      setDetailState({ anomalies: {}, ai: null, loading: false })
      return
    }

    if (detailAbortRef.current) detailAbortRef.current.abort()
    const controller = new AbortController()
    detailAbortRef.current = controller

    const fetch_detail = async () => {
      setDetailState(prev => ({ ...prev, loading: true }))
      try {
        const [anomResp, aiResp] = await Promise.all([
          fetch(`${API_URL}/api/anomalies/${selectedDistrict.district_id}`, { signal: controller.signal }),
          fetch(`${API_URL}/api/ai/explain/${selectedDistrict.district_id}`, { signal: controller.signal }),
        ])

        const anomalies = anomResp.ok ? await anomResp.json() : {}
        const ai = aiResp.ok ? await aiResp.json() : null

        if (!controller.signal.aborted) {
          setDetailState({ anomalies, ai, loading: false })
        }
      } catch {
        if (!controller.signal.aborted) {
          setDetailState({ anomalies: {}, ai: null, loading: false })
        }
      }
    }

    fetch_detail()
    return () => controller.abort()
  }, [selectedDistrict?.district_id])

  return (
    <div className="saas-app">
      {/* HEADER */}
      <header className="saas-header">
        <div className="header-brand">
          <div className="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20c0-6.2 2.2-10.7 7-14-1.2 6.1-3.5 10.6-7 14Z" /><path d="M12 20C8.6 16.9 6.4 12.9 5.5 8c4.1 1.2 6.3 4.3 6.5 12Z" /><path d="M12 20V9" /></svg></div>
          <div>
            <h1>वन Vision</h1>
            <p>Forest Rights Intelligence</p>
          </div>
        </div>
        <div className="header-status">
          <span className="status-badge">{isLoading ? 'Loading Live Data' : overviewError ? 'Live Data Unavailable' : '✓ Live Data'}</span>
        </div>
      </header>

      <nav aria-label="Primary navigation" style={{ display: 'flex', gap: '8px', padding: '12px 24px' }}>
        <button type="button" onClick={() => setActiveTab('overview')} aria-pressed={activeTab === 'overview'}>
          Overview
        </button>
        <button type="button" onClick={() => setActiveTab('gis')} aria-pressed={activeTab === 'gis'}>
          GIS Explorer
        </button>
      </nav>

      {activeTab === 'overview' ? <>
        {/* METRICS BANNER */}
        <section className="metrics-banner">
        <div className="metrics-container">
          <div className="metric-card">
            <span className="metric-label">High Risk</span>
            <span className="metric-value" style={{ color: '#d8533c' }}>{metrics.high_risk}</span>
            <span className="metric-desc">districts</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Medium Risk</span>
            <span className="metric-value" style={{ color: '#c5a86a' }}>{metrics.medium_risk}</span>
            <span className="metric-desc">districts</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Low Risk</span>
            <span className="metric-value" style={{ color: '#5a8d5e' }}>{metrics.low_risk}</span>
            <span className="metric-desc">districts</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Total Monitored</span>
            <span className="metric-value" style={{ color: '#1f6b4a' }}>{totalDistrictCount || districts.length}</span>
            <span className="metric-desc">districts</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Total Claims</span>
            <span className="metric-value" style={{ color: '#1f6b4a' }}>{formatNumber(metrics.total_claims)}</span>
            <span className="metric-desc">live records</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Pending</span>
            <span className="metric-value">{formatNumber(metrics.pending_claims)}</span>
            <span className="metric-desc">claims</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Approved</span>
            <span className="metric-value">{formatNumber(metrics.approved_claims)}</span>
            <span className="metric-desc">claims</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Rejected</span>
            <span className="metric-value">{formatNumber(metrics.rejected_claims)}</span>
            <span className="metric-desc">claims</span>
          </div>
        </div>
        {overviewError && <p className="detail-status">{overviewError}</p>}
        {isLoading && <p className="detail-status">Loading live dashboard data…</p>}
        {liveStates.length > 0 && <div className="metrics-container" aria-label="Live state summaries">
          {liveStates.map(state => (
            <div className="metric-card" key={state.state_id}>
              <span className="metric-label">{state.state_name}</span>
              <span className="metric-value">{formatNumber(state.total_claims)}</span>
              <span className="metric-desc">{formatNumber(state.pending_claims)} pending</span>
            </div>
          ))}
        </div>}
        </section>

        {/* MAIN LAYOUT */}
        <div className="saas-layout">
        {/* MAP AREA */}
        <div className="layout-map">
          <MapScene districts={districts} selectedDistrict={selectedDistrict} onSelect={setSelectedDistrict} />
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="layout-sidebar">
          {/* District Browser */}
          <DistrictBrowser
            districts={districts}
            selectedDistrict={selectedDistrict}
            onSelect={setSelectedDistrict}
            scope={scope}
            onScopeChange={setScope}
          />

          {/* Detail Panel */}
          <DetailPanel
            selectedDistrict={selectedDistrict}
            anomalyData={detailState.anomalies}
            loading={detailState.loading}
          />

          {/* AI Panel */}
          <AIPanel
            selectedDistrict={selectedDistrict}
            aiData={detailState.ai}
            loading={detailState.loading}
          />
        </div>
        </div>

        {/* FOOTER */}
        <footer className="saas-footer">
          <p>Forest rights monitoring · Evidence before escalation</p>
        </footer>
      </> : <GISExplorer districtData={districts} />}
    </div>
  )
}

function NavIcon({ type }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (type) {
    case 'overview':
      return <svg {...common}><path d="M5 15.5C6.8 12.8 8.8 11.5 11 11.5c2.1 0 4.1 1.2 6 4M5 7.5c1.9 1.6 3.7 2.4 6 2.4s4.1-.8 6-2.4" /><path d="M4 19.5h16" /><path d="M7 5h10l2 2v12H5V7l2-1.5Z" /></svg>
    case 'atlas':
      return <svg {...common}><path d="M4 18.5V7.5l6-3 4 2 6 3v11l-6-3-4 2-6-3Z" /><path d="M10 6.5V18M14 8.5v11" /><path d="M4 10.5l6 3 4-2 6 3" /></svg>
    case 'monitor':
      return <svg {...common}><path d="M5 18V7.5A1.5 1.5 0 0 1 6.5 6h11A1.5 1.5 0 0 1 19 7.5V18" /><path d="M9 18.5h6M8 10.5l2.5-2.5 2.5 2.5 4-4" /><path d="M7.5 6.5h9" /></svg>
    case 'state':
      return <svg {...common}><path d="M6 17.5V8.5l6-3.5 6 3.5v9" /><path d="M6 10.5h12M9 17.5V13h6v4.5" /><path d="M12 6.5v4" /></svg>
    case 'anomalies':
      return <svg {...common}><path d="M12 4.5v9" /><path d="M12 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" /><path d="M4.5 9.5c2 1.4 4.3 2.1 7.5 2.1s5.5-.7 7.5-2.1" /><path d="M7 15.5c1.3.9 2.9 1.4 5 1.4s3.7-.5 5-1.4" /></svg>
    case 'ai':
      return <svg {...common}><path d="M12 3.5c2.6 0 4.5 1.8 4.5 4.1 0 1.5-.9 2.8-2.2 3.5l-1.1.6V13a3 3 0 0 1 0 6H9.5a4 4 0 0 1-3.8-3.3c-.4-2.3 1-4.5 3.5-5.3l1.3-.5A2.8 2.8 0 0 0 12 3.5Z" /><path d="M12 15.5c2.4 0 4 1.4 4 3.2" /><path d="M8.5 9.5c-.7-.9-1.1-2-1.1-3.1" /></svg>
    case 'reports':
      return <svg {...common}><path d="M7 4.5h7l4 4v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-13A1.5 1.5 0 0 1 7.5 5Z" /><path d="M14 4.5V9h4" /><path d="M8.5 13.5h7M8.5 16.5h7" /></svg>
    case 'info':
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 10.5v5" /><path d="M12 7.5h.01" /></svg>
    case 'terrain':
      return <svg {...common}><path d="m3.5 18 5.2-8 3.4 4.2 2.5-3.1 5.9 6.9" /><path d="M3.5 18.5h17" /><path d="m15.3 7.2.01-.01" /></svg>
    default:
      return null
  }
}

const SHELL_NAV = [
  ['/', 'Overview', 'overview'],
  ['/forest-atlas', 'Forest Atlas', 'atlas'],
  ['/fra-monitor', 'FRA Monitor', 'monitor'],
  ['/state-intelligence', 'State Intelligence', 'state'],
  ['/anomalies', 'Anomaly Radar', 'anomalies'],
  ['/reports', 'Reports', 'reports'],
]

function shellFormat(value) {
  return new Intl.NumberFormat('en-IN').format(Math.round(Number(value) || 0))
}

function shellRoute(pathname) {
  if (pathname.startsWith('/district/')) return '/district/:districtId'
  if (pathname === '/about-fra') return '/about-fra'
  return SHELL_NAV.some(([path]) => path === pathname) ? pathname : '/'
}

function ShellCard({ title, children, className = '' }) {
  return <section className={`shell-card ${className}`}><div className="shell-card-heading">{title && <h2>{title}</h2>}</div>{children}</section>
}

function ShellMetric({ label, value, detail, tone = '' }) {
  return <div className={`shell-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function ShellTitle({ title, description }) {
  return <header className="shell-title"><h1>{title}</h1><p>{description}</p></header>
}

function PlaceholderRows({ labels }) {
  return <div className="shell-rows">{labels.map((label, index) => <div key={label}><span><b>0{index + 1}</b>{label}</span><strong>—</strong></div>)}</div>
}

function ShellOverview({ metrics, states, navigate, loading, error }) {
  const leaders = [...states].sort((a, b) => (b.approval_rate || 0) - (a.approval_rate || 0)).slice(0, 5)
  return <div className="shell-stack overview-shell">
    {loading && <div className="shell-data-status">Reading the latest national forest signals...</div>}
    {error && <div className="shell-data-status error">Live overview unavailable. The map remains available, but national metrics could not be loaded.</div>}
    <section className="shell-hero"><div><span className="shell-kicker">National forest overview</span><h1>Forest rights intelligence, in one living view.</h1><p>Read the pressure points across India&apos;s forest rights landscape, then move from signal to district evidence.</p><button className="shell-primary" onClick={() => navigate('/fra-monitor')}>Open FRA Monitor <b>↗</b></button></div><ShellIndiaMap /></section>
    <div className="shell-section-heading"><div><span>National forest snapshot</span><h2>Situation overview</h2></div></div>
    <section className="shell-metric-grid"><ShellMetric label="Total claims" value={shellFormat(metrics.total_claims)} detail="indexed records" /><ShellMetric label="Pending" value={shellFormat(metrics.pending_claims)} detail={`${metrics.pending_rate || 0}% of claims`} tone="amber" /><ShellMetric label="Approved" value={shellFormat(metrics.approved_claims)} detail={`${metrics.approval_rate || 0}% approval`} tone="green" /><ShellMetric label="Rejected" value={shellFormat(metrics.rejected_claims)} detail={`${metrics.rejection_rate || 0}% rejection`} tone="red" /></section>
    <section className="shell-grid three"><ShellCard eyebrow="RISK DISTRIBUTION" title="Where attention concentrates"><div className="shell-bars"><div><span>High priority</span><b>{Math.round(metrics.pending_rate || 0)} signals</b><i className="red-bar" /></div><div><span>Review queue</span><b>{Math.round(metrics.rejection_rate || 0)} signals</b><i className="amber-bar" /></div><div><span>Stable signals</span><b>{states.length * 12} signals</b><i className="green-bar" /></div></div><p className="shell-muted">Risk bands are backed by district analysis where available. No claim is a legal or eligibility decision.</p></ShellCard><ShellCard eyebrow="STATE PERFORMANCE" title="Leading signals"><div className="shell-rank-list">{leaders.length ? leaders.map((state, index) => <div key={state.state_id}><b>0{index + 1}</b><span>{state.state_name}</span><strong>{state.approval_rate || 0}%</strong></div>) : <p className="shell-muted">State summaries are loading from the API.</p>}</div></ShellCard><ShellCard eyebrow="DECISION MODE" title="What needs review"><div className="decision-card"><strong>◎ Prioritize evidence before escalation</strong><p>Start with districts showing delayed processing, unusual land-area signals, or high pending volume.</p><button className="shell-link" onClick={() => navigate('/anomalies')}>View anomaly radar ↗</button></div></ShellCard></section>
  </div>
}

function ShellAtlas() { const [view, setView] = useState('States'); const labels = view === 'States' ? ['Madhya Pradesh', 'Chhattisgarh', 'Odisha', 'Maharashtra'] : ['Andaman and Nicobar Islands', 'Delhi', 'Goa', 'Puducherry']; return <div className="shell-stack"><ShellTitle eyebrow="FOREST ATLAS / 02" title="The forest layer behind every decision" description="Compare forest context across states and Union Territories, with the landscape kept close to every claim signal." /><div className="atlas-controls"><div><button className={view === 'States' ? 'selected' : ''} onClick={() => setView('States')}>States</button><button className={view === 'Union Territories' ? 'selected' : ''} onClick={() => setView('Union Territories')}>Union Territories</button></div><span>{view} forest context</span></div><section className="shell-grid three"><ShellCard eyebrow="FOREST-COVER AREA" title="Area ranking"><PlaceholderRows labels={labels} /></ShellCard><ShellCard eyebrow="FOREST COVER %" title="Coverage ranking"><PlaceholderRows labels={labels} /></ShellCard><ShellCard eyebrow="GEOGRAPHIC AREA" title="Geographic ranking"><PlaceholderRows labels={labels} /></ShellCard></section><section className="shell-grid three">{labels.slice(0, 3).map((name) => <ShellCard key={name} eyebrow="FOREST PROFILE" title={name}><div className="placeholder-profile"><strong>Forest profile</strong><small>Connected forest statistics are not available yet.</small></div></ShellCard>)}</section></div> }

function ShellMonitor() { return <div className="shell-stack"><ShellTitle eyebrow="FRA MONITOR / 03" title="District WebGIS command center" description="Move from national signal to district-level claim density, risk layer, and evidence." /><GISExplorer /></div> }

function ShellStateIntelligence({ states }) { return <div className="shell-stack"><ShellTitle eyebrow="STATE INTELLIGENCE / 04" title="Compare progress, pressure, and risk" description="A state-level operating view for prioritizing reviews across the FRA workflow." /><section className="shell-grid two"><ShellCard eyebrow="STATE PERFORMANCE" title="FRA progress matrix"><div className="state-matrix">{states.slice(0, 12).map((state) => <div key={state.state_id}><span>{state.state_name}</span><b>{shellFormat(state.total_claims)} claims</b><strong>{state.approval_rate || 0}% approved</strong></div>)}</div></ShellCard><ShellCard eyebrow="DECISION SIGNALS" title="Read the pattern"><div className="ai-ready"><b>Review</b><p>Use FRA Monitor to ground state-level patterns in district evidence before escalation.</p></div></ShellCard></section><ShellCard eyebrow="DISTRICT RISK MATRIX" title="Review surface"><div className="matrix-placeholder"><b>733 DISTRICTS</b><strong>Risk matrix visualization is ready for live district ranking data.</strong><small>Use FRA Monitor for the interactive geographic layer.</small></div></ShellCard></div> }

function ShellAnomalies({ navigate }) { return <div className="shell-stack"><ShellTitle eyebrow="ANOMALY RADAR / 05" title="Signals that deserve a closer look" description="Ranked review queues for processing delay, land-area inconsistency, and model-detected anomalies." /><section className="shell-metric-grid"><ShellMetric label="Signal review" value="READY" detail="evidence-led review" tone="green" /><ShellMetric label="Severity bands" value="03" detail="medium · high · critical" tone="amber" /><ShellMetric label="District view" value="733" detail="district surfaces" tone="red" /></section><ShellCard eyebrow="RANKED DISTRICT TABLE" title="Anomaly queue"><div className="shell-empty"><strong>Choose a district in FRA Monitor to inspect live anomaly evidence.</strong><button className="shell-primary" onClick={() => navigate('/fra-monitor')}>Open district map ↗</button></div></ShellCard></div> }

function _ShellAI() { return null }

function ShellReports() { return <div className="shell-stack"><ShellTitle eyebrow="REPORTS / 07" title="Turn signals into a review brief" description="Prepare decision-ready exports for district, state, and national review workflows." /><section className="shell-grid three">{['National situation brief', 'State performance pack', 'District anomaly dossier'].map((title, index) => <ShellCard key={title} eyebrow={`REPORT 0${index + 1}`} title={title}><p className="shell-muted">Report generation is coming soon. The current evidence remains available in FRA Monitor.</p><span className="shell-secondary">Coming soon</span></ShellCard>)}</section></div> }

function ShellDistrict({ districtId, navigate }) { return <div className="shell-stack"><ShellTitle eyebrow="DISTRICT INTELLIGENCE / 08" title={districtId || 'District'} description="Claim statistics, risk score, anomaly signals, and recommended review action." /><ShellCard eyebrow="LIVE DISTRICT DETAIL" title="Open this district in the monitor"><div className="district-placeholder"><strong>{districtId}</strong><p>Select the district on the map to load live claim, risk, and anomaly details.</p><button className="shell-primary" onClick={() => navigate('/fra-monitor')}>Open FRA Monitor ↗</button></div></ShellCard></div> }

function ShellAboutFRA() {
  return <div className="shell-stack fra-reference">
    <section className="fra-reference-hero"><div><span className="fra-reference-kicker">Legal reference · India</span><h1>About the Forest Rights Act</h1><p>The Forest Rights Act is a recognition and governance framework for communities whose lives and livelihoods are closely tied to forests. This guide maps the law to the people, institutions, and evidence that make implementation accountable.</p></div><div className="fra-reference-seal"><span>FRA</span><small>2006</small></div></section>
    <section className="fra-fact-grid">
      <article className="fra-reference-card"><span className="fra-card-index">01</span><h2>What is the FRA?</h2><p>The Scheduled Tribes and Other Traditional Forest Dwellers (Recognition of Forest Rights) Act, 2006 recognises forest rights that were not adequately recorded in earlier processes.</p></article>
      <article className="fra-reference-card"><span className="fra-card-index">02</span><h2>Who does it concern?</h2><p>It concerns eligible Scheduled Tribes and other traditional forest dwellers who have been living in and depending on forest land for habitation, livelihood, and customary use.</p></article>
      <article className="fra-reference-card"><span className="fra-card-index">03</span><h2>What rights does it address?</h2><p>Rights may include individual forest rights, community rights, community forest resource rights, habitat rights for particularly vulnerable tribal groups, and rights over minor forest produce.</p></article>
      <article className="fra-reference-card"><span className="fra-card-index">04</span><h2>Why does monitoring matter?</h2><p>Good monitoring makes delays, missing evidence, inconsistent records, and uneven outcomes visible before they become barriers to a fair decision.</p></article>
    </section>
    <section className="fra-reference-section"><div className="fra-section-heading"><span>Law and rules</span><h2>The legal frame</h2></div><div className="fra-law-grid"><div><h3>The Act</h3><p>The 2006 Act establishes the rights and the recognition process. It places the Gram Sabha at the centre of claim initiation and community verification.</p></div><div><h3>The Rules</h3><p>The Forest Rights Rules, 2008, with later amendments, describe how claims are received, verified, reviewed, recorded, and monitored through the statutory committees.</p></div><div><h3>Important safeguard</h3><p>Section 4(5) protects eligible claimants from eviction until the recognition and verification process is complete. Rights recognised under the Act are generally heritable, but not alienable or transferable.</p></div></div></section>
    <section className="fra-reference-section"><div className="fra-section-heading"><span>Recognition pathway</span><h2>How a claim moves</h2></div><div className="fra-process"><div className="fra-process-step"><b>01</b><h3>Claim</h3><p>A person or community submits a claim with available evidence.</p></div><div className="fra-process-step"><b>02</b><h3>Gram Sabha</h3><p>The village assembly receives, verifies, and passes a resolution.</p></div><div className="fra-process-step"><b>03</b><h3>SDLC review</h3><p>The Sub-Divisional Level Committee examines the resolution and records.</p></div><div className="fra-process-step"><b>04</b><h3>DLC decision</h3><p>The District Level Committee considers the recommendation and records the decision.</p></div></div></section>
    <section className="fra-reference-section"><div className="fra-section-heading"><span>Institutions and accountability</span><h2>Who does what?</h2></div><div className="fra-authority-grid"><div className="fra-authority"><h3>Gram Sabha</h3><p>Receives claims, verifies evidence on the ground, hears community knowledge, and adopts the first resolution.</p></div><div className="fra-authority"><h3>Sub-Divisional Level Committee</h3><p>Reviews Gram Sabha resolutions, checks records, and sends a reasoned recommendation forward.</p></div><div className="fra-authority"><h3>District Level Committee</h3><p>Acts as the decision-making committee for recognition at district level and directs record updates.</p></div><div className="fra-authority"><h3>State Level Monitoring Committee</h3><p>Monitors implementation across the state, identifies systemic gaps, and supports coordination.</p></div><div className="fra-authority"><h3>Ministry of Tribal Affairs</h3><p>Serves as the nodal Union ministry for policy guidance, rules, and national monitoring.</p></div></div></section>
    <section className="fra-principle-note"><div><span>Governance principle</span><h2>Rights recognition is not a policing workflow.</h2></div><p>Forest Rights Intelligence can help people find patterns in records and workloads. It should support due process, transparency, and human review, never replace the statutory authorities or decide eligibility on its own.</p></section>
    <p className="fra-reference-disclaimer">Reference guide only. The Act, Rules, official notifications, and decisions of the competent authorities prevail in any specific matter.</p>
  </div>
}

const APP_SHELL_STYLES = `
  :root { --vision-ink: #17382b; --vision-muted: #60786a; --vision-faint: #8fa697; --vision-green: #2f7950; --vision-soft: #dfeee1; --vision-line: rgba(53, 104, 72, .16); }
  body { background: #edf4ed; }
  .command-shell { min-height: 100vh; color: var(--vision-ink); background: radial-gradient(circle at 72% -10%, rgba(139, 190, 139, .28), transparent 34rem), linear-gradient(135deg, #f7fbf6, #e8f1e8 58%, #f3f7f1); font-family: "Avenir Next", "Segoe UI", sans-serif; }
  .command-shell::before { opacity: .16; background-image: linear-gradient(rgba(64, 123, 79, .1) 1px, transparent 1px), linear-gradient(90deg, rgba(64, 123, 79, .1) 1px, transparent 1px); background-size: 88px 88px; }
  .shell-sidebar { width: 252px; padding: 28px 18px 22px; border-right: 1px solid rgba(67, 112, 81, .16); background: rgba(249, 253, 248, .72); box-shadow: 16px 0 42px rgba(42, 83, 54, .06); backdrop-filter: blur(24px); }
  .shell-brand { padding: 0 12px 32px; }
  .shell-brand > b, .shell-brand .brand-mark { width: 38px; height: 38px; border: 1px solid rgba(47, 121, 80, .32); border-radius: 13px; background: rgba(213, 236, 216, .65); color: var(--vision-green); font-family: Georgia, serif; box-shadow: inset 0 1px 0 rgba(255,255,255,.8); }
  .shell-brand strong { color: var(--vision-ink); font-family: Georgia, serif; font-size: 16px; font-weight: 700; letter-spacing: -.02em; }
  .shell-brand small { color: var(--vision-muted); font-size: 10px; letter-spacing: .01em; text-transform: none; }
  .shell-sidebar nav { gap: 7px; }
  .shell-sidebar nav button { min-height: 44px; border: 1px solid transparent; border-radius: 12px; background: rgba(232, 243, 232, .28); color: var(--vision-muted); font-size: 13px; }
  .shell-sidebar nav button i { width: 28px; height: 28px; border: 0; border-radius: 9px; background: rgba(205, 230, 208, .62); color: var(--vision-green); }
  .shell-sidebar nav button:hover, .shell-sidebar nav button.active { border-color: rgba(67, 130, 84, .18); background: rgba(199, 227, 202, .7); color: var(--vision-ink); box-shadow: inset 0 1px 0 rgba(255,255,255,.8), 0 10px 24px rgba(54, 104, 64, .08); }
  .shell-sidebar nav button b { color: var(--vision-green); }
  .sidebar-bottom { display: flex; justify-content: flex-start; margin-top: auto; padding: 18px 12px 0; border-top: 1px solid var(--vision-line); }
  .sidebar-info { display: inline-flex; align-items: center; justify-content: flex-start; gap: 9px; width: auto; min-height: 38px; padding: 0 12px; border: 1px solid rgba(47, 121, 80, .2); border-radius: 12px; background: rgba(232, 244, 232, .68); color: var(--vision-green); font: 600 12px "Avenir Next", "Segoe UI", sans-serif; box-shadow: inset 0 1px 0 rgba(255,255,255,.75); }
  .sidebar-info svg { width: 18px; height: 18px; }
  .shell-main { width: calc(100% - 252px); margin-left: 252px; }
  .shell-topbar { height: 78px; padding: 0 46px; border-bottom: 1px solid var(--vision-line); background: rgba(248, 252, 247, .48); backdrop-filter: blur(18px); }
  .shell-topbar > .context-pill { display: inline-flex; width: fit-content; min-width: 0; height: auto; align-items: center; justify-content: center; gap: 9px; padding: 9px 13px; }
  .context-pill { display: inline-flex; align-items: center; gap: 9px; padding: 9px 13px; border: 1px solid rgba(65, 117, 76, .18); border-radius: 999px; background: rgba(245, 251, 244, .62); color: var(--vision-muted); font-size: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,.8), 0 8px 20px rgba(55, 103, 64, .05); backdrop-filter: blur(14px); }
  .context-pill svg { width: 15px; height: 15px; color: var(--vision-green); }
  .context-pill em { color: #9bb59e; font-style: normal; }
  .shell-content { max-width: 1500px; padding: 44px 46px 82px; }
  .shell-stack { gap: 28px; }
  .shell-data-status { padding: 12px 15px; border: 1px solid rgba(47, 121, 80, .16); border-radius: 12px; background: rgba(255, 255, 255, .48); color: var(--vision-muted); font-size: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,.8); }
  .shell-data-status.error { border-color: rgba(177, 103, 68, .24); background: rgba(255, 244, 235, .72); color: #8a5139; }
  .shell-title { max-width: 800px; padding-bottom: 2px; }
  .shell-title h1, .shell-hero h1 { color: var(--vision-ink); font-family: Georgia, "Times New Roman", serif; font-weight: 500; letter-spacing: -.045em; }
  .shell-title h1 { margin: 0 0 12px; font-size: clamp(34px, 4vw, 56px); }
  .shell-title p, .shell-hero p { color: var(--vision-muted); line-height: 1.75; }
  .shell-kicker { color: var(--vision-green); font: 500 12px/1.2 "Avenir Next", "Segoe UI", sans-serif; letter-spacing: .02em; text-transform: none; }
  .shell-hero { position: relative; overflow: hidden; grid-template-columns: .86fr 1.14fr; gap: 28px; min-height: 376px; padding: 34px; border: 1px solid rgba(66, 119, 77, .15); border-radius: 24px; background: linear-gradient(120deg, rgba(249, 253, 248, .78), rgba(225, 241, 226, .5)); box-shadow: 0 24px 58px rgba(45, 91, 54, .1), inset 0 1px 0 rgba(255,255,255,.9); backdrop-filter: blur(22px); }
  .shell-hero > div:first-child { position: relative; z-index: 2; padding: 8px 0 12px; }
  .shell-hero h1 { max-width: 620px; margin: 15px 0 14px; font-size: clamp(40px, 4.5vw, 68px); line-height: .99; }
  .shell-hero p { max-width: 500px; margin-bottom: 26px; font-size: 15px; }
  .shell-primary { border-color: rgba(47, 121, 80, .28); border-radius: 10px; background: rgba(65, 137, 87, .12); color: var(--vision-ink); box-shadow: inset 0 1px 0 rgba(255,255,255,.7); }
  .shell-primary:hover { background: rgba(65, 137, 87, .19); }
  .india-hero-map { min-height: 308px; border: 1px solid rgba(104, 155, 104, .25); border-radius: 20px; background: radial-gradient(circle at 55% 45%, rgba(121, 182, 116, .34), transparent 52%), linear-gradient(145deg, #cfe8cf, #86b995); box-shadow: inset 0 0 80px rgba(255,255,255,.28), 0 18px 38px rgba(47, 109, 62, .14); }
  .india-hero-map-depth { position: absolute; inset: 0; z-index: 2; overflow: hidden; }
  .india-hero-map-layer { position: absolute; inset: -12px 0; z-index: 2; transition: transform .22s ease-out; }
  .india-fallback-map { position: absolute; inset: 6% 18% 2% 18%; z-index: 1; width: 64%; height: 92%; overflow: visible; filter: drop-shadow(0 18px 18px rgba(24, 79, 39, .18)); }
  .india-fallback-map path { fill: #4e8a5d; stroke: rgba(229, 247, 222, .8); stroke-width: 2; stroke-linejoin: round; }
  .india-fallback-map .india-fallback-river { fill: none; stroke: rgba(201, 235, 191, .42); stroke-width: 3; }
  .india-fallback-map .india-fallback-border { fill: none; stroke: rgba(238, 250, 229, .78); stroke-width: 2; }
  .india-hero-map .leaflet-container { z-index: 2; opacity: .96; filter: drop-shadow(0 18px 18px rgba(24, 79, 39, .18)); }
  .india-hero-map .leaflet-overlay-pane path { stroke: rgba(229, 247, 222, .82); stroke-width: .8; }
  .india-hero-map .leaflet-overlay-pane path.leaflet-interactive { pointer-events: none !important; }
  .india-hero-atmosphere { position: absolute; inset: -8%; z-index: 1; pointer-events: none; opacity: .55; background: repeating-radial-gradient(ellipse at 52% 45%, transparent 0 28px, rgba(236, 250, 227, .25) 29px 30px, transparent 31px 58px), radial-gradient(circle at 40% 30%, rgba(255,255,255,.28), transparent 26%); mix-blend-mode: screen; transition: transform .28s ease-out; }
  .india-hero-contours { position: absolute; inset: -5% 0; z-index: 3; width: 100%; height: 110%; pointer-events: none; opacity: .42; transition: transform .24s ease-out; }
  .india-hero-contours path { fill: none; stroke: rgba(231, 248, 225, .34); stroke-width: 1; }
  .india-hero-map > strong { z-index: 3; top: 22px; left: 25px; color: rgba(242, 253, 235, .88); font: 500 12px Georgia, serif; letter-spacing: .18em; }
  .map-readout { z-index: 3; right: 17px; bottom: 17px; padding: 14px 16px; border: 1px solid rgba(235, 250, 231, .34); border-left: 2px solid #e3f4d7; border-radius: 13px; background: rgba(26, 77, 40, .46); color: #f0faea; box-shadow: 0 12px 28px rgba(22, 73, 35, .15); backdrop-filter: blur(14px); }
  .map-readout span, .map-readout small { color: rgba(235, 249, 230, .78); font: 10px "Avenir Next", "Segoe UI", sans-serif; letter-spacing: .01em; text-transform: none; }
  .map-readout b { color: #fff; font-family: Georgia, serif; font-size: 16px; font-weight: 500; }
  .shell-section-heading > div > span { color: var(--vision-green); font: 500 12px "Avenir Next", "Segoe UI", sans-serif; letter-spacing: .02em; text-transform: none; }
  .shell-section-heading h2 { color: var(--vision-ink); font: 500 30px Georgia, serif; letter-spacing: -.03em; }
  .shell-metric, .shell-card, .fra-info-page > div { border: 1px solid var(--vision-line); border-radius: 16px; background: rgba(250, 253, 249, .62); box-shadow: 0 16px 34px rgba(52, 96, 58, .07), inset 0 1px 0 rgba(255,255,255,.82); backdrop-filter: blur(18px); }
  .shell-metric { padding: 20px; }
  .shell-metric span, .shell-metric small, .shell-muted { color: var(--vision-muted); }
  .shell-metric strong, .shell-card h2, .fra-info-page h2 { color: var(--vision-ink); font-family: Georgia, serif; font-weight: 500; letter-spacing: -.025em; }
  .shell-card { padding: 22px; }
  .shell-card-heading { margin-bottom: 18px; }
  .shell-card-heading h2 { margin: 0; font-size: 22px; }
  .shell-bars i { opacity: .72; }
  .shell-card, .shell-metric, .fra-reference-card, .fra-law-grid > div, .fra-authority { background: rgba(255, 255, 255, .5); border-color: rgba(54, 112, 73, .22); box-shadow: 0 18px 38px rgba(45, 91, 54, .08), inset 0 1px 0 rgba(255,255,255,.9); backdrop-filter: blur(22px) saturate(120%); }
  .shell-sidebar nav button { background: rgba(255, 255, 255, .25); }
  .shell-sidebar nav button:hover, .shell-sidebar nav button.active { background: rgba(210, 235, 213, .62); }
  .shell-section-heading { margin-top: 4px; }
  .fra-info-page > div { padding: 26px; }
  .fra-info-page h2 { margin: 0 0 10px; font-size: 22px; }
  .fra-info-page p { color: var(--vision-muted); line-height: 1.75; }
  .fra-reference { gap: 30px; }
  .fra-reference-hero { display: flex; align-items: center; justify-content: space-between; gap: 32px; padding: 30px 34px; border: 1px solid var(--vision-line); border-radius: 22px; background: linear-gradient(120deg, rgba(250, 253, 249, .76), rgba(217, 237, 219, .6)); box-shadow: 0 18px 42px rgba(52, 96, 58, .08), inset 0 1px 0 rgba(255,255,255,.86); }
  .fra-reference-hero h1 { margin: 9px 0 12px; color: var(--vision-ink); font: 500 clamp(36px, 4vw, 58px)/1.02 Georgia, serif; letter-spacing: -.045em; }
  .fra-reference-hero p { max-width: 760px; margin: 0; color: var(--vision-muted); line-height: 1.75; }
  .fra-reference-kicker, .fra-section-heading span, .fra-principle-note span { color: var(--vision-green); font-size: 12px; letter-spacing: .03em; }
  .fra-reference-seal { display: grid; flex: 0 0 112px; place-items: center; width: 112px; height: 112px; border: 1px solid rgba(47, 121, 80, .24); border-radius: 50%; background: rgba(233, 246, 232, .72); color: var(--vision-green); box-shadow: inset 0 0 0 8px rgba(255,255,255,.28), 0 12px 26px rgba(49, 103, 58, .08); }
  .fra-reference-seal span { font: 500 27px Georgia, serif; }
  .fra-reference-seal small { margin-top: -38px; color: var(--vision-muted); font-size: 10px; }
  .fra-fact-grid, .fra-law-grid, .fra-authority-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .fra-reference-card, .fra-law-grid > div, .fra-authority { padding: 24px; border: 1px solid var(--vision-line); border-radius: 16px; background: rgba(250, 253, 249, .62); box-shadow: 0 14px 30px rgba(52, 96, 58, .06), inset 0 1px 0 rgba(255,255,255,.82); backdrop-filter: blur(16px); }
  .fra-card-index { color: var(--vision-green); font: 12px Georgia, serif; }
  .fra-reference-card h2, .fra-law-grid h3, .fra-authority h3 { margin: 12px 0 9px; color: var(--vision-ink); font-family: Georgia, serif; font-weight: 500; letter-spacing: -.02em; }
  .fra-reference-card h2 { font-size: 22px; }
  .fra-law-grid h3, .fra-authority h3 { margin-top: 0; font-size: 18px; }
  .fra-reference-card p, .fra-law-grid p, .fra-authority p { margin: 0; color: var(--vision-muted); line-height: 1.72; }
  .fra-reference-section { display: grid; gap: 16px; }
  .fra-section-heading h2 { margin: 7px 0 0; color: var(--vision-ink); font: 500 30px Georgia, serif; letter-spacing: -.03em; }
  .fra-process { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--vision-line); border-radius: 16px; background: rgba(250, 253, 249, .62); box-shadow: 0 14px 30px rgba(52, 96, 58, .06); }
  .fra-process-step { min-height: 180px; padding: 22px; border-right: 1px solid var(--vision-line); }
  .fra-process-step:last-child { border-right: 0; }
  .fra-process-step b { color: var(--vision-green); font: 13px Georgia, serif; }
  .fra-process-step h3 { margin: 20px 0 8px; color: var(--vision-ink); font: 500 18px Georgia, serif; }
  .fra-process-step p { margin: 0; color: var(--vision-muted); font-size: 13px; line-height: 1.6; }
  .fra-authority-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .fra-principle-note { display: grid; grid-template-columns: .9fr 1.1fr; gap: 26px; align-items: center; padding: 24px 28px; border: 1px solid rgba(47, 121, 80, .2); border-radius: 16px; background: linear-gradient(120deg, rgba(213, 236, 214, .68), rgba(246, 251, 244, .7)); }
  .fra-principle-note h2 { margin: 8px 0 0; color: var(--vision-ink); font: 500 25px Georgia, serif; letter-spacing: -.03em; }
  .fra-principle-note p { margin: 0; color: var(--vision-muted); line-height: 1.72; }
  .fra-reference-disclaimer { margin: 0; color: var(--vision-faint); font-size: 12px; line-height: 1.6; }
  .forest-ai-launcher { right: 26px; bottom: 26px; display: inline-flex; align-items: center; gap: 10px; width: auto; min-width: 154px; height: 66px; padding: 5px 16px 5px 5px; border-color: rgba(47, 121, 80, .3); border-radius: 999px; background: rgba(242, 250, 239, .78); color: var(--vision-ink); box-shadow: 0 18px 38px rgba(45, 102, 54, .2), inset 0 1px 0 rgba(255,255,255,.9); backdrop-filter: blur(18px); }
  .forest-ai-orb { flex: 0 0 54px; width: 54px; height: 54px; background: radial-gradient(circle at 38% 30%, #c8e7c7, #57966a 58%, #286043); }
  .forest-ai-orb svg { width: 25px; height: 25px; stroke: #f4fff0; stroke-width: 1.5; fill: none; }
  .forest-ai-label { color: var(--vision-ink); font: 600 13px "Avenir Next", "Segoe UI", sans-serif; letter-spacing: .01em; }
  .forest-ai-panel { border-color: rgba(47, 121, 80, .2); background: rgba(247, 252, 246, .82); color: var(--vision-ink); box-shadow: 0 24px 50px rgba(37, 83, 45, .18); backdrop-filter: blur(22px); }
  .forest-ai-header strong, .forest-ai-message { color: var(--vision-ink); }
  .forest-ai-header span, .forest-ai-message { color: var(--vision-muted); }
  .forest-ai-message, .forest-ai-chips button, .forest-ai-input-row input { border-color: rgba(47, 121, 80, .16); background: rgba(226, 241, 226, .6); color: var(--vision-ink); }
  @media (max-width: 1000px) { .shell-content { padding: 32px 24px 60px; } .shell-topbar { padding: 0 24px; } .shell-hero { grid-template-columns: 1fr; } .sidebar-info span { display: none; } .sidebar-info { width: 38px; padding: 0; justify-content: center; } }
  @media (max-width: 1000px) { .shell-topbar > .context-pill { align-self: center; } .fra-reference-hero { align-items: flex-start; } .fra-process { grid-template-columns: repeat(2, minmax(0, 1fr)); } .fra-process-step:nth-child(2) { border-right: 0; } .fra-process-step:nth-child(-n+2) { border-bottom: 1px solid var(--vision-line); } .fra-authority-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 680px) { .shell-content { padding: 25px 15px 50px; } .shell-topbar { padding: 0 15px; } .shell-hero { padding: 24px; } .shell-hero h1 { font-size: 42px; } .fra-info-page, .fra-fact-grid, .fra-law-grid, .fra-authority-grid { grid-template-columns: 1fr; } .fra-reference-hero { display: block; padding: 24px; } .fra-reference-seal { margin-top: 24px; } .fra-process { grid-template-columns: 1fr; } .fra-process-step, .fra-process-step:nth-child(2) { border-right: 0; border-bottom: 1px solid var(--vision-line); } .fra-process-step:last-child { border-bottom: 0; } .fra-principle-note { grid-template-columns: 1fr; } }
`

function ForestAILauncher({ open, onToggle, onClose, onNavigate }) {
  return (
    <>
      <button type="button" className="forest-ai-launcher" onClick={onToggle} aria-label="वन AI assistant" title="वन AI">
        <span className="forest-ai-orb">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 4.5C12.1 4.9 7.1 8 7.1 13.1c0 3.8 2.5 5.8 5.4 5.8 4.5 0 6.6-4.9 7-14.4Z" /><path d="M5 20c1.7-4.1 4.6-7 9.1-9.1" /><path d="m18.6 3.2.01-.01" /></svg>
        </span>
        <span className="forest-ai-label">वन AI</span>
      </button>
      {open && (
        <div className="forest-ai-panel">
          <div className="forest-ai-header">
            <div>
              <strong>वन AI</strong>
              <span>Your forest intelligence assistant</span>
            </div>
            <button type="button" className="forest-ai-close" onClick={onClose} aria-label="Close वन AI">×</button>
          </div>
          <div className="forest-ai-chat">
            <div className="forest-ai-message">I can help interpret district risk, anomaly pressure, and state-level evidence once the assistant service is connected.</div>
          </div>
          <div className="forest-ai-chips">
            <button type="button" onClick={() => onNavigate('/state-intelligence')}>Which states need attention?</button>
            <button type="button" onClick={() => onNavigate('/anomalies')}>Which districts have critical anomalies?</button>
            <button type="button" onClick={() => onNavigate('/fra-monitor')}>Why is this district flagged?</button>
            <button type="button" onClick={() => onNavigate('/state-intelligence')}>Compare two states.</button>
          </div>
          <div className="forest-ai-input-row">
            <input type="text" placeholder="Open FRA Monitor for evidence" readOnly onFocus={() => onNavigate('/fra-monitor')} />
            <button type="button" onClick={() => onNavigate('/fra-monitor')}>Open</button>
          </div>
        </div>
      )}
    </>
  )
}

function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [metrics, setMetrics] = useState({})
  const [states, setStates] = useState([])
  const [aiOpen, setAiOpen] = useState(false)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState('')
  useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  useEffect(() => { let active = true; setOverviewLoading(true); Promise.all([fetch(`${API_URL}/api/metrics/`), fetch(`${API_URL}/api/states/`)]).then(async ([metricsResponse, statesResponse]) => { if (!metricsResponse.ok || !statesResponse.ok) throw new Error('Live overview unavailable'); const [liveMetrics, liveStates] = await Promise.all([metricsResponse.json(), statesResponse.json()]); if (active) { setMetrics(liveMetrics); setStates(liveStates.states || []); setOverviewError('') } }).catch((error) => { if (active) setOverviewError(error.message || 'Live overview unavailable') }).finally(() => { if (active) setOverviewLoading(false) }); return () => { active = false } }, [])
  function navigate(nextPath) { window.history.pushState({}, '', nextPath); setPath(nextPath) }
  const route = shellRoute(path)
  const districtId = path.startsWith('/district/') ? decodeURIComponent(path.split('/')[2]) : ''
  const content = route === '/' ? <ShellOverview metrics={metrics} states={states} navigate={navigate} loading={overviewLoading} error={overviewError} /> : route === '/forest-atlas' ? <ShellAtlas /> : route === '/fra-monitor' ? <ShellMonitor /> : route === '/state-intelligence' ? <ShellStateIntelligence states={states} navigate={navigate} /> : route === '/anomalies' ? <ShellAnomalies navigate={navigate} /> : route === '/reports' ? <ShellReports /> : route === '/about-fra' ? <ShellAboutFRA /> : <ShellDistrict districtId={districtId} navigate={navigate} />
  return <div className="command-shell"><style>{APP_SHELL_STYLES}</style><aside className="shell-sidebar"><div className="shell-brand"><div className="brand-mark">वन</div><span><strong>वन Vision</strong><small>Forest Rights Intelligence</small></span></div><nav>{SHELL_NAV.map(([href, label, icon]) => <button key={href} className={route === href ? 'active' : ''} onClick={() => navigate(href)}><i><NavIcon type={icon} /></i><span>{label}</span>{route === href && <b>›</b>}</button>)}</nav><div className="sidebar-bottom"><button type="button" className={`sidebar-info ${route === '/about-fra' ? 'active' : ''}`} onClick={() => navigate('/about-fra')} aria-label="More about the Forest Rights Act" title="More about the Forest Rights Act"><NavIcon type="info" /><span>More about FRA</span></button></div></aside><main className="shell-main"><header className="shell-topbar"><div className="context-pill"><NavIcon type="terrain" /><span>India</span><em>•</em><span>Forest Rights</span></div></header><div className="shell-content">{content}</div></main><ForestAILauncher open={aiOpen} onToggle={() => setAiOpen((current) => !current)} onClose={() => setAiOpen(false)} onNavigate={(nextPath) => { navigate(nextPath); setAiOpen(false) }} /></div>
}

export default App