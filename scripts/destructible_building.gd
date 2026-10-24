extends Node3D
## A full procedural facade becomes a grid of stationary building pieces
## only on its first hit. Subsequent hits release *local* chunks as dynamic
## bodies; debris can be struck again. This keeps untouched regions cheap.

signal building_broken(building: Node3D)

const FACADE_SHADER = preload("res://shaders/building_facade.gdshader")
const PALETTE := [
	Color(0.72, 0.69, 0.65), Color(0.61, 0.66, 0.70),
	Color(0.77, 0.67, 0.57), Color(0.66, 0.69, 0.62),
	Color(0.74, 0.72, 0.67), Color(0.61, 0.62, 0.68),
	Color(0.73, 0.62, 0.58)
]
const MAX_LOCAL_CELLS := 80

var identity: String = ""
var display_name: String = ""
var height_m: float = 12.0
var broken: bool = false
var footprint: PackedVector2Array = PackedVector2Array()
var bounds: Rect2 = Rect2()
var _solid: StaticBody3D
var _wall: MeshInstance3D
var _roof: MeshInstance3D
var _chunks: MultiMeshInstance3D
var _facade: ShaderMaterial
var _roof_material: StandardMaterial3D
var _sections: Array[Dictionary] = []
var _pieces: Array[RigidBody3D] = []
var _fractured: bool = false
var _released_sections: int = 0
var _night: bool = false

func configure(record: Dictionary) -> void:
	identity = str(record.get("id", "unknown"))
	display_name = str(record.get("name", "Building"))
	height_m = clampf(float(record.get("height", 12.0)), 3.0, 120.0)
	var raw: Array = record.get("outline", [])
	if raw.size() < 3:
		return
	var center := Vector2.ZERO
	for entry in raw:
		center += Vector2(float(entry[0]), float(entry[1]))
	center /= float(raw.size())
	position = Vector3(center.x, 0.0, center.y)
	for entry in raw:
		footprint.append(Vector2(float(entry[0]) - center.x, float(entry[1]) - center.y))
	bounds = Rect2(footprint[0], Vector2.ZERO)
	for point in footprint:
		bounds = bounds.expand(point)
	var color: Color = PALETTE[posmod(hash(identity), PALETTE.size())]
	_facade = ShaderMaterial.new()
	_facade.shader = FACADE_SHADER
	_facade.set_shader_parameter("wall_color", color)
	_facade.set_shader_parameter("trim_color", color.darkened(0.32))
	_facade.set_shader_parameter("glass_color", Color(0.13, 0.27, 0.37))
	_roof_material = StandardMaterial3D.new()
	_roof_material.albedo_color = color.lightened(0.22)
	_roof_material.roughness = 0.93
	_roof_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_solid = StaticBody3D.new()
	_solid.collision_layer = 1
	_solid.collision_mask = 1
	_solid.set_meta("scbk_building", self)
	add_child(_solid)
	_wall = MeshInstance3D.new()
	_wall.mesh = _make_wall_mesh()
	_wall.material_override = _facade
	_solid.add_child(_wall)
	_roof = MeshInstance3D.new()
	_roof.mesh = _make_roof_mesh()
	_roof.material_override = _roof_material
	_solid.add_child(_roof)
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(maxf(1.0, bounds.size.x), height_m, maxf(1.0, bounds.size.y))
	col.shape = shape
	col.position = Vector3(bounds.get_center().x, height_m * 0.5, bounds.get_center().y)
	_solid.add_child(col)
	_chunks = MultiMeshInstance3D.new()
	_chunks.visible = false
	_chunks.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_chunks)
	add_to_group("scbk_buildings")

func _vertex(tool: SurfaceTool, location: Vector3, uv: Vector2) -> void:
	tool.set_uv(uv)
	tool.add_vertex(location)

func _make_wall_mesh() -> Mesh:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var uv_offset: float = 0.0
	for i in range(footprint.size()):
		var a: Vector2 = footprint[i]
		var b: Vector2 = footprint[(i + 1) % footprint.size()]
		var length: float = a.distance_to(b)
		if length < 0.05:
			continue
		var u0: float = uv_offset / 4.6
		var u1: float = (uv_offset + length) / 4.6
		var v1: float = height_m / 3.25
		var low_a := Vector3(a.x, 0.0, a.y)
		var low_b := Vector3(b.x, 0.0, b.y)
		var high_a := Vector3(a.x, height_m, a.y)
		var high_b := Vector3(b.x, height_m, b.y)
		_vertex(tool, low_a, Vector2(u0, 0))
		_vertex(tool, high_b, Vector2(u1, v1))
		_vertex(tool, low_b, Vector2(u1, 0))
		_vertex(tool, low_a, Vector2(u0, 0))
		_vertex(tool, high_a, Vector2(u0, v1))
		_vertex(tool, high_b, Vector2(u1, v1))
		uv_offset += length
	tool.generate_normals()
	return tool.commit()

func _make_roof_mesh() -> Mesh:
	var tris: PackedInt32Array = Geometry2D.triangulate_polygon(footprint)
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(0, tris.size(), 3):
		var a: Vector2 = footprint[tris[i]]
		var b: Vector2 = footprint[tris[i + 1]]
		var c: Vector2 = footprint[tris[i + 2]]
		_vertex(tool, Vector3(a.x, height_m, a.y), a * 0.02)
		_vertex(tool, Vector3(c.x, height_m, c.y), c * 0.02)
		_vertex(tool, Vector3(b.x, height_m, b.y), b * 0.02)
	if tris.is_empty():
		# Corrupt/self-intersecting OSM outlines still get a visible roof.
		for i in range(1, footprint.size() - 1):
			for pt in [footprint[0], footprint[i + 1], footprint[i]]:
				_vertex(tool, Vector3(pt.x, height_m, pt.y), pt * 0.02)
	tool.generate_normals()
	return tool.commit()

func set_night(enabled: bool) -> void:
	_night = enabled
	if _facade != null:
		_facade.set_shader_parameter("night_factor", 1.0 if enabled else 0.0)

func set_ground_height(y: float) -> void:
	position.y = y

func _fracture_on_demand() -> void:
	if _fractured:
		return
	_fractured = true
	_sections.clear()
	var nx: int = clampi(int(ceil(bounds.size.x / 10.0)), 2, 4)
	var nz: int = clampi(int(ceil(bounds.size.y / 10.0)), 2, 4)
	var ny: int = clampi(int(ceil(height_m / 8.0)), 2, 5)
	var size := Vector3(maxf(0.8, bounds.size.x / nx), maxf(1.2, height_m / ny), maxf(0.8, bounds.size.y / nz))
	for y in range(ny):
		for z in range(nz):
			for x in range(nx):
				var pos := Vector3(
					bounds.position.x + size.x * (float(x) + 0.5),
					size.y * (float(y) + 0.5),
					bounds.position.y + size.z * (float(z) + 0.5))
				if not Geometry2D.is_point_in_polygon(Vector2(pos.x, pos.z), footprint):
					continue
				_sections.append({"center": pos, "size": size, "intact": true})
				if _sections.size() >= MAX_LOCAL_CELLS:
					break
	if _sections.is_empty():
		_sections.append({"center": Vector3(bounds.get_center().x, height_m * 0.5, bounds.get_center().y), "size": Vector3(maxf(1.0, bounds.size.x), height_m, maxf(1.0, bounds.size.y)), "intact": true})
	_wall.visible = false
	_roof.visible = false
	_chunks.visible = true
	_rebuild_static_chunks()

func _rebuild_static_chunks() -> void:
	var remaining: Array[Dictionary] = []
	for section in _sections:
		if section["intact"]:
			remaining.append(section)
	if remaining.is_empty():
		_chunks.visible = false
		broken = true
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var cube := BoxMesh.new()
	cube.size = Vector3.ONE
	cube.material = _facade
	mm.mesh = cube
	mm.instance_count = remaining.size()
	for i in range(remaining.size()):
		var item: Dictionary = remaining[i]
		var size: Vector3 = item["size"]
		var transform := Transform3D(Basis().scaled(size * 0.99), item["center"])
		mm.set_instance_transform(i, transform)
	_chunks.multimesh = mm

