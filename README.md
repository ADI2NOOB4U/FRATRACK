# 🌲 FRATRACK

## AI-Powered Decision Support System for Forest Rights Act (FRA) Monitoring

> 🗺️ A GIS-based platform for visualizing FRA claims, assessing district-level risk, and identifying potential anomalies across India.

![FRATRACK](https://img.shields.io/badge/FRATRACK-FRA%20Monitoring-2ea44f)
![React](https://img.shields.io/badge/Frontend-React-61dafb)
![Vite](https://img.shields.io/badge/Build-Vite-646cff)
![Leaflet](https://img.shields.io/badge/Maps-Leaflet-199900)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)
![Python](https://img.shields.io/badge/Python-3.x-3776ab)

---

## 🚀 Overview

FRATRACK is an AI-powered GIS decision-support system designed to make Forest Rights Act (FRA) monitoring easier across India.

FRA claim information is often geographically distributed across different states and districts, making it difficult to identify delays, irregularities, and high-risk areas.

FRATRACK brings this information together in one platform using:

- 🗺️ Interactive GIS mapping
- 📊 District-level risk visualization
- 📍 FRA claim mapping
- 🚨 Anomaly detection
- 🤖 AI-assisted anomaly summaries
- 📈 Decision-support insights

The goal is to help users quickly understand **where claims are located, where risks are concentrated, and which areas may require attention.**

---

## ✨ Key Features

### 🗺️ Interactive GIS Map

The map is a core decision-support component of FRATRACK rather than a decorative visualization.

Users can:

- View India and district boundaries
- Explore districts interactively
- Select individual districts
- Filter districts by risk level
- View FRA claim locations
- Drill down from districts to claims

### 📊 Risk Visualization

Districts can be visualized according to their risk level.

| Risk Level | Visualization |
|------------|---------------|
| 🟢 Safe | Low-risk areas |
| 🟡 Moderate | Areas requiring monitoring |
| 🟠 High | Elevated-risk areas |
| 🔴 Critical | Areas requiring immediate attention |

Normal areas remain visually subdued while higher-risk districts are highlighted for easier identification.

### 📍 FRA Claim Mapping

Individual FRA claims can be displayed directly on the map.

Users can select claim markers to inspect individual claim information.

### 🚨 Anomaly Detection

FRATRACK is designed to help identify potentially unusual patterns such as:

- Delayed claims
- Mismatched land records
- Unusual claim concentrations
- Potentially inconsistent claim information

### 🔥 Anomaly Hotspots

Geographical concentrations of anomalies can be highlighted as hotspots, helping users identify areas that may need further investigation.

### 🤖 AI-Assisted Insights

Detected anomalies can be summarized using AI/LLM-based analysis to provide concise, human-readable insights.

### 🎛️ Risk Filters

Users can focus the map on specific categories such as:

```text
All
Safe
Moderate
High
Critical
```




# Administrative Boundary Data
             ↓
          GeoJSON
             ↓
        React-Leaflet
             ↓
      ┌───────────────┐
      │   India Map   │
      └───────┬───────┘
              ↓
       District Layer
              ↓
        Risk Coloring
              ↓
       Claims / Hotspots


## 📁 Project Structure

<pre>
FRATRACK/
├── frontend/
│   ├── public/
│   │   └── geojson/
│   │       ├── india_boundary.geojson
│   │       └── district_map.geojson
│   │
│   └── src/
│       ├── components/
│       │   └── map/
│       │       └── StateMap.jsx
│       ├── App.jsx
│       ├── App.css
│       ├── index.css
│       └── main.jsx
│
├── backend/
│   └── app/
│       └── services/
│           └── geospatial/
│
├── .gitignore
└── README.md
</pre>

## 🌐 Live Demo

🚀 **Vercel Deployment**

👉 **[Live Application](YOUR_VERCEL_URL_HERE)**

