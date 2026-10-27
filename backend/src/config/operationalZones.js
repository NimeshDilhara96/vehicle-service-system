/**
 * Operational Service Zones Configuration
 * 
 * Scalable geo-fencing configuration for pickup & delivery service.
 * Currently locked to Western Province (Colombo, Gampaha, Kalutara),
 * but designed to easily enable other provinces or custom boundaries in the future.
 */

const OPERATIONAL_ZONES = [
  {
    id: "western_province",
    name: "Western Province",
    districts: ["Colombo", "Gampaha", "Kalutara"],
    enabled: true,
    // Bounding Box covering Western Province:
    // South (Bentota/Aluthgama ~6.40) to North (Kochchikade/Negombo/Gampaha ~7.35)
    // West (Coastline ~79.80) to East (Avissawella/Kalutara border ~80.30)
    bounds: {
      minLat: 6.40,
      maxLat: 7.35,
      minLng: 79.80,
      maxLng: 80.30,
    },
  },
  // Future Expansion Ready:
  {
    id: "central_province",
    name: "Central Province",
    districts: ["Kandy", "Matale", "Nuwara Eliya"],
    enabled: false,
    bounds: {
      minLat: 6.80,
      maxLat: 7.80,
      minLng: 80.40,
      maxLng: 81.00,
    },
  },
  {
    id: "southern_province",
    name: "Southern Province",
    districts: ["Galle", "Matara", "Hambantota"],
    enabled: false,
    bounds: {
      minLat: 5.90,
      maxLat: 6.45,
      minLng: 80.05,
      maxLng: 81.65,
    },
  },
];

/**
 * Checks if coordinates [lat, lng] fall within any currently active operational zone.
 * @param {[number, number]} coordinates - [latitude, longitude]
 * @returns {{ allowed: boolean, matchedZone?: string, activeZones: string[] }}
 */
function checkOperationalZone(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return {
      allowed: false,
      activeZones: OPERATIONAL_ZONES.filter((z) => z.enabled).map((z) => z.name),
    };
  }

  const [lat, lng] = coordinates;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return {
      allowed: false,
      activeZones: OPERATIONAL_ZONES.filter((z) => z.enabled).map((z) => z.name),
    };
  }

  const activeZones = OPERATIONAL_ZONES.filter((z) => z.enabled);

  for (const zone of activeZones) {
    const { minLat, maxLat, minLng, maxLng } = zone.bounds;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return {
        allowed: true,
        matchedZone: zone.name,
        activeZones: activeZones.map((z) => z.name),
      };
    }
  }

  return {
    allowed: false,
    activeZones: activeZones.map((z) => z.name),
  };
}

module.exports = {
  OPERATIONAL_ZONES,
  checkOperationalZone,
};

