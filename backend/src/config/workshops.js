/**
 * Scalable Workshop Branches Configuration
 *
 * Add new workshop branches here at any time.
 * The system automatically displays all enabled workshops on the map
 * and routes each customer pickup to the nearest active workshop.
 */

const WORKSHOPS = [
  {
    id: "colombo_main",
    name: "Colombo Main Workshop",
    address: "Main Service Center, Colombo, Sri Lanka",
    coordinates: [6.9271, 79.8612], // [lat, lng]
    enabled: true,
  },
  {
    id: "gampaha_branch",
    name: "Gampaha Service Branch",
    address: "Gampaha Service Center, Gampaha, Sri Lanka",
    coordinates: [7.0873, 80.0144],
    enabled: false, // Disabled for now; can be enabled later
  },
  {
    id: "kalutara_branch",
    name: "Kalutara Service Branch",
    address: "Kalutara Service Center, Kalutara, Sri Lanka",
    coordinates: [6.5854, 79.9607],
    enabled: false, // Disabled for now; can be enabled later
  },
];

function getActiveWorkshops() {
  return WORKSHOPS.filter((w) => w.enabled);
}

// Haversine distance in km between two [lat, lng] coordinates
function getAirDistanceKm(coords1, coords2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const [lat1, lon1] = coords1;
  const [lat2, lon2] = coords2;

  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Finds the nearest enabled workshop to the customer's pickup coordinates.
 * @param {[number, number]} pickupCoords - [lat, lng]
 */
function findNearestWorkshop(pickupCoords) {
  const active = getActiveWorkshops();
  if (active.length === 0) {
    return WORKSHOPS[0];
  }
  if (!Array.isArray(pickupCoords) || pickupCoords.length !== 2) {
    return active[0];
  }

  let nearest = active[0];
  let minDistance = getAirDistanceKm(pickupCoords, nearest.coordinates);

  for (let i = 1; i < active.length; i++) {
    const dist = getAirDistanceKm(pickupCoords, active[i].coordinates);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = active[i];
    }
  }

  return nearest;
}

module.exports = {
  WORKSHOPS,
  getActiveWorkshops,
  findNearestWorkshop,
};
