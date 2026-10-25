extends Node
## Bounded, cached OpenStreetMap Overpass importer.
## Accepts either a radius preset or an explicitly selected map rectangle.

signal region_loaded(region: Dictionary, source: String)
signal region_failed(message: String)
signal loading_started(region_label: String)
signal loading_progress(message: String, attempt: int, total_attempts: int)
signal loading_cancelled
signal load_stage(percent: float, description: String, indeterminate: bool)

const Mercator = preload("res://scripts/map_math.gd")
const SERVERS := [
	"https://overpass-api.de/api/interpreter",
	"https://overpass.kumi.systems/api/interpreter",
	"https://overpass.private.coffee/api/interpreter"
]
const MAX_BUILDINGS := 280
const MAX_ROADS := 200
const MAX_RADIUS := 700
const CACHE_DIR := "user://regions"
const USER_AGENT := "SCBK-Windows/0.2.3 (https://github.com/sopo9880/SCBK)"

var _request: HTTPRequest
var _bounds: Dictionary = {}
var _lat: float = 35.11619
var _lon: float = 128.96733
var _label: String = ""
var _server_index: int = 0
var _active: bool = false
var _legacy_radius: int = 0
var _attempt_errors: Array[String] = []
var _last_error: String = ""
var _generation: int = 0

func _ready() -> void:
	_request = HTTPRequest.new()
	_request.timeout = 34.0 # Server query timeout is 25 sec.
	_request.body_size_limit = 12 * 1024 * 1024
	add_child(_request)
	_request.request_completed.connect(_on_completed)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(CACHE_DIR))

func load_region(lat: float, lon: float, radius: int, label: String) -> void:
	if not is_finite(lat) or not is_finite(lon) or absf(lat) > 85.0 or absf(lon) > 180.0:
		region_failed.emit("Latitude/longitude is out of supported map range.")
		return
	var limited: int = clampi(radius, 150, MAX_RADIUS)
	var bounds: Dictionary = Mercator.centered_bounds(lat, lon, float(limited))
	_start_load(bounds, label, limited)

func load_bounds(bounds: Dictionary, label: String) -> void:
	_start_load(bounds, label, 0)

func is_busy() -> bool:
	return _active

func get_last_error() -> String:
	return _last_error

func get_requested_region() -> String:
	return _label

func cancel_load() -> void:
	if not _active:
		return
	_generation += 1
	_active = false
	_request.cancel_request()
	load_stage.emit(0.0, "지도 다운로드 취소", false)
	loading_cancelled.emit()

func retry_last() -> void:
	if _bounds.is_empty():
		region_failed.emit("다시 시도할 지역이 없습니다. 먼저 지도에서 지역을 선택해 주세요.")
		return
	var region: Dictionary = _bounds.duplicate(true)
	var previous_label: String = _label
	var previous_radius: int = _legacy_radius
	cancel_load()
	_start_load(region, previous_label, previous_radius)

func _start_load(bounds: Dictionary, label: String, legacy_radius: int) -> void:
	if not Mercator.validated(bounds):
		region_failed.emit("선택 범위 오류: 한 변 50~1600m의 지역을 선택해 주세요.")
		return
	if _active:
		if _bounds == bounds:
			loading_progress.emit("이미 같은 지역을 불러오는 중입니다. 취소할 수 있습니다.", _server_index + 1, SERVERS.size())
			return
		cancel_load()
	_bounds = bounds.duplicate(true)
	_lat = (float(_bounds["south"]) + float(_bounds["north"])) * 0.5
	_lon = (float(_bounds["west"]) + float(_bounds["east"])) * 0.5
	_label = label
	_legacy_radius = legacy_radius
	_last_error = ""
	var cached: Variant = _read_cache(_cache_path())
	if not cached is Dictionary and _legacy_radius > 0:
		cached = _read_cache(_legacy_cache_path())
	if cached is Dictionary:
		cached["label"] = _label
		if not Mercator.validated(cached.get("bounds", {})):
			cached["bounds"] = _bounds.duplicate(true)
		load_stage.emit(0.68, "캐시 지도 읽기 완료 · 3D 지역 생성", false)
		region_loaded.emit(cached, "Cached OpenStreetMap")
		load_stage.emit(1.0, "캐시 지도 준비 완료", false)
		return
	_server_index = 0
	_attempt_errors.clear()
	_generation += 1
	_active = true
	loading_started.emit(_label)
	load_stage.emit(0.0, "지도 요청 준비", false)
	_send_request()

