import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

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

const demoDistricts = DISTRICT_META.map(([id], index) => ({
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

const demoMetrics = {
  total_claims: 24580,
  pending_claims: 3842,
  approved_claims: 14872,
  rejected_claims: 5021,
  pending_rate: 15.63,
  approval_rate: 60.5,
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

function mergeDistrict(district) {
  const metadata = districtMeta[district.district_id] || {}
  return { ...metadata, ...district, district_name: metadata.district_name || district.district_id }
}

// ============================================================================
// MAP COMPONENT
// ============================================================================

function MapScene({ districts, selectedDistrict, onSelect }) {
  const MapControls = () => {
    const map = useMap()
    useEffect(() => map.setView([22.5, 82], 5), [map])
    return null
  }

  return (
    <div className="map-experience">
      <MapContainer center={[22.5, 82]} zoom={5} className="leaflet-map">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <MapControls />
        <ZoomControl position="bottomleft" />
        
        {districts.map(district => (
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
        &copy; OpenStreetMap · FRATRACK Environmental Intelligence
      </div>
    </div>
  )
}

// ============================================================================
// DETAIL PANEL COMPONENT
// ============================================================================

function DetailPanel({ selectedDistrict, anomalyData, loading }) {
  if (!selectedDistrict) {
    return (
      <div className="detail-panel">
        <div className="detail-empty">
          <div className="detail-empty-icon">🌿</div>
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

export default function App() {
  const [districts, setDistricts] = useState(demoDistricts)
  const [selectedDistrict, setSelectedDistrict] = useState(null)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [usingDemo, setUsingDemo] = useState(true)
  const [detailState, setDetailState] = useState({ anomalies: {}, ai: null, loading: false })
  const detailAbortRef = useRef(null)

  const metrics = useMemo(() => {
    const high = districts.filter(d => d.risk_score >= 70).length
    const medium = districts.filter(d => d.risk_score >= 40 && d.risk_score < 70).length
    const low = districts.length - high - medium
    return {
      ...demoMetrics,
      high_risk: high,
      medium_risk: medium,
      low_risk: low,
    }
  }, [districts])

  // Fetch live data on mount
  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        setIsLoading(true)
        const resp = await fetch(`${API_URL}/api/districts?limit=100&sort=risk_score&order=desc`)
        if (resp.ok) {
          const data = await resp.json()
          const merged = (Array.isArray(data) ? data : data.results || []).map(mergeDistrict)
          if (merged.length > 0) {
            setDistricts(merged)
            setUsingDemo(false)
          }
        }
      } catch {
        // Use demo data
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
          fetch(`${API_URL}/api/ai/${selectedDistrict.district_id}`, { signal: controller.signal }),
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
          <div className="brand-mark">🌿</div>
          <div>
            <h1>FRATRACK</h1>
            <p>Environmental Intelligence Platform</p>
          </div>
        </div>
        <div className="header-status">
          <span className="status-badge">{usingDemo ? '📊 Demo Data' : '✓ Live Data'}</span>
        </div>
      </header>

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
            <span className="metric-value" style={{ color: '#1f6b4a' }}>{districts.length}</span>
            <span className="metric-desc">districts</span>
          </div>
        </div>
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
        <p>FRATRACK Environmental Intelligence · Forest Rights Monitoring · Data: Composite Risk Score</p>
      </footer>
    </div>
  )
}