extends Node
## Read actual DEM heights from publicly available AWS Mapzen Terrarium tiles.
## Decodes the three RGB channels into metres; caches downloaded PNGs.
signal elevation_ready(bounds: Dictionary, grid: PackedFloat32Array, width: int, depth: int)
signal elevation_failed(message: String)

const Mercator = preload("res://scripts/map_math.gd")
const DEM_ZOOM := 12
const GRID := 49
const CACHE_DIR := "user://terrain_tiles"
const TILE_ROOT := "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"

var _request: HTTPRequest
var _bounds: Dictionary = {}
var _queue: Array[Dictionary] = []
var _images: Dictionary = {}
var _active: bool = false
var _current: Dictionary = {}
var _failed: bool = false

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(CACHE_DIR))
	_request = HTTPRequest.new()
	_request.timeout = 15.0
	_request.body_size_limit = 2 * 1024 * 1024
	add_child(_request)
	_request.request_completed.connect(_complete)

func load_bounds(bounds: Dictionary) -> void:
	if not Mercator.validated(bounds):
		elevation_failed.emit("DEM not requested: invalid region bounds.")
		return
	if _active:
		_request.cancel_request()
	_active = true
	_failed = false
	_bounds = bounds.duplicate(true)
	_queue.clear()
	_images.clear()
	_current.clear()
	# Include all tiles touched by the *extended* terrain edge.
	var extend_lat: float = 80.0 / 111132.0
	var center_lat: float = (float(bounds["north"]) + float(bounds["south"])) * 0.5
	var extend_lon: float = 80.0 / (111320.0 * cos(deg_to_rad(center_lat)))
	var ul: Vector2 = Mercator.project(float(bounds["north"]) + extend_lat, float(bounds["west"]) - extend_lon, DEM_ZOOM)
	var lr: Vector2 = Mercator.project(float(bounds["south"]) - extend_lat, float(bounds["east"]) + extend_lon, DEM_ZOOM)
	for y in range(int(floor(ul.y / 256.0)), int(floor(lr.y / 256.0)) + 1):
		for x in range(int(floor(ul.x / 256.0)), int(floor(lr.x / 256.0)) + 1):
			var key: String = "%d_%d_%d" % [DEM_ZOOM, x, y]
			var tile: Dictionary = {"key": key, "x": x, "y": y}
			if _read_cached_tile(tile):
				continue
			_queue.append(tile)
	_download_next()

func _path(tile: Dictionary) -> String:
	return "%s/%s.png" % [CACHE_DIR, str(tile["key"])]

func _read_cached_tile(tile: Dictionary) -> bool:
	var file: String = _path(tile)
	if not FileAccess.file_exists(file):
		return false
	var image := Image.new()
	if image.load(file) != OK:
		return false
	_images[tile["key"]] = image
	return true

func _download_next() -> void:
	if not _active:
		return
	if _queue.is_empty():
		_active = false
		if _failed:
			elevation_failed.emit("Some DEM terrain tiles were unavailable; retaining flat terrain.")
		else:
			_emit_dem()
		return
	_current = _queue.pop_front()
	var url: String = "%s/%d/%d/%d.png" % [TILE_ROOT, DEM_ZOOM, int(_current["x"]), int(_current["y"])]
	var err: Error = _request.request(url)
	if err != OK:
		_failed = true
		_download_next()

func _complete(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if not _active:
		return
	if result == HTTPRequest.RESULT_SUCCESS and code == 200 and body.size() > 100:
		var image := Image.new()
		if image.load_png_from_buffer(body) == OK and image.get_width() == 256:
			_images[_current["key"]] = image
			var f := FileAccess.open(_path(_current), FileAccess.WRITE)
			if f != null:
				f.store_buffer(body)
				f.close()
		else:
			_failed = true
	else:
		_failed = true
	_download_next()

func _decode(lat: float, lon: float) -> float:
	var world: Vector2 = Mercator.project(lat, lon, DEM_ZOOM)
	var tile_x: int = int(floor(world.x / 256.0))
	var tile_y: int = int(floor(world.y / 256.0))
	var key: String = "%d_%d_%d" % [DEM_ZOOM, tile_x, tile_y]
	if not _images.has(key):
		return NAN
	var img: Image = _images[key]
	var local: Vector2 = world - Vector2(float(tile_x * 256), float(tile_y * 256))
	var x0: int = clampi(int(floor(local.x)), 0, 255)
	var y0: int = clampi(int(floor(local.y)), 0, 255)
	var x1: int = mini(x0 + 1, 255)
	var y1: int = mini(y0 + 1, 255)
	var ax: float = local.x - float(x0)
	var ay: float = local.y - float(y0)
	var ha: float = lerpf(_height(img.get_pixel(x0, y0)), _height(img.get_pixel(x1, y0)), ax)
	var hb: float = lerpf(_height(img.get_pixel(x0, y1)), _height(img.get_pixel(x1, y1)), ax)
	return lerpf(ha, hb, ay)

func _height(color: Color) -> float:
	# Terrarium encoding: R*256 + G + B/256 - 32768, all channels 8-bit.
	return roundf(color.r * 255.0) * 256.0 + roundf(color.g * 255.0) + roundf(color.b * 255.0) / 256.0 - 32768.0

func _emit_dem() -> void:
	var north: float = float(_bounds["north"])
	var south: float = float(_bounds["south"])
	var west: float = float(_bounds["west"])
	var east: float = float(_bounds["east"])
	var lat_margin: float = 80.0 / 111132.0
	var lon_margin: float = 80.0 / (111320.0 * cos(deg_to_rad((north + south) * 0.5)))
	var samples := PackedFloat32Array()
	samples.resize(GRID * GRID)
	for y in range(GRID):
		var lat: float = lerpf(north + lat_margin, south - lat_margin, float(y) / float(GRID - 1))
		for x in range(GRID):
			var lon: float = lerpf(west - lon_margin, east + lon_margin, float(x) / float(GRID - 1))
			var elevation: float = _decode(lat, lon)
			if not is_finite(elevation):
				elevation_failed.emit("Incomplete DEM tile sample; retaining flat terrain.")
				return
			samples[y * GRID + x] = elevation
	var centre: float = samples[(GRID / 2) * GRID + (GRID / 2)]
	for i in range(samples.size()):
		samples[i] = clampf(samples[i] - centre, -180.0, 180.0)
	elevation_ready.emit(_bounds.duplicate(true), samples, GRID, GRID)
