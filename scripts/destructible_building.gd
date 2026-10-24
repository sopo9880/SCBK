extends Node3D
## A lightweight static polygonal building until the first hit.
## The damaged building is replaced by a small, bounded set of rigid debris.

signal building_broken(building: Node3D)

const PALETTE := [
	Color(0.73, 0.74, 0.76),
	Color(0.64, 0.70, 0.77),
	Color(0.69, 0.60, 0.56),
	Color(0.80, 0.75, 0.66),
	Color(0.68, 0.72, 0.67),
	Color(0.66, 0.67, 0.73)
]

var identity: String = ""
var display_name: String = ""
var height_m: float = 12.0
var broken: bool = false
var footprint: PackedVector2Array = PackedVector2Array()
var bounds: Rect2
var _solid: StaticBody3D
var _drawing: MeshInstance3D
var _collision: CollisionShape3D
var _material: StandardMaterial3D
var _pieces: Array[RigidBody3D] = []

func configure(record: Dictionary) -> void:
	identity = str(record.get("id", "unknown"))
	display_name = str(record.get("name", "Building"))
	height_m = clampf(float(record.get("height", 12.0)), 3.0, 120.0)
	var raw: Array = record.get("outline", [])
	if raw.size() < 3:
		return
	var center: Vector2 = Vector2.ZERO
	for entry in raw:
		center += Vector2(float(entry[0]), float(entry[1]))
	center /= float(raw.size())
	position = Vector3(center.x, 0.0, center.y)
	for entry in raw:
		footprint.append(Vector2(float(entry[0]) - center.x, float(entry[1]) - center.y))
	bounds = Rect2(footprint[0], Vector2.ZERO)
	for point in footprint:
		bounds = bounds.expand(point)
	_material = StandardMaterial3D.new()
	_material.albedo_color = PALETTE[posmod(hash(identity), PALETTE.size())]
	_material.roughness = 0.86
	_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_solid = StaticBody3D.new()
	_solid.collision_layer = 1
	_solid.collision_mask = 1
	_solid.set_meta("scbk_building", self)
	add_child(_solid)
	_drawing = MeshInstance3D.new()
	_drawing.mesh = _make_extrusion()
	_drawing.material_override = _material
	_solid.add_child(_drawing)
	_collision = CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(maxf(1.0, bounds.size.x), height_m, maxf(1.0, bounds.size.y))
	_collision.shape = shape
	_collision.position = Vector3(bounds.get_center().x, height_m * 0.5, bounds.get_center().y)
	_solid.add_child(_collision)
	add_to_group("scbk_buildings")

func _triangle(surface: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	surface.add_vertex(a)
	surface.add_vertex(b)
	surface.add_vertex(c)

func _make_extrusion() -> Mesh:
	var polygon: PackedVector2Array = footprint
	var tris: PackedInt32Array = Geometry2D.triangulate_polygon(polygon)
	if tris.is_empty():
		var fallback := BoxMesh.new()
		fallback.size = Vector3(maxf(bounds.size.x, 1.0), height_m, maxf(bounds.size.y, 1.0))
		# BoxMesh is centred; callers supply a node offset when needed.
		_drawing_fallback()
		return fallback
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(0, tris.size(), 3):
		var a: Vector2 = polygon[tris[i]]
		var b: Vector2 = polygon[tris[i + 1]]
		var c: Vector2 = polygon[tris[i + 2]]
		_triangle(surface, Vector3(a.x, height_m, a.y), Vector3(c.x, height_m, c.y), Vector3(b.x, height_m, b.y))
		_triangle(surface, Vector3(a.x, 0.0, a.y), Vector3(b.x, 0.0, b.y), Vector3(c.x, 0.0, c.y))
	for j in range(polygon.size()):
		var p: Vector2 = polygon[j]
		var q: Vector2 = polygon[(j + 1) % polygon.size()]
		var p0 := Vector3(p.x, 0.0, p.y)
		var p1 := Vector3(q.x, 0.0, q.y)
		var p2 := Vector3(q.x, height_m, q.y)
		var p3 := Vector3(p.x, height_m, p.y)
		_triangle(surface, p0, p2, p1)
		_triangle(surface, p0, p3, p2)
	surface.generate_normals()
	return surface.commit()

func _drawing_fallback() -> void:
	# This branch is for corrupt/self-intersecting imported OSM polygons only.
	# Keep the program usable rather than rejecting the entire map.
	pass

func shatter(world_impact: Vector3, strength: float, piece_budget: int) -> bool:
	if broken:
		return false
	broken = true
	_drawing.visible = false
	_solid.collision_layer = 0
	_solid.collision_mask = 0
	_collision.set_deferred("disabled", true)
	var count: int = mini(8, maxi(0, piece_budget))
	if count > 0:
		_make_debris(world_impact, strength, count)
	building_broken.emit(self)
	return true

func _make_debris(impact: Vector3, strength: float, budget: int) -> void:
	var nx: int = 2
	var nz: int = 2
	var ny: int = 2
	var dims := Vector3(maxf(1.0, bounds.size.x / nx), height_m / ny, maxf(1.0, bounds.size.y / nz))
	var spawned: int = 0
	for yi in range(ny):
		for zi in range(nz):
			for xi in range(nx):
				if spawned >= budget:
					return
				var center_x: float = bounds.position.x + dims.x * (float(xi) + 0.5)
				var center_z: float = bounds.position.y + dims.z * (float(zi) + 0.5)
				var center_y: float = dims.y * (float(yi) + 0.5)
				var block := RigidBody3D.new()
				block.name = "Debris"
				block.mass = maxf(1.0, dims.x * dims.y * dims.z * 0.03)
				block.linear_damp = 0.25
				block.angular_damp = 0.9
				block.collision_layer = 2
				block.collision_mask = 1
				block.continuous_cd = true
				block.position = Vector3(center_x, center_y, center_z)
				var box_mesh := BoxMesh.new()
				box_mesh.size = dims * 0.96
				var mesh_instance := MeshInstance3D.new()
				mesh_instance.mesh = box_mesh
				mesh_instance.material_override = _material
				block.add_child(mesh_instance)
				var collider := CollisionShape3D.new()
				var collider_shape := BoxShape3D.new()
				collider_shape.size = dims * 0.96
				collider.shape = collider_shape
				block.add_child(collider)
				add_child(block)
				block.add_to_group("scbk_debris")
				_pieces.append(block)
				var radial: Vector3 = block.global_position - impact
				radial.y += 4.0
				if radial.length_squared() < 0.01:
					radial = Vector3.UP
				radial = radial.normalized()
				var mass_factor: float = sqrt(block.mass)
				block.apply_central_impulse(radial * strength * mass_factor)
				block.apply_torque_impulse(Vector3(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * strength * mass_factor)
				spawned += 1

func reset_building() -> void:
	for piece in _pieces:
		if is_instance_valid(piece):
			piece.queue_free()
	_pieces.clear()
	broken = false
	_drawing.visible = true
	_solid.collision_layer = 1
	_solid.collision_mask = 1
	_collision.set_deferred("disabled", false)

func erase_debris() -> void:
	for piece in _pieces:
		if is_instance_valid(piece):
			piece.queue_free()
	_pieces.clear()

func has_debris() -> bool:
	for piece in _pieces:
		if is_instance_valid(piece) and not piece.is_queued_for_deletion():
			return true
	return false
