extends Node
## Builds a geographically aligned 3D ground map from OSM road/building data.
## Reuses user-viewed map-picker raster tiles ONLY when already cached.
## No tile download, scraping, prefetch or third-party satellite imagery.
signal projection_ready(texture: Texture2D, source_description: String)

const Mercator = preload("res://scripts/map_math.gd")
const PIXELS := 512
const TILE_SIZE := 256
const MAX_REUSED_TILES := 16
const TILE_CACHE := "user://map_tiles"

func build_projection(region: Dictionary, terrain_extent: Vector2) -> void:
	var bounds: Dictionary = region.get("bounds", {})
	if not Mercator.validated(bounds):
		return
	var cached: Image = _try_cached_map(bounds, terrain_extent)
	if cached != null:
		projection_ready.emit(ImageTexture.create_from_image(cached), "이미 열어본 OSM 지도 타일 투영")
		return
	var surface: Image = _draw_osm_vectors(region, terrain_extent)
	projection_ready.emit(ImageTexture.create_from_image(surface), "OSM 도로·건물 위치 기반 지형 투영")

func _ground_pixel(point: Vector2, extent: Vector2) -> Vector2i:
	var nx: float = point.x / maxf(extent.x, 1.0) + 0.5
	var ny: float = point.y / maxf(extent.y, 1.0) + 0.5
	return Vector2i(int(round(nx * float(PIXELS - 1))), int(round(ny * float(PIXELS - 1))))

func _draw_osm_vectors(region: Dictionary, extent: Vector2) -> Image:
	var canvas: Image = Image.create(PIXELS, PIXELS, false, Image.FORMAT_RGB8)
	canvas.fill(Color(0.36, 0.44, 0.33))
	# Low-contrast neighbourhood texture keeps uncharted ground legible.
	for y in range(0, PIXELS, 24):
		var tone: float = sin(float(y) * 0.067) * 0.015
		canvas.fill_rect(Rect2i(0, y, PIXELS, 12), Color(0.36 + tone, 0.44 + tone, 0.33 + tone))
	var tracks: Array = region.get("roads", [])
	for road in tracks:
		if not road is Dictionary:
			continue
		var pts: Array = road.get("path", [])
		if pts.size() < 2:
			continue
		var width_m: float = float(road.get("width", 4.0))
		var width_px: int = clampi(int(ceil(width_m * float(PIXELS) / maxf(extent.x, extent.y))), 1, 13)
		for i in range(pts.size() - 1):
			if not pts[i] is Array or not pts[i + 1] is Array:
				continue
			var a: Vector2i = _ground_pixel(Vector2(float(pts[i][0]), float(pts[i][1])), extent)
			var b: Vector2i = _ground_pixel(Vector2(float(pts[i + 1][0]), float(pts[i + 1][1])), extent)
			_draw_line(canvas, a, b, width_px + 2, Color(0.22, 0.26, 0.23))
			_draw_line(canvas, a, b, width_px, Color(0.64, 0.67, 0.62))
	var records: Array = region.get("buildings", [])
	for record in records:
		if not record is Dictionary:
			continue
		var polygon: Array = record.get("outline", [])
		if polygon.size() < 3:
			continue
		var pixels := PackedVector2Array()
		for p in polygon:
			if p is Array and p.size() >= 2:
				var px: Vector2i = _ground_pixel(Vector2(float(p[0]), float(p[1])), extent)
				pixels.append(Vector2(px))
		if pixels.size() >= 3:
			_fill_polygon(canvas, pixels, Color(0.57, 0.55, 0.50))
			for i in range(pixels.size()):
				_draw_line(canvas, Vector2i(pixels[i]), Vector2i(pixels[(i + 1) % pixels.size()]), 1, Color(0.32, 0.35, 0.34))
	return canvas

func _draw_line(target: Image, a: Vector2i, b: Vector2i, width: int, tint: Color) -> void:
	var distance: float = Vector2(a).distance_to(Vector2(b))
	var steps: int = clampi(int(ceil(distance / maxf(1.0, float(width) * 0.55))), 1, 2048)
	for step in range(steps + 1):
		var position: Vector2 = Vector2(a).lerp(Vector2(b), float(step) / float(steps))
		_circle(target, Vector2i(position.round()), width, tint)