func damage_at(impact: Vector3, radius: float, impulse: float, direction: Vector3, budget: int, max_per_hit: int = 10) -> int:
	if budget <= 0 or broken:
		return 0
	_fracture_on_demand()
	var candidates: Array[Dictionary] = []
	for i in range(_sections.size()):
		if not _sections[i]["intact"]:
			continue
		var center: Vector3 = to_global(_sections[i]["center"])
		var section_size: Vector3 = _sections[i]["size"]
		var distance: float = center.distance_to(impact)
		if distance <= radius + section_size.length() * 0.43:
			candidates.append({"index": i, "distance": distance})
	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["distance"]) < float(b["distance"]))
	var released: int = 0
	var maximum: int = mini(max_per_hit, budget)
	for candidate in candidates:
		if released >= maximum:
			break
		var idx: int = int(candidate["index"])
		var piece: Dictionary = _sections[idx]
		piece["intact"] = false
		_sections[idx] = piece
		_spawn_piece(piece["center"], piece["size"], impact, impulse, direction)
		released += 1
	_released_sections += released
	if released > 0:
		_rebuild_static_chunks()
		if not broken and _released_sections >= _sections.size():
			broken = true
			building_broken.emit(self)
	return released

func _spawn_piece(local_pos: Vector3, size: Vector3, impact: Vector3, impulse: float, direction: Vector3) -> void:
	var body := RigidBody3D.new()
	body.name = "ConcreteFragment"
	body.mass = clampf(size.x * size.y * size.z * 0.025, 1.0, 1000.0)
	body.linear_damp = 0.3
	body.angular_damp = 0.6
	body.continuous_cd = true
	body.collision_layer = 2
	body.collision_mask = 1
	body.position = local_pos
	body.set_meta("scbk_building", self)
	body.set_meta("scbk_fragment", true)
	body.set_meta("scbk_fragment_size", size)
	var display := MeshInstance3D.new()
	var cube := BoxMesh.new()
	cube.size = size * 0.96
	cube.material = _facade
	display.mesh = cube
	body.add_child(display)
	var col := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size * 0.96
	col.shape = box
	body.add_child(col)
	add_child(body)
	body.add_to_group("scbk_debris")
	_pieces.append(body)
	var outward: Vector3 = body.global_position - impact
	if direction.length_squared() > 0.001:
		outward = direction.normalized() * 2.0 + outward.normalized()
	outward.y += 4.0
	if outward.length_squared() < 0.001:
		outward = Vector3.UP
	body.apply_central_impulse(outward.normalized() * impulse * sqrt(body.mass))
	body.apply_torque_impulse(Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * impulse * body.mass * 0.2)

func hit_debris(body: RigidBody3D, impact: Vector3, impulse: float, budget: int) -> int:
	if not is_instance_valid(body) or not _pieces.has(body):
		return 0
	var direction: Vector3 = body.global_position - impact + Vector3.UP
	if budget < 2:
		body.apply_central_impulse(direction.normalized() * impulse * sqrt(body.mass))
		return 0
	var size: Vector3 = body.get_meta("scbk_fragment_size", Vector3(2, 2, 2))
	var split_z: bool = size.z >= size.x
	var half: Vector3 = size
	var offset: Vector3 = Vector3.ZERO
	if split_z:
		half.z *= 0.5
		offset.z = size.z * 0.25
	else:
		half.x *= 0.5
		offset.x = size.x * 0.25
	var local_pos: Vector3 = body.position
	_pieces.erase(body)
	body.collision_layer = 0
	body.queue_free()
	_spawn_piece(local_pos - offset, half, impact, impulse, direction)
	_spawn_piece(local_pos + offset, half, impact, impulse, direction)
	return 1 # Replaced one existing body with two; only one additional slot.

func damage_fraction() -> float:
	if not _fractured or _sections.is_empty():
		return 0.0
	return float(_released_sections) / float(_sections.size())

func active_debris_count() -> int:
	var count: int = 0
	for piece in _pieces:
		if is_instance_valid(piece) and not piece.is_queued_for_deletion():
			count += 1
	return count

func retire_sleeping_debris(maximum: int) -> int:
	var removed: int = 0
	for piece in _pieces.duplicate():
		if removed >= maximum:
			break
		if is_instance_valid(piece) and piece.sleeping:
			_pieces.erase(piece)
			piece.queue_free()
			removed += 1
	return removed

func reset_building() -> void:
	for piece in _pieces:
		if is_instance_valid(piece):
			piece.collision_layer = 0
			piece.queue_free()
	_pieces.clear()
	_sections.clear()
	_fractured = false
	_released_sections = 0
	broken = false
	_wall.visible = true
	_roof.visible = true
	_chunks.visible = false
	_chunks.multimesh = null
	_solid.collision_layer = 1

func erase_debris() -> void:
	for piece in _pieces:
		if is_instance_valid(piece):
			piece.queue_free()
	_pieces.clear()

func has_debris() -> bool:
	return active_debris_count() > 0
