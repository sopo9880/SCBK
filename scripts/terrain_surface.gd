extends StaticBody3D
## Local 49x49 terrain patch. Terrain is visible and collidable, and stores
## a real DEM when available; it can be deformed by impact craters.

const Mercator = preload("res://scripts/map_math.gd")
const GRID := 49
# Large Earth depths are deliberately condensed for local destruction play.
# 1m of deformed terrain visually represents 8km of progress toward the core.
const VIRTUAL_KM_PER_M := 8.0
const EARTH_RADIUS_KM := 6371.0

var extent: Vector2 = Vector2(720.0, 720.0)
var _heights: PackedFloat32Array = PackedFloat32Array()
var _mesh: MeshInstance3D
var _collider: CollisionShape3D
var _land_material: StandardMaterial3D
var _base_heightmap: PackedFloat32Array = PackedFloat32Array()
var _has_dem: bool = false
var _map_texture: Texture2D
var _scorch: PackedFloat32Array = PackedFloat32Array()
var _crater_history: Array[Dictionary] = []
var _dem_epoch: int = 0

func _ready() -> void:
	collision_layer = 1
	collision_mask = 1
	_mesh = MeshInstance3D.new()
	_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_mesh)
	_collider = CollisionShape3D.new()
	add_child(_collider)
	_land_material = StandardMaterial3D.new()
	_land_material.albedo_color = Color(0.37, 0.46, 0.35)
	_land_material.roughness = 0.95
	_land_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_land_material.vertex_color_use_as_albedo = true
	reset_plane({})

func reset_plane(bounds: Dictionary) -> void:
	_dem_epoch += 1
	if Mercator.validated(bounds):
		extent = Mercator.meters(bounds)
		extent += Vector2(160.0, 160.0)
	else:
		extent = Vector2(720.0, 720.0)
	_heights.resize(GRID * GRID)
	_heights.fill(0.0)
	_scorch.resize(GRID * GRID)
	_scorch.fill(0.0)
	_crater_history.clear()
	_map_texture = null
	if _land_material != null:
		_land_material.albedo_texture = null
		_land_material.albedo_color = Color(0.37, 0.46, 0.35)
	_base_heightmap = _heights.duplicate()
	_has_dem = false
	_rebuild_surface()

func set_map_texture(texture: Texture2D) -> void:
	_map_texture = texture
	if _land_material != null:
		_land_material.albedo_texture = texture
		_land_material.albedo_color = Color.WHITE if texture != null else Color(0.37, 0.46, 0.35)
	_rebuild_surface()

func apply_dem(samples: PackedFloat32Array, width: int, depth: int) -> bool:
	if width < 2 or depth < 2 or samples.size() != width * depth:
		return false
	# Input map includes the extra terrain border and is sampled at grid size.
	for z in range(GRID):
		for x in range(GRID):
			var u: float = float(x) / float(GRID - 1) * float(width - 1)
			var v: float = float(z) / float(GRID - 1) * float(depth - 1)
			var x0: int = clampi(int(floor(u)), 0, width - 1)
			var z0: int = clampi(int(floor(v)), 0, depth - 1)
			var x1: int = mini(x0 + 1, width - 1)
			var z1: int = mini(z0 + 1, depth - 1)
			var ax: float = u - float(x0)
			var az: float = v - float(z0)
			var h0: float = lerpf(samples[z0 * width + x0], samples[z0 * width + x1], ax)
			var h1: float = lerpf(samples[z1 * width + x0], samples[z1 * width + x1], ax)
			_heights[z * GRID + x] = lerpf(h0, h1, az)
	_base_heightmap = _heights.duplicate()
	_dem_epoch += 1
	_has_dem = true
	_scorch.fill(0.0)
	# Terrain elevation can finish loading while the player is already
	# attacking. Re-apply pending blasts rather than magically healing them.
	for entry in _crater_history:
		if entry.has("path"):
			_apply_laser_cut(entry["path"], float(entry["width"]), float(entry["depth"]))
		else:
			_apply_crater(entry["point"], float(entry["radius"]), float(entry["depth"]))
	_rebuild_surface()
	return true

func has_dem() -> bool:
	return _has_dem

func height_at(x: float, z: float) -> float:
	var fx: float = clampf((x / extent.x + 0.5) * float(GRID - 1), 0.0, float(GRID - 1))
	var fz: float = clampf((z / extent.y + 0.5) * float(GRID - 1), 0.0, float(GRID - 1))
	var x0: int = int(floor(fx))
	var z0: int = int(floor(fz))
	var x1: int = mini(x0 + 1, GRID - 1)
	var z1: int = mini(z0 + 1, GRID - 1)
	var ax: float = fx - float(x0)
	var az: float = fz - float(z0)
	return lerpf(
		lerpf(_heights[z0 * GRID + x0], _heights[z0 * GRID + x1], ax),
		lerpf(_heights[z1 * GRID + x0], _heights[z1 * GRID + x1], ax), az)

