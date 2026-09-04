import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function StateMap() {
  const [states, setStates] = useState(null);

  useEffect(() => {
    fetch("/geojson/india_state.geojson")
      .then((response) => response.json())
      .then((data) => setStates(data));
  }, []);

  return (
    <MapContainer
      center={[22.5, 78.9]}
      zoom={5}
      style={{ height: "600px", width: "100%" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {states && (
  <GeoJSON
    data={states}
    style={{
      color: "#555",
      weight: 1,
      fillOpacity: 0.05,
    }}
    onEachFeature={(feature, layer) => {
  layer.on("click", () => {
    alert(feature.properties.NAME_1);
  });
}}
  />
)}
    </MapContainer>
  );
}

export default StateMap;