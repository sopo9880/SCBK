extends Node3D
## Procedural town renderer + bounded damage simulation.
## Buildings are stationary, detailed facade meshes until the player damages
## them; only impacted cells become rigid bodies. Terrain uses DEM where present.

signal building_broken(building: Node3D)

const Building = preload("res://scripts/destructible_building.gd")
const Terrain = preload("res://scripts/terrain_surface.gd")
const MAX_DEBRIS := 160
const MAX_BUILDINGS := 280
const MAX_TREES := 160

var buildings: Array[Node3D] = []
var region_name: String = ""
var source_label: String = ""
var region_bounds: Dictionary = {}
var _buildings_root: Node3D
var _roads_root: Node3D
var _trees_root: Node3D
var _terrain: StaticBody3D
var _road_data: Array = []
var _last_damaged: Array[Node3D] = []
var _night: bool = false
var _dem_active: bool = false

func _ready() -> void:
	_terrain = Terrain.new()
	_terrain.name = "Terrain"
	add_child(_terrain)
	_buildings_root = Node3D.new()
	_buildings_root.name = "Buildings"
	add_child(_buildings_root)
	_roads_root = Node3D.new()
	_roads_root.name = "Roads"
	add_child(_roads_root)
	_trees_root = Node3D.new()
	_trees_root.name = "Vegetation"
	add_child(_trees_root)

func load_region(region: Dictionary, source: String) -> int:
	for old in buildings:
		if is_instance_valid(old):
			old.remove_from_group("scbk_buildings")
			old.queue_free()
	buildings.clear()
	_last_damaged.clear()
	for road in _roads_root.get_children():
		road.queue_free()
	for tree in _trees_root.get_children():
		tree.queue_free()
	region_name = str(region.get("label", "Unnamed region"))
	source_label = source
	region_bounds = region.get("bounds", {})
	_terrain.reset_plane(region_bounds)
	_dem_active = false
	var entries: Array = region.get("buildings", [])
	for entry in entries:
		if not entry is Dictionary:
			continue
		var outline: Array = entry.get("outline", [])
		if outline.size() < 3:
			continue
		var obj: Node3D = Building.new()
		_buildings_root.add_child(obj)
		obj.configure(entry)
		obj.set_ground_height(_terrain.height_at(obj.position.x, obj.position.z))
		obj.set_night(_night)
		obj.building_broken.connect(_on_building_broken)
		buildings.append(obj)
		if buildings.size() >= MAX_BUILDINGS:
			break
	_road_data = region.get("roads", [])
	_build_roads(_road_data)
	_build_vegetation(region)
	return buildings.size()

func terrain_height_at(x: float, z: float) -> float:
	return _terrain.height_at(x, z)

func has_dem() -> bool:
	return _dem_active

func apply_dem(samples: PackedFloat32Array, width: int, depth: int) -> void:
	if not _terrain.apply_dem(samples, width, depth):
		return
	_dem_active = true
	for building in buildings:
		if is_instance_valid(building):
			building.set_ground_height(_terrain.height_at(building.position.x, building.position.z))
	for road in _roads_root.get_children():
		road.queue_free()
	_build_roads(_road_data)
	for plant in _trees_root.get_children():
		plant.queue_free()
	_build_vegetation({"center_lat": float(region_bounds.get("south", 0.0)), "center_lon": float(region_bounds.get("west", 0.0))})

func crater_at(point: Vector3, radius: float, depth: float) -> void:
	_terrain.crater_at(point, radius, depth)

func reset_terrain() -> void:
	_terrain.restore()
	for road in _roads_root.get_children():
		road.queue_free()
	_build_roads(_road_data)

func set_night(enabled: bool) -> void:
	_night = enabled
	for building in buildings:
		building.set_night(enabled)