func _circle(target: Image, at: Vector2i, radius: int, tint: Color) -> void:
	for oy in range(-radius, radius + 1):
		var py: int = at.y + oy
		if py < 0 or py >= PIXELS:
			continue
		for ox in range(-radius, radius + 1):
			var px: int = at.x + ox
			if px >= 0 and px < PIXELS and ox * ox + oy * oy <= radius * radius:
				target.set_pixel(px, py, tint)

func _fill_polygon(target: Image, points: PackedVector2Array, tint: Color) -> void:
	var min_y: int = PIXELS - 1
	var max_y: int = 0
	for point in points:
		min_y = mini(min_y, clampi(int(point.y), 0, PIXELS - 1))
		max_y = maxi(max_y, clampi(int(point.y), 0, PIXELS - 1))
	for y in range(min_y, max_y + 1):
		var intersections: Array[float] = []
		for i in range(points.size()):
			var a: Vector2 = points[i]
			var b: Vector2 = points[(i + 1) % points.size()]
			if (a.y <= float(y) and b.y > float(y)) or (b.y <= float(y) and a.y > float(y)):
				intersections.append(a.x + (float(y) - a.y) * (b.x - a.x) / (b.y - a.y))
		intersections.sort()
		for j in range(0, intersections.size() - 1, 2):
			var left: int = clampi(int(ceil(intersections[j])), 0, PIXELS - 1)
			var right: int = clampi(int(floor(intersections[j + 1])), 0, PIXELS - 1)
			if right >= left:
				target.fill_rect(Rect2i(left, y, right - left + 1, 1), tint)

func _try_cached_map(bounds: Dictionary, extent: Vector2) -> Image:
	# Only reuse tiles the map picker loaded during actual interactive viewing.
	# We intentionally never download an unseen tile to texture the 3D scene.
	var lat: float = (float(bounds["north"]) + float(bounds["south"])) * 0.5
	var lon: float = (float(bounds["east"]) + float(bounds["west"])) * 0.5
	var lat_half: float = extent.y * 0.5 / 111132.0
	var lon_half: float = extent.x * 0.5 / maxf(1.0, 111320.0 * cos(deg_to_rad(lat)))
	for zoom in [16, 15, 14, 13]:
		var upper: Vector2 = Mercator.project(lat + lat_half, lon - lon_half, zoom)
		var lower: Vector2 = Mercator.project(lat - lat_half, lon + lon_half, zoom)
		var left: int = int(floor(upper.x / 256.0))
		var top: int = int(floor(upper.y / 256.0))
		var right: int = int(floor(lower.x / 256.0))
		var bottom: int = int(floor(lower.y / 256.0))
		var count: int = (right - left + 1) * (bottom - top + 1)
		if count <= 0 or count > MAX_REUSED_TILES:
			continue
		var cache: Dictionary = {}
		var complete: bool = true
		for ty in range(top, bottom + 1):
			for tx in range(left, right + 1):
				var key: String = "%d/%d/%d" % [zoom, tx, ty]
				var filename: String = "%s/%s.png" % [TILE_CACHE, key]
				if not FileAccess.file_exists(filename):
					complete = false
					break
				var tile := Image.new()
				if tile.load(filename) != OK or tile.get_width() != TILE_SIZE:
					complete = false
					break
				cache["%d_%d" % [tx, ty]] = tile
			if not complete:
				break
		if not complete:
			continue
		var canvas: Image = Image.create(PIXELS, PIXELS, false, Image.FORMAT_RGB8)
		var span: Vector2 = lower - upper
		for y in range(PIXELS):
			var py: float = upper.y + span.y * (float(y) / float(PIXELS - 1))
			var cy: int = int(floor(py / 256.0))
			for x in range(PIXELS):
				var px: float = upper.x + span.x * (float(x) / float(PIXELS - 1))
				var cx: int = int(floor(px / 256.0))
				var tile: Image = cache["%d_%d" % [cx, cy]]
				canvas.set_pixel(x, y, tile.get_pixel(
					clampi(int(floor(px - float(cx * TILE_SIZE))), 0, 255),
					clampi(int(floor(py - float(cy * TILE_SIZE))), 0, 255)))
		return canvas
	return null