func _cache_path() -> String:
	var key: String = ("bbox_%.5f_%.5f_%.5f_%.5f" % [
		float(_bounds["south"]), float(_bounds["west"]),
		float(_bounds["north"]), float(_bounds["east"])
	]).replace("-", "n").replace(".", "p")
	return "%s/%s.json" % [CACHE_DIR, key]

func _legacy_cache_path() -> String:
	var key: String = ("%.5f_%.5f_%d" % [_lat, _lon, _legacy_radius]).replace("-", "n").replace(".", "p")
	return "%s/%s.json" % [CACHE_DIR, key]

func _read_cache(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed is Dictionary and parsed.get("buildings") is Array and parsed.get("roads") is Array:
		return parsed
	return null

func _send_request() -> void:
	if not _active:
		return
	if _server_index >= SERVERS.size():
		_active = false
		_last_error = "지도 서버 연결 실패: " + (" / ".join(PackedStringArray(_attempt_errors)) if not _attempt_errors.is_empty() else "응답 없음")
		load_stage.emit(0.0, "지도 서버 연결 실패", false)
		region_failed.emit(_last_error)
		return
	var south: float = float(_bounds["south"])
	var west: float = float(_bounds["west"])
	var north: float = float(_bounds["north"])
	var east: float = float(_bounds["east"])
	var bbox: String = "%.6f,%.6f,%.6f,%.6f" % [south, west, north, east]
	var query: String = '[out:json][timeout:25];(way["building"](%s);way["highway"](%s););out tags geom;' % [bbox, bbox]
	loading_progress.emit("실제 지도 가져오는 중 (%d/%d) · 서버 응답 대기" % [_server_index + 1, SERVERS.size()], _server_index + 1, SERVERS.size())
	# No fake network percentages: total byte count is unknown until reply.
	load_stage.emit(0.12, "지도 서버 %d/%d 응답 대기" % [_server_index + 1, SERVERS.size()], true)
	var headers := PackedStringArray([
		"Content-Type: application/x-www-form-urlencoded; charset=UTF-8",
		"Accept: application/json", "User-Agent: " + USER_AGENT
	])
	var err: Error = _request.request(SERVERS[_server_index], headers, HTTPClient.METHOD_POST, "data=" + query.uri_encode())
	if err != OK:
		_attempt_errors.append("서버 %d: 요청 오류 %d" % [_server_index + 1, int(err)])
		_server_index += 1
		call_deferred("_send_if_current", _generation)

func _send_if_current(expected_generation: int) -> void:
	if _active and expected_generation == _generation:
		_send_request()

func _on_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if not _active:
		return
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200 and body.size() > 2:
		load_stage.emit(0.30, "지도 파일 수신 완료 · JSON 해석", false)
		var decoded: Variant = JSON.parse_string(body.get_string_from_utf8())
		if decoded is Dictionary and decoded.get("elements") is Array:
			var region: Dictionary = _convert_osm(decoded)
			load_stage.emit(0.68, "지도 데이터 정리 완료 · 3D 지역 생성", false)
			var output: FileAccess = FileAccess.open(_cache_path(), FileAccess.WRITE)
			if output != null:
				output.store_string(JSON.stringify(region))
				output.close()
			_active = false
			region_loaded.emit(region, "Live OpenStreetMap")
			load_stage.emit(1.0, "실제 지도 준비 완료", false)
			return
		_attempt_errors.append("서버 %d: 잘못된 응답 형식" % (_server_index + 1))
	elif result == HTTPRequest.RESULT_TIMEOUT:
		_attempt_errors.append("서버 %d: 시간 초과" % (_server_index + 1))
	elif result != HTTPRequest.RESULT_SUCCESS:
		_attempt_errors.append("서버 %d: 연결 오류 %d" % [_server_index + 1, result])
	else:
		_attempt_errors.append("서버 %d: HTTP %d" % [_server_index + 1, response_code])
	_server_index += 1
	call_deferred("_send_if_current", _generation)

func _meters(lat: float, lon: float) -> Vector2:
	var x: float = (lon - _lon) * 111320.0 * cos(deg_to_rad(_lat))
	var z: float = (_lat - lat) * 111132.0
	return Vector2(x, z)

func _within_selection(lat: float, lon: float) -> bool:
	return lat >= float(_bounds["south"]) and lat <= float(_bounds["north"]) and lon >= float(_bounds["west"]) and lon <= float(_bounds["east"])

func _convert_osm(doc: Dictionary) -> Dictionary:
	var buildings_found: Array[Dictionary] = []
	var roads_found: Array[Dictionary] = []
	var elements: Array = doc["elements"]
	for index in range(elements.size()):
		if index % 64 == 0:
			load_stage.emit(0.34 + 0.28 * float(index) / float(maxi(1, elements.size())), "건물·도로 분석 %d/%d" % [index, elements.size()], false)
		var element: Variant = elements[index]
		if not element is Dictionary or str(element.get("type", "")) != "way":
			continue
		var tags: Dictionary = element.get("tags", {})
		var geom: Array = element.get("geometry", [])
		if geom.size() < 2:
			continue
		var points: Array = []
		var geo_lat: float = 0.0
		var geo_lon: float = 0.0
		for node in geom:
			if not node is Dictionary:
				continue
			var lat: float = float(node.get("lat", 0.0))
			var lon: float = float(node.get("lon", 0.0))
			geo_lat += lat
			geo_lon += lon
			var pt: Vector2 = _meters(lat, lon)
			points.append([snappedf(pt.x, 0.01), snappedf(pt.y, 0.01)])
		if points.size() < 2:
			continue
		if tags.has("building") and points.size() >= 4:
			if Vector2(float(points[0][0]), float(points[0][1])).distance_to(Vector2(float(points[-1][0]), float(points[-1][1]))) < 0.5:
				points.pop_back()
			if points.size() < 3:
				continue
			var centroid: Vector2 = Vector2.ZERO
			for p in points:
				centroid += Vector2(float(p[0]), float(p[1]))
			centroid /= float(points.size())
			var centroid_lat: float = _lat - centroid.y / 111132.0
			var centroid_lon: float = _lon + centroid.x / (111320.0 * cos(deg_to_rad(_lat)))
			if not _within_selection(centroid_lat, centroid_lon):
				continue
			var ht: float = _read_height(tags)
			buildings_found.append({
				"id": str(element.get("id", buildings_found.size())),
				"name": str(tags.get("name:ko", tags.get("name", "Building %s" % str(element.get("id", ""))))),
				"height": ht,
				"outline": points,
				"distance": centroid.length()
			})
		elif tags.has("highway"):
			var segment_center: Vector2 = Vector2.ZERO
			for p in points:
				segment_center += Vector2(float(p[0]), float(p[1]))
			segment_center /= float(points.size())
			var kind: String = str(tags.get("highway", ""))
			var width: float = 5.0
			if kind in ["footway", "path", "steps", "pedestrian"]:
				width = 2.4
			elif kind in ["primary", "secondary", "tertiary"]:
				width = 9.0
			elif kind == "service":
				width = 3.5
			roads_found.append({"width": width, "path": points, "distance": segment_center.length()})
	# Nearest-first prevents Overpass response ordering from arbitrarily hiding
	# all buildings in the user's selected centre when the area is dense.
	buildings_found.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["distance"]) < float(b["distance"]))
	roads_found.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["distance"]) < float(b["distance"]))
	var buildings: Array = []
	for i in range(mini(MAX_BUILDINGS, buildings_found.size())):
		var b: Dictionary = buildings_found[i]
		b.erase("distance")
		buildings.append(b)
	var roads: Array = []
	for i in range(mini(MAX_ROADS, roads_found.size())):
		var r: Dictionary = roads_found[i]
		r.erase("distance")
		roads.append(r)
	return {
		"label": _label,
		"center_lat": _lat,
		"center_lon": _lon,
		"bounds": _bounds.duplicate(true),
		"buildings": buildings,
		"roads": roads,
		"total_buildings": buildings_found.size(),
		"total_roads": roads_found.size(),
		"source": "OpenStreetMap contributors (ODbL)"
	}

func _read_height(tags: Dictionary) -> float:
	var raw: String = str(tags.get("height", "")).to_lower().replace("metres", "").replace("meters", "").replace("m", "").strip_edges()
	var value: float = raw.to_float()
	if value < 2.0:
		var levels: float = str(tags.get("building:levels", "4")).to_float()
		value = clampf(levels, 1.0, 30.0) * 3.3
	return clampf(value, 3.0, 120.0)