func _push_tri(tool: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	tool.set_uv(Vector2(a.x, a.z) / 18.0)
	tool.add_vertex(a)
	tool.set_uv(Vector2(b.x, b.z) / 18.0)
	tool.add_vertex(b)
	tool.set_uv(Vector2(c.x, c.z) / 18.0)
	tool.add_vertex(c)

func _build_roads(records: Array) -> void:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var triangles: int = 0
	for record in records:
		if not record is Dictionary:
			continue
		var width: float = clampf(float(record.get("width", 4.0)), 1.2, 14.0)
		var path: Array = record.get("path", [])
		for i in range(path.size() - 1):
			if not path[i] is Array or not path[i + 1] is Array:
				continue
			var a := Vector2(float(path[i][0]), float(path[i][1]))
			var b := Vector2(float(path[i + 1][0]), float(path[i + 1][1]))
			var diff: Vector2 = b - a
			var length: float = diff.length()
			if length < 0.1 or length > 1600.0:
				continue
			var side: Vector2 = Vector2(-diff.y, diff.x).normalized() * width * 0.5
			var steps: int = clampi(int(ceil(length / 25.0)), 1, 48)
			for step_index in range(steps):
				var u: Vector2 = a.lerp(b, float(step_index) / float(steps))
				var v: Vector2 = a.lerp(b, float(step_index + 1) / float(steps))
				var ua := Vector3(u.x + side.x, _terrain.height_at(u.x + side.x, u.y + side.y) + 0.24, u.y + side.y)
				var ub := Vector3(u.x - side.x, _terrain.height_at(u.x - side.x, u.y - side.y) + 0.24, u.y - side.y)
				var va := Vector3(v.x + side.x, _terrain.height_at(v.x + side.x, v.y + side.y) + 0.24, v.y + side.y)
				var vb := Vector3(v.x - side.x, _terrain.height_at(v.x - side.x, v.y - side.y) + 0.24, v.y - side.y)
				_push_tri(tool, ua, ub, va)
				_push_tri(tool, ub, vb, va)
				triangles += 2
	if triangles == 0:
		return
	tool.generate_normals()
	var mesh := MeshInstance3D.new()
	mesh.mesh = tool.commit()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.28, 0.30, 0.31)
	mat.roughness = 0.94
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mesh.material_override = mat
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_roads_root.add_child(mesh)

func _tree_clear(pos: Vector2) -> bool:
	for building in buildings:
		if not is_instance_valid(building):
			continue
		if Vector2(building.position.x, building.position.z).distance_squared_to(pos) > 11000.0:
			continue
		var local: Vector2 = pos - Vector2(building.position.x, building.position.z)
		if Geometry2D.is_point_in_polygon(local, building.footprint):
			return false
	for road in _road_data:
		var route: Array = road.get("path", [])
		var clear_width: float = float(road.get("width", 4.0)) * 0.5 + 5.0
		for i in range(route.size() - 1):
			var a := Vector2(float(route[i][0]), float(route[i][1]))
			var b := Vector2(float(route[i + 1][0]), float(route[i + 1][1]))
			var offset := b - a
			if offset.length_squared() <= 0.001:
				continue
			var t: float = clampf((pos - a).dot(offset) / offset.length_squared(), 0.0, 1.0)
			if pos.distance_to(a + offset * t) < clear_width:
				return false
	return true

func _build_vegetation(region: Dictionary) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = int(absf(float(region.get("center_lat", 35.11619))) * 10000.0) * 31 + int(absf(float(region.get("center_lon", 128.96733))) * 10000.0)
	var positions: Array[Vector3] = []
	# Sample the actual settlement, not kilometres of unused demo ground.
	# The original 2200m fictional tile looked like empty grassland dotted
	# with tiny spheres surrounding a handful of miniature buildings.
	var spawn_center := Vector2.ZERO
	var span := _terrain.extent * 0.88
	if region_bounds.is_empty() and not buildings.is_empty():
		var minp := Vector2(INF, INF)
		var maxp := Vector2(-INF, -INF)
		for building in buildings:
			var p := Vector2(building.position.x, building.position.z)
			minp = Vector2(minf(minp.x, p.x), minf(minp.y, p.y))
			maxp = Vector2(maxf(maxp.x, p.x), maxf(maxp.y, p.y))
		spawn_center = (minp + maxp) * 0.5
		span = Vector2(
			clampf(maxp.x - minp.x + 150.0, 250.0, _terrain.extent.x * 0.85),
			clampf(maxp.y - minp.y + 150.0, 250.0, _terrain.extent.y * 0.85)
		)
	for attempt in range(MAX_TREES * 3):
		if positions.size() >= MAX_TREES:
			break
		var x: float = spawn_center.x + rng.randf_range(-span.x * 0.5, span.x * 0.5)
		var z: float = spawn_center.y + rng.randf_range(-span.y * 0.5, span.y * 0.5)
		if not _tree_clear(Vector2(x, z)):
			continue
		positions.append(Vector3(x, _terrain.height_at(x, z), z))
	if positions.is_empty():
		return
	var trunks := MultiMesh.new()
	trunks.transform_format = MultiMesh.TRANSFORM_3D
	var trunk_mesh := CylinderMesh.new()
	trunk_mesh.top_radius = 0.34
	trunk_mesh.bottom_radius = 0.46
	trunk_mesh.height = 5.2
	trunk_mesh.radial_segments = 5
	var bark := StandardMaterial3D.new()
	bark.albedo_color = Color(0.32, 0.25, 0.19)
	trunk_mesh.material = bark
	trunks.mesh = trunk_mesh
	trunks.instance_count = positions.size()
	var crowns := MultiMesh.new()
	crowns.transform_format = MultiMesh.TRANSFORM_3D
	var crown_mesh := SphereMesh.new()
	crown_mesh.radius = 3.5
	crown_mesh.height = 6.0
	crown_mesh.radial_segments = 7
	crown_mesh.rings = 4
	var green := StandardMaterial3D.new()
	green.albedo_color = Color(0.24, 0.36, 0.24)
	green.roughness = 0.97
	crown_mesh.material = green
	crowns.mesh = crown_mesh
	crowns.instance_count = positions.size()
	for i in range(positions.size()):
		var scale_factor: float = rng.randf_range(0.68, 1.40)
		var trunk_pos: Vector3 = positions[i] + Vector3(0, 2.6 * scale_factor, 0)
		var crown_pos: Vector3 = positions[i] + Vector3(0, 7.0 * scale_factor, 0)
		trunks.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(scale_factor, scale_factor, scale_factor)), trunk_pos))
		crowns.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(scale_factor, scale_factor, scale_factor)), crown_pos))
	var stems := MultiMeshInstance3D.new()
	stems.multimesh = trunks
	stems.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_trees_root.add_child(stems)
	var foliage := MultiMeshInstance3D.new()
	foliage.multimesh = crowns
	foliage.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_trees_root.add_child(foliage)