func crater_at(world_position: Vector3, radius: float, depth: float) -> void:
	if radius <= 0.0 or depth <= 0.0:
		return
	_crater_history.append({"point": world_position, "radius": radius, "depth": depth})
	# Limit memory even during dozens of blasts on a single region.
	if _crater_history.size() > 96:
		_crater_history.remove_at(0)
	_apply_crater(world_position, radius, depth)
	_rebuild_surface()

func _apply_crater(world_position: Vector3, radius: float, depth: float) -> void:
	# A smooth excavation with an uplifted rim; the actual terrain mesh AND
	# collision are rebuilt. This works for any blast centred on the ground.
	var grid_step: float = maxf(extent.x, extent.y) / float(GRID - 1)
	var core: float = maxf(radius, grid_step * 1.55)
	var modified: bool = false
	for z in range(GRID):
		for x in range(GRID):
			var at := Vector2(
				(float(x) / float(GRID - 1) - 0.5) * extent.x,
				(float(z) / float(GRID - 1) - 0.5) * extent.y)
			var d: float = at.distance_to(Vector2(world_position.x, world_position.z))
			if d >= core * 1.30:
				continue
			var t: float = d / core
			var index: int = z * GRID + x
			if t < 1.0:
				_heights[index] -= depth * pow(1.0 - t * t, 2.0)
				_scorch[index] = maxf(_scorch[index], 0.72 * (1.0 - t * 0.45))
			else:
				var rim: float = (t - 1.0) / 0.30
				_heights[index] += depth * 0.10 * pow(1.0 - rim, 2.0)
				_scorch[index] = maxf(_scorch[index], 0.26 * (1.0 - rim))
			modified = true
	# _rebuild_surface is deliberately called once by the outer transaction.
	if modified:
		pass

func laser_cut(points: Array[Vector3], width: float, depth: float) -> void:
	if points.size() < 2 or width <= 0.0 or depth <= 0.0:
		return
	var bounded: Array[Vector3] = points.slice(0, 128)
	_crater_history.append({"path": bounded.duplicate(), "width": width, "depth": depth})
	if _crater_history.size() > 96:
		_crater_history.remove_at(0)
	_apply_laser_cut(bounded, width, depth)
	_rebuild_surface()

func _apply_laser_cut(points: Array[Vector3], width: float, depth: float) -> void:
	# A single mesh/collision rebuild for the whole drawn beam path.
	var practical_width: float = maxf(width, maxf(extent.x, extent.y) / float(GRID - 1) * 0.70)
	for z in range(GRID):
		for x in range(GRID):
			var at := Vector2(
				(float(x) / float(GRID - 1) - 0.5) * extent.x,
				(float(z) / float(GRID - 1) - 0.5) * extent.y)
			var distance: float = INF
			for i in range(points.size() - 1):
				var a := Vector2(points[i].x, points[i].z)
				var b := Vector2(points[i + 1].x, points[i + 1].z)
				var segment: Vector2 = b - a
				var ratio: float = clampf((at - a).dot(segment) / maxf(segment.length_squared(), 0.0001), 0.0, 1.0)
				distance = minf(distance, at.distance_to(a + segment * ratio))
			if distance >= practical_width:
				continue
			var index: int = z * GRID + x
			var strength: float = pow(1.0 - distance / practical_width, 1.7)
			_heights[index] -= depth * strength
			_scorch[index] = maxf(_scorch[index], 0.88 * strength)

func capture_checkpoint() -> Dictionary:
	# Fixed grid snapshots are small. Retain the event ledger as well so
	# undo after an asynchronous DEM arrival replays into the new base map.
	return {
		"epoch": _dem_epoch,
		"heights": _heights.duplicate(),
		"scorch": _scorch.duplicate(),
		"events": _crater_history.duplicate(true)
	}

func checkpoint_changed(checkpoint: Dictionary) -> bool:
	if checkpoint.is_empty():
		return false
	if _crater_history.size() != Array(checkpoint.get("events", [])).size():
		return true
	if int(checkpoint.get("epoch", -1)) != _dem_epoch:
		return true
	return _heights != checkpoint["heights"] or _scorch != checkpoint["scorch"]

func restore_checkpoint(checkpoint: Dictionary) -> void:
	if checkpoint.is_empty():
		return
	_crater_history = checkpoint.get("events", []).duplicate(true)
	if int(checkpoint.get("epoch", -1)) == _dem_epoch:
		_heights = checkpoint["heights"].duplicate()
		_scorch = checkpoint["scorch"].duplicate()
	else:
		# A terrain elevation download may have landed after the checkpoint.
		_heights = _base_heightmap.duplicate()
		_scorch.resize(GRID * GRID)
		_scorch.fill(0.0)
		for event in _crater_history:
			if event.has("path"):
				_apply_laser_cut(event["path"], float(event["width"]), float(event["depth"]))
			else:
				_apply_crater(event["point"], float(event["radius"]), float(event["depth"]))
	_rebuild_surface()

