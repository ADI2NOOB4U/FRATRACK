import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function StateMap() {

  const [districts, setDistricts] = useState(null);
  const [indiaBoundary, setIndiaBoundary] = useState(null);

  useEffect(() => {


    fetch("/geojson/district_map.geojson")
      .then((response) => response.json())
      .then((data) => setDistricts(data));
    fetch("/geojson/india_boundary.geojson")
      .then((response) => response.json())
      .then((data) => setIndiaBoundary(data));
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

      {districts && (
        <GeoJSON
          data={districts}
          style={{
            color: "#333",
            weight: 0.5,
            fillOpacity: 0.02,
          }}
          onEachFeature={(feature, layer) => {
            layer.bindPopup(feature.properties.district);
          }}
        />
      )}


      {indiaBoundary && (
        <GeoJSON
          data={indiaBoundary}
          style={{
            color: "#0066FF",
            weight: 3,
            fillOpacity: 0,
          }}
        />
      )}
    </MapContainer>
  );
}

export default StateMap;