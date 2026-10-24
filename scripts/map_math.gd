extends RefCounted
## Web Mercator conversion used only for map selection and raster rendering.
## Coordinates are expressed as Vector2(latitude, longitude) where noted.
const TILE_SIZE := 256.0
const MERCATOR_LIMIT := 85.05112878

static func wrap_longitude(lon: float) -> float:
	return fposmod(lon + 180.0, 360.0) - 180.0

static func project(lat: float, lon: float, zoom: int) -> Vector2:
	var n: float = TILE_SIZE * pow(2.0, float(zoom))
	var phi: float = deg_to_rad(clampf(lat, -MERCATOR_LIMIT, MERCATOR_LIMIT))
	var x: float = (wrap_longitude(lon) + 180.0) / 360.0 * n
	var y: float = (1.0 - asinh(tan(phi)) / PI) * 0.5 * n
	return Vector2(x, y)

static func unproject(pixel: Vector2, zoom: int) -> Vector2:
	var n: float = TILE_SIZE * pow(2.0, float(zoom))
	var lon: float = wrap_longitude(pixel.x / n * 360.0 - 180.0)
	var lat: float = rad_to_deg(atan(sinh(PI * (1.0 - 2.0 * clampf(pixel.y, 0.0, n) / n))))
	return Vector2(lat, lon)

static func meters(bounds: Dictionary) -> Vector2:
	var south: float = float(bounds.get("south", 0.0))
	var north: float = float(bounds.get("north", 0.0))
	var west: float = float(bounds.get("west", 0.0))
	var east: float = float(bounds.get("east", 0.0))
	var center_lat: float = (north + south) * 0.5
	var width: float = (east - west) * 111320.0 * cos(deg_to_rad(center_lat))
	var height: float = (north - south) * 111132.0
	return Vector2(width, height)

static func centered_bounds(lat: float, lon: float, radius: float) -> Dictionary:
	var latitude: float = clampf(lat, -MERCATOR_LIMIT + 0.01, MERCATOR_LIMIT - 0.01)
	var longitude: float = wrap_longitude(lon)
	var delta_lat: float = radius / 111132.0
	var delta_lon: float = radius / maxf(1.0, 111320.0 * cos(deg_to_rad(latitude)))
	return {
		"south": clampf(latitude - delta_lat, -MERCATOR_LIMIT, MERCATOR_LIMIT),
		"north": clampf(latitude + delta_lat, -MERCATOR_LIMIT, MERCATOR_LIMIT),
		"west": longitude - delta_lon,
		"east": longitude + delta_lon
	}

static func validated(bounds: Dictionary, max_side_m: float = 1600.0) -> bool:
	for key in ["south", "north", "west", "east"]:
		if not bounds.has(key):
			return false
		var val: float = float(bounds[key])
		if not is_finite(val):
			return false
	var south: float = float(bounds["south"])
	var north: float = float(bounds["north"])
	var west: float = float(bounds["west"])
	var east: float = float(bounds["east"])
	if south >= north or west >= east:
		return false
	if absf(north) > MERCATOR_LIMIT or absf(south) > MERCATOR_LIMIT:
		return false
	if absf(east) > 180.0 or absf(west) > 180.0:
		return false
	var extent: Vector2 = meters(bounds)
	return extent.x >= 50.0 and extent.y >= 50.0 and extent.x <= max_side_m and extent.y <= max_side_m

static func from_pixels(first: Vector2, second: Vector2, center: Vector2, viewport_size: Vector2, zoom: int) -> Dictionary:
	var origin: Vector2 = project(center.x, center.y, zoom) - viewport_size * 0.5
	var a: Vector2 = unproject(origin + first, zoom)
	var b: Vector2 = unproject(origin + second, zoom)
	# Explicitly reject antimeridian-spanning regions in this version.
	if absf(a.y - b.y) > 180.0:
		return {}
	return {
		"south": minf(a.x, b.x),
		"north": maxf(a.x, b.x),
		"west": minf(a.y, b.y),
		"east": maxf(a.y, b.y)
	}