func depth_info() -> Dictionary:
	var deepest: float = 0.0
	var location: int = 0
	for i in range(mini(_heights.size(), _base_heightmap.size())):
		var depression: float = maxf(0.0, _base_heightmap[i] - _heights[i])
		if depression > deepest:
			deepest = depression
			location = i
	var km: float = minf(EARTH_RADIUS_KM, deepest * VIRTUAL_KM_PER_M)
	var layer: String = "지표 / 흙"
	if km >= 5150.0:
		layer = "내핵"
	elif km >= 2900.0:
		layer = "외핵"
	elif km >= 35.0:
		layer = "맨틀"
	elif km >= 0.3:
		layer = "지각"
	var x: int = location % GRID
	var z: int = int(location / GRID)
	return {
		"world_depth_m": deepest,
		"virtual_depth_km": km,
		"layer": layer,
		"point": Vector3(
			(float(x) / float(GRID - 1) - 0.5) * extent.x,
			_heights[location] if not _heights.is_empty() else 0.0,
			(float(z) / float(GRID - 1) - 0.5) * extent.y)
	}

func restore() -> void:
	_heights = _base_heightmap.duplicate()
	_scorch.fill(0.0)
	_crater_history.clear()
	_rebuild_surface()

func _vertex(tool: SurfaceTool, point: Vector3, tint: Color, scar: float = 0.0, depth_m: float = 0.0) -> void:
	var underlying: Color = Color.WHITE.lerp(tint, 0.18) if _map_texture != null else tint
	var km: float = maxf(0.0, depth_m) * VIRTUAL_KM_PER_M
	# Stylized exposed-stratum colors fade into the OSM surface texture.
	# No copied textures or photos from the reference browser title.
	if km >= 5150.0:
		underlying = underlying.lerp(Color(1.0, 0.83, 0.36), 0.95)
	elif km >= 2900.0:
		underlying = underlying.lerp(Color(0.89, 0.28, 0.10), 0.91)
	elif km >= 35.0:
		underlying = underlying.lerp(Color(0.40, 0.22, 0.18), 0.89)
	elif km >= 0.3:
		underlying = underlying.lerp(Color(0.37, 0.34, 0.31), 0.72)
	tool.set_color(underlying.lerp(Color(0.22, 0.13, 0.10), clampf(scar, 0.0, 0.85)))
	# UVs are bound to the actual selected region plus the 80m terrain
	# border. They remain fixed when the ground is cratered or DEM changes.
	tool.set_uv(Vector2(point.x / extent.x + 0.5, point.z / extent.y + 0.5))
	tool.add_vertex(point)

func _rebuild_surface() -> void:
	if _mesh == null or _collider == null:
		return
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var faces := PackedVector3Array()
	for z in range(GRID - 1):
		for x in range(GRID - 1):
			var x0: float = (float(x) / float(GRID - 1) - 0.5) * extent.x
			var x1: float = (float(x + 1) / float(GRID - 1) - 0.5) * extent.x
			var z0: float = (float(z) / float(GRID - 1) - 0.5) * extent.y
			var z1: float = (float(z + 1) / float(GRID - 1) - 0.5) * extent.y
			var a := Vector3(x0, _heights[z * GRID + x], z0)
			var b := Vector3(x1, _heights[z * GRID + x + 1], z0)
			var c := Vector3(x0, _heights[(z + 1) * GRID + x], z1)
			var d := Vector3(x1, _heights[(z + 1) * GRID + x + 1], z1)
			var ia: int = z * GRID + x
			var ib: int = z * GRID + x + 1
			var ic: int = (z + 1) * GRID + x
			var id: int = (z + 1) * GRID + x + 1
			for tri in [
				{"vertices": [a, c, b], "index": [ia, ic, ib]},
				{"vertices": [b, c, d], "index": [ib, ic, id]}
			]:
				var vertices: Array = tri["vertices"]
				var indices: Array = tri["index"]
				var e: Vector3 = vertices[0]
				var f: Vector3 = vertices[1]
				var g: Vector3 = vertices[2]
				var height_diff: float = maxf(absf(e.y - f.y), maxf(absf(f.y - g.y), absf(g.y - e.y)))
				var steepness: float = clampf(height_diff / 16.0, 0.0, 1.0)
				var grassy: Color = Color(0.33, 0.44, 0.31).lerp(Color(0.50, 0.46, 0.38), steepness)
				for vertex_index in range(3):
					var p: Vector3 = vertices[vertex_index]
					var vertex_id: int = int(indices[vertex_index])
					var exposed: float = maxf(0.0, _base_heightmap[vertex_id] - p.y) if _base_heightmap.size() > vertex_id else 0.0
					_vertex(tool, p, grassy, _scorch[vertex_id], exposed)
					faces.append(p)
	tool.generate_normals()
	_mesh.mesh = tool.commit()
	_mesh.material_override = _land_material
	# Concave collision exactly matches visible irregular terrain; rebuild
	# after craters only. A 49^2 patch costs far less than a city-scale mesh.
	var shape := ConcavePolygonShape3D.new()
	shape.data = faces
	_collider.shape = shape
