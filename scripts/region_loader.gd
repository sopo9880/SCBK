extends Node
## Small, bounded OSM/Overpass importer with local disk cache.
## No network access is needed to play the bundled fictional training block.

signal region_loaded(region: Dictionary, source: String)
signal region_failed(message: String)

const SERVERS := [
	"https://overpass.kumi.systems/api/interpreter",
	"https://overpass-api.de/api/interpreter",
	"https://overpass.private.coffee/api/interpreter"
]
const MAX_BUILDINGS := 280
const MAX_ROADS := 200
const MAX_RADIUS := 700
const CACHE_DIR := "user://regions"

var _request: HTTPRequest
var _lat: float = 35.11619
var _lon: float = 128.96733
var _radius: int = 450
var _label: String = ""
var _server_index: int = 0
var _active: bool = false

func _ready() -> void:
	_request = HTTPRequest.new()
	_request.timeout = 14.0
	add_child(_request)
	_request.request_completed.connect(_on_completed)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(CACHE_DIR))

func load_region(lat: float, lon: float, radius: int, label: String) -> void:
	if _active:
		region_failed.emit("A map request is already active.")
		return
	if not is_finite(lat) or not is_finite(lon) or absf(lat) > 85.0 or absf(lon) > 180.0:
		region_failed.emit("Latitude/longitude is out of range.")
		return
	_lat = lat
	_lon = lon
	_radius = clampi(radius, 150, MAX_RADIUS)
	_label = label
	var path: String = _cache_path()
	if FileAccess.file_exists(path):
		var cached: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		if cached is Dictionary and cached.has("buildings"):
			region_loaded.emit(cached, "Local OSM cache")
			return
	_server_index = 0
	_active = true
	_send_request()

func _cache_path() -> String:
	var key: String = ("%0.5f_%0.5f_%d" % [_lat, _lon, _radius]).replace("-", "n").replace(".", "p")
	return "%s/%s.json" % [CACHE_DIR, key]

func _send_request() -> void:
	if _server_index >= SERVERS.size():
		_active = false
		region_failed.emit("OpenStreetMap servers unavailable. The offline training block is still playable.")
		return
	var query: String = '[out:json][timeout:30];(way["building"](around:%d,%.6f,%.6f);way["highway"](around:%d,%.6f,%.6f););out tags geom;' % [_radius, _lat, _lon, _radius, _lat, _lon]
	var headers := PackedStringArray(["Content-Type: application/x-www-form-urlencoded; charset=UTF-8"])
	var error: Error = _request.request(SERVERS[_server_index], headers, HTTPClient.METHOD_POST, "data=" + query.uri_encode())
	if error != OK:
		_server_index += 1
		_send_request()

func _on_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if not _active:
		return
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200 and body.size() > 2:
		var decoded: Variant = JSON.parse_string(body.get_string_from_utf8())
		if decoded is Dictionary and decoded.get("elements") is Array:
			var region: Dictionary = _convert_osm(decoded)
			if region["buildings"].size() > 0:
				var file: FileAccess = FileAccess.open(_cache_path(), FileAccess.WRITE)
				if file != null:
					file.store_string(JSON.stringify(region))
					file.close()
				_active = false
				region_loaded.emit(region, "Live OpenStreetMap")
				return
	_server_index += 1
	_send_request()

func _meters(lat: float, lon: float) -> Vector2:
	var x: float = (lon - _lon) * 111320.0 * cos(deg_to_rad(_lat))
	var z: float = (_lat - lat) * 111132.0
	return Vector2(x, z)

func _convert_osm(doc: Dictionary) -> Dictionary:
	var buildings: Array = []
	var roads: Array = []
	for element in doc["elements"]:
		if not element is Dictionary or str(element.get("type", "")) != "way":
			continue
		var tags: Dictionary = element.get("tags", {})
		var geometry: Array = element.get("geometry", [])
		if geometry.size() < 2:
			continue
		var pts: Array = []
		for node in geometry:
			if not node is Dictionary:
				continue
			var pt: Vector2 = _meters(float(node.get("lat", 0.0)), float(node.get("lon", 0.0)))
			pts.append([snappedf(pt.x, 0.01), snappedf(pt.y, 0.01)])
		if tags.has("building") and pts.size() >= 4 and buildings.size() < MAX_BUILDINGS:
			# OSM buildings are closed ways; store each vertex only once.
			var first: Vector2 = Vector2(float(pts[0][0]), float(pts[0][1]))
			var last: Vector2 = Vector2(float(pts[-1][0]), float(pts[-1][1]))
			if first.distance_to(last) < 0.5:
				pts.pop_back()
			if pts.size() < 3:
				continue
			var center: Vector2 = Vector2.ZERO
			for p in pts:
				center += Vector2(float(p[0]), float(p[1]))
			center /= float(pts.size())
			if center.length() > float(_radius) * 1.3:
				continue
			var ht: float = _read_height(tags)
			buildings.append({
				"id": str(element.get("id", buildings.size())),
				"name": str(tags.get("name:ko", tags.get("name", "Building %s" % str(element.get("id", ""))))),
				"height": ht,
				"outline": pts
			})
		elif tags.has("highway") and pts.size() >= 2 and roads.size() < MAX_ROADS:
			var typ: String = str(tags.get("highway", ""))
			var width: float = 5.0
			if typ in ["footway", "path", "steps", "pedestrian"]:
				width = 2.4
			elif typ in ["primary", "secondary", "tertiary"]:
				width = 9.0
			elif typ == "service":
				width = 3.5
			roads.append({"width": width, "path": pts})
	return {
		"label": _label,
		"center_lat": _lat,
		"center_lon": _lon,
		"buildings": buildings,
		"roads": roads,
		"source": "OpenStreetMap contributors (ODbL)"
	}

func _read_height(tags: Dictionary) -> float:
	var raw: String = str(tags.get("height", "")).to_lower().replace("metres", "").replace("meters", "").replace("m", "").strip_edges()
	var value: float = raw.to_float()
	if value < 2.0:
		var levels: float = str(tags.get("building:levels", "4")).to_float()
		value = clampf(levels, 1.0, 30.0) * 3.3
	return clampf(value, 3.0, 120.0)
