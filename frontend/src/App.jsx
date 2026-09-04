import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, ZoomControl, useMap } from 'react-leaflet'
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

function MapScene({ districts, selectedDistrict, onSelect }) {
  const MapControls = () => {
    const map = useMap()
    useEffect(() => {
      map.setView([22.5, 82], 5)
    }, [map])
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

function LegacyApp() {
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
          <div className="brand-mark">🌿</div>
          <div>
            <h1>FRATRACK</h1>
            <p>Environmental Intelligence Platform</p>
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
          <p>FRATRACK Environmental Intelligence · Forest Rights Monitoring · Data: Composite Risk Score</p>
        </footer>
      </> : <GISExplorer districtData={districts} />}
    </div>
  )
}

const SHELL_NAV = [
  ['/', 'Overview', 'OV'],
  ['/forest-atlas', 'Forest Atlas', 'FA'],
  ['/fra-monitor', 'FRA Monitor', 'FM'],
  ['/state-intelligence', 'State Intelligence', 'SI'],
  ['/anomalies', 'Anomaly Radar', 'AR'],
  ['/ai-assistant', 'Forest AI', 'AI'],
  ['/reports', 'Reports', 'RP'],
]

function shellFormat(value) {
  return new Intl.NumberFormat('en-IN').format(Math.round(Number(value) || 0))
}

function shellRoute(pathname) {
  if (pathname.startsWith('/district/')) return '/district/:districtId'
  return SHELL_NAV.some(([path]) => path === pathname) ? pathname : '/'
}

function ShellCard({ eyebrow, title, children, className = '' }) {
  return <section className={`shell-card ${className}`}><div className="shell-card-heading"><span>{eyebrow}</span>{title && <h2>{title}</h2>}</div>{children}</section>
}