func _on_building_broken(building: Node3D) -> void:
	building_broken.emit(building)

func debris_count() -> int:
	var total: int = 0
	for building in buildings:
		if is_instance_valid(building):
			total += building.active_debris_count()
	return total

func destroyed_count() -> int:
	var total: int = 0
	for building in buildings:
		if is_instance_valid(building) and building.damage_fraction() >= 0.98:
			total += 1
	return total

func _budget() -> int:
	var available: int = MAX_DEBRIS - debris_count()
	if available < 8:
		for building in buildings:
			available += building.retire_sleeping_debris(8 - available)
			if available >= 8:
				break
	return maxi(0, available)

func strike_building(building: Node3D, point: Vector3, impulse: float) -> Dictionary:
	if not is_instance_valid(building):
		return {"buildings": 0, "pieces": 0}
	var remaining: int = _budget()
	var pieces: int = building.damage_at(point, 10.0, impulse, Vector3.ZERO, remaining, 5)
	_last_damaged.clear()
	if pieces > 0:
		_last_damaged.append(building)
	return {"buildings": 1 if pieces > 0 else 0, "pieces": pieces}

func strike_debris(piece: RigidBody3D, point: Vector3, impulse: float) -> Dictionary:
	if not is_instance_valid(piece) or not piece.has_meta("scbk_building"):
		return {"buildings": 0, "pieces": 0}
	var building: Node3D = piece.get_meta("scbk_building")
	if not is_instance_valid(building):
		return {"buildings": 0, "pieces": 0}
	var gained: int = building.hit_debris(piece, point, impulse, _budget())
	return {"buildings": 0, "pieces": gained}

func strike_radius(point: Vector3, radius: float, impulse: float, direction: Vector3 = Vector3.ZERO, per_building: int = 10) -> Dictionary:
	var nearby: Array[Dictionary] = []
	for building in buildings:
		if not is_instance_valid(building) or building.broken:
			continue
		var distance: float = Vector2(building.global_position.x - point.x, building.global_position.z - point.z).length()
		if distance <= radius + building.bounds.size.length() * 0.5:
			nearby.append({"building": building, "distance": distance})
	nearby.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["distance"]) < float(b["distance"]))
	var fragments: int = 0
	var touched: Array[Node3D] = []
	var remaining: int = _budget()
	for item in nearby:
		if remaining <= 0:
			break
		var building: Node3D = item["building"]
		var count: int = building.damage_at(point, radius, impulse, direction, remaining, per_building)
		if count > 0:
			touched.append(building)
			fragments += count
			remaining -= count
	_last_damaged = touched
	return {"buildings": touched.size(), "pieces": fragments}

func undo_last() -> int:
	var total: int = 0
	for building in _last_damaged:
		if is_instance_valid(building):
			building.reset_building()
			total += 1
	_last_damaged.clear()
	return total

func reset_all() -> void:
	for building in buildings:
		if is_instance_valid(building):
			building.reset_building()
	_last_damaged.clear()
	reset_terrain()