function ShellMetric({ label, value, detail, tone = '' }) {
  return <div className={`shell-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function ShellTitle({ eyebrow, title, description }) {
  return <header className="shell-title"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>
}

function PlaceholderRows({ labels }) {
  return <div className="shell-rows">{labels.map((label, index) => <div key={label}><span><b>0{index + 1}</b>{label}</span><strong>—</strong></div>)}</div>
}

function ShellOverview({ metrics, states, loading, navigate }) {
  const leaders = [...states].sort((a, b) => (b.approval_rate || 0) - (a.approval_rate || 0)).slice(0, 5)
  return <div className="shell-stack overview-shell">
    <section className="shell-hero"><div><span className="shell-kicker">NATIONAL DECISION DESK / 01</span><h1>Forest rights intelligence, in one living view.</h1><p>Read the pressure points across India&apos;s forest rights landscape, then move from signal to district evidence.</p><button className="shell-primary" onClick={() => navigate('/fra-monitor')}>Open FRA Monitor <b>↗</b></button><small className="data-notice">Synthetic/demo FRA data · backend connected</small></div><div className="india-hero-map"><div className="contours" /><strong>INDIA</strong><div className="map-readout"><span>ACTIVE TERRITORY SCAN</span><b>733 districts</b><small>20,000 claim records indexed</small></div></div></section>
    <div className="shell-section-heading"><div><span>National forest snapshot</span><h2>Situation overview</h2></div><em>● {loading ? 'Syncing' : 'Live API'} · synthetic data</em></div>
    <section className="shell-metric-grid"><ShellMetric label="Total claims" value={shellFormat(metrics.total_claims)} detail="indexed records" /><ShellMetric label="Pending" value={shellFormat(metrics.pending_claims)} detail={`${metrics.pending_rate || 0}% of claims`} tone="amber" /><ShellMetric label="Approved" value={shellFormat(metrics.approved_claims)} detail={`${metrics.approval_rate || 0}% approval`} tone="green" /><ShellMetric label="Rejected" value={shellFormat(metrics.rejected_claims)} detail={`${metrics.rejection_rate || 0}% rejection`} tone="red" /></section>
    <section className="shell-grid three"><ShellCard eyebrow="RISK DISTRIBUTION" title="Where attention concentrates"><div className="shell-bars"><div><span>High priority</span><b>{Math.round(metrics.pending_rate || 0)} signals</b><i className="red-bar" /></div><div><span>Review queue</span><b>{Math.round(metrics.rejection_rate || 0)} signals</b><i className="amber-bar" /></div><div><span>Stable signals</span><b>{states.length * 12} signals</b><i className="green-bar" /></div></div><p className="shell-muted">Risk bands are backed by district analysis where available. No claim is a legal or eligibility decision.</p></ShellCard><ShellCard eyebrow="STATE PERFORMANCE" title="Leading signals"><div className="shell-rank-list">{leaders.length ? leaders.map((state, index) => <div key={state.state_id}><b>0{index + 1}</b><span>{state.state_name}</span><strong>{state.approval_rate || 0}%</strong></div>) : <p className="shell-muted">State summaries are loading from the API.</p>}</div></ShellCard><ShellCard eyebrow="DECISION MODE" title="What needs review"><div className="decision-card"><strong>◎ Prioritize evidence before escalation</strong><p>Start with districts showing delayed processing, unusual land-area signals, or high pending volume.</p><button className="shell-link" onClick={() => navigate('/anomalies')}>View anomaly radar ↗</button></div></ShellCard></section>
  </div>
}

function ShellAtlas() { return <div className="shell-stack"><ShellTitle eyebrow="FOREST ATLAS / 02" title="The forest layer behind every decision" description="Compare forest context across states and Union Territories. These forest statistics are placeholders until a connected source is available." /><div className="atlas-controls"><div><button className="selected">States</button><button>Union Territories</button></div><span>PLACEHOLDER FOREST STATISTICS</span></div><section className="shell-grid three"><ShellCard eyebrow="FOREST-COVER AREA" title="Area ranking"><PlaceholderRows labels={['Madhya Pradesh', 'Chhattisgarh', 'Odisha', 'Maharashtra']} /></ShellCard><ShellCard eyebrow="FOREST COVER %" title="Coverage ranking"><PlaceholderRows labels={['Mizoram', 'Arunachal Pradesh', 'Nagaland', 'Meghalaya']} /></ShellCard><ShellCard eyebrow="GEOGRAPHIC AREA" title="Geographic ranking"><PlaceholderRows labels={['Rajasthan', 'Madhya Pradesh', 'Maharashtra', 'Uttar Pradesh']} /></ShellCard></section><section className="shell-grid three">{['Madhya Pradesh', 'Arunachal Pradesh', 'Chhattisgarh'].map((name) => <ShellCard key={name} eyebrow="FOREST PROFILE" title={name}><div className="placeholder-profile"><strong>Awaiting connected source</strong><small>Placeholder forest statistic card</small></div></ShellCard>)}</section></div> }

function ShellMonitor() { return <div className="shell-stack"><ShellTitle eyebrow="FRA MONITOR / 03" title="District WebGIS command center" description="Move from national signal to district-level claim density, risk layer, and evidence." /><GISExplorer /></div> }

function ShellStateIntelligence({ states, navigate }) { return <div className="shell-stack"><ShellTitle eyebrow="STATE INTELLIGENCE / 04" title="Compare progress, pressure, and risk" description="A state-level operating view for prioritizing reviews across the FRA workflow." /><section className="shell-grid two"><ShellCard eyebrow="STATE PERFORMANCE" title="FRA progress matrix"><div className="state-matrix">{states.slice(0, 12).map((state) => <div key={state.state_id}><span>{state.state_name}</span><b>{shellFormat(state.total_claims)} claims</b><strong>{state.approval_rate || 0}% approved</strong></div>)}</div></ShellCard><ShellCard eyebrow="AI SUMMARY / READY" title="Read the pattern"><div className="ai-ready"><b>AI</b><p>AI summaries will be grounded in state metrics, district evidence, and anomaly signals once the assistant service is connected.</p><button className="shell-link" onClick={() => navigate('/ai-assistant')}>Open Forest AI ↗</button></div></ShellCard></section><ShellCard eyebrow="DISTRICT RISK MATRIX" title="Review surface"><div className="matrix-placeholder"><b>733 DISTRICTS</b><strong>Risk matrix visualization is ready for live district ranking data.</strong><small>Use FRA Monitor for the interactive geographic layer.</small></div></ShellCard></div> }

function ShellAnomalies({ navigate }) { return <div className="shell-stack"><ShellTitle eyebrow="ANOMALY RADAR / 05" title="Signals that deserve a closer look" description="Ranked review queues for processing delay, land-area inconsistency, and model-detected anomalies." /><section className="shell-metric-grid"><ShellMetric label="Anomaly engine" value="READY" detail="backend route available" tone="green" /><ShellMetric label="Severity bands" value="03" detail="medium · high · critical" tone="amber" /><ShellMetric label="Drill-down" value="733" detail="district surfaces" tone="red" /></section><ShellCard eyebrow="RANKED DISTRICT TABLE" title="Anomaly queue"><div className="shell-empty"><strong>Choose a district in FRA Monitor to inspect live anomaly evidence.</strong><button className="shell-primary" onClick={() => navigate('/fra-monitor')}>Open district map ↗</button></div></ShellCard></div> }

function ShellAI() { return <div className="shell-stack"><ShellTitle eyebrow="FOREST AI / 06" title="Ask the forest intelligence layer" description="A grounded assistant surface for evidence-led questions. The conversation service is ready for backend integration." /><section className="shell-grid ai-grid"><ShellCard eyebrow="CONVERSATION" title="Forest AI"><div className="chat-window"><div className="chat-message">I can help interpret district risk, claim processing signals, and anomaly evidence when the assistant service is connected.</div><div className="suggestion-list"><button>Which districts need review?</button><button>Explain pending claim pressure</button><button>Compare state performance</button></div><div className="chat-input"><input placeholder="Ask a question about FRA intelligence..." disabled /><button disabled>Send</button></div></div></ShellCard><ShellCard eyebrow="EVIDENCE LAYER" title="Sources & guardrails"><ul className="guardrails"><li>Backend evidence will appear with each answer.</li><li>Synthetic/demo FRA data is clearly labeled.</li><li>No automated eligibility or enforcement decisions.</li></ul></ShellCard></section></div> }

function ShellReports() { return <div className="shell-stack"><ShellTitle eyebrow="REPORTS / 07" title="Turn signals into a review brief" description="Prepare decision-ready exports for district, state, and national review workflows." /><section className="shell-grid three">{['National situation brief', 'State performance pack', 'District anomaly dossier'].map((title, index) => <ShellCard key={title} eyebrow={`REPORT 0${index + 1}`} title={title}><p className="shell-muted">Export configuration and connected report content will appear here.</p><button className="shell-secondary" disabled>Export placeholder</button></ShellCard>)}</section></div> }

function ShellDistrict({ districtId, navigate }) { return <div className="shell-stack"><ShellTitle eyebrow="DISTRICT INTELLIGENCE / 08" title={districtId || 'District'} description="Claim statistics, risk score, anomaly signals, and recommended review action." /><ShellCard eyebrow="LIVE DISTRICT DETAIL" title="Open this district in the monitor"><div className="district-placeholder"><strong>{districtId}</strong><p>Select the district on the map to load live claim, risk, and anomaly details.</p><button className="shell-primary" onClick={() => navigate('/fra-monitor')}>Open FRA Monitor ↗</button></div></ShellCard></div> }

function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [metrics, setMetrics] = useState({})
  const [states, setStates] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  useEffect(() => { let active = true; Promise.all([fetch(`${API_URL}/api/metrics/`), fetch(`${API_URL}/api/states/`)]).then(async ([metricsResponse, statesResponse]) => { if (!metricsResponse.ok || !statesResponse.ok) throw new Error('Live overview unavailable'); const [liveMetrics, liveStates] = await Promise.all([metricsResponse.json(), statesResponse.json()]); if (active) { setMetrics(liveMetrics); setStates(liveStates.states || []); setLoading(false) } }).catch(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  function navigate(nextPath) { window.history.pushState({}, '', nextPath); setPath(nextPath) }
  const route = shellRoute(path)
  const districtId = path.startsWith('/district/') ? decodeURIComponent(path.split('/')[2]) : ''
  const content = route === '/' ? <ShellOverview metrics={metrics} states={states} loading={loading} navigate={navigate} /> : route === '/forest-atlas' ? <ShellAtlas /> : route === '/fra-monitor' ? <ShellMonitor /> : route === '/state-intelligence' ? <ShellStateIntelligence states={states} navigate={navigate} /> : route === '/anomalies' ? <ShellAnomalies navigate={navigate} /> : route === '/ai-assistant' ? <ShellAI /> : route === '/reports' ? <ShellReports /> : <ShellDistrict districtId={districtId} navigate={navigate} />
  return <div className="command-shell"><aside className="shell-sidebar"><div className="shell-brand"><b>FR</b><span><strong>FRATRACK</strong><small>Forest Rights Intelligence</small></span></div><label>COMMAND NAVIGATION</label><nav>{SHELL_NAV.map(([href, label, icon]) => <button key={href} className={route === href ? 'active' : ''} onClick={() => navigate(href)}><i>{icon}</i><span>{label}</span>{route === href && <b>›</b>}</button>)}</nav><footer><span><i /> Synthetic/demo FRA data</span><small>Decision intelligence shell · v2.0</small></footer></aside><main className="shell-main"><header className="shell-topbar"><div><small>INDIA / FOREST RIGHTS ACT</small><strong>{SHELL_NAV.find(([href]) => href === route)?.[1] || 'District Intelligence'}</strong></div><span className="api-badge"><i /> API CONNECTED</span></header><div className="shell-content">{content}</div></main></div>
}

export default App