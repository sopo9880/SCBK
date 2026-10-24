extends Node3D
## Data-driven 3D region renderer. Ground and roads are static; only hit buildings
## become Godot rigid bodies. A strict debris budget prevents runaway physics cost.

signal building_broken(building: Node3D)

const Building = preload("res://scripts/destructible_building.gd")
const MAX_DEBRIS := 128
const MAX_BUILDINGS := 280

var buildings: Array[Node3D] = []
var region_name: String = ""
var source_label: String = ""
var _buildings_root: Node3D
var _roads_root: Node3D
var _ground: StaticBody3D
var _last_broken: Array[Node3D] = []

func _ready() -> void:
	_buildings_root = Node3D.new()
	_buildings_root.name = "Buildings"
	add_child(_buildings_root)
	_roads_root = Node3D.new()
	_roads_root.name = "Roads"
	add_child(_roads_root)
	_make_ground()

func _make_ground() -> void:
	_ground = StaticBody3D.new()
	_ground.name = "Ground"
	_ground.collision_layer = 1
	_ground.collision_mask = 1
	_ground.position.y = -1.3
	var visual := MeshInstance3D.new()
	var slab := BoxMesh.new()
	slab.size = Vector3(2200, 2.4, 2200)
	visual.mesh = slab
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.34, 0.44, 0.35)
	mat.roughness = 0.94
	visual.material_override = mat
	_ground.add_child(visual)
	var solid := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = slab.size
	solid.shape = box
	_ground.add_child(solid)
	add_child(_ground)

func load_region(region: Dictionary, source: String) -> int:
	for old in buildings:
		if is_instance_valid(old):
			old.remove_from_group("scbk_buildings")
			old.queue_free()
	buildings.clear()
	_last_broken.clear()
	for road in _roads_root.get_children():
		road.queue_free()
	region_name = str(region.get("label", "Unnamed region"))
	source_label = source
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
		obj.building_broken.connect(_on_building_broken)
		buildings.append(obj)
		if buildings.size() >= MAX_BUILDINGS:
			break
	_build_roads(region.get("roads", []))
	return buildings.size()

func _push_tri(surface: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	surface.add_vertex(a)
	surface.add_vertex(b)
	surface.add_vertex(c)

func _build_roads(records: Array) -> void:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var triangles: int = 0
	for record in records:
		if not record is Dictionary:
			continue
		var width: float = clampf(float(record.get("width", 4.0)), 1.2, 14.0)
		var path: Array = record.get("path", [])
		for i in range(path.size() - 1):
			var a := Vector2(float(path[i][0]), float(path[i][1]))
			var b := Vector2(float(path[i + 1][0]), float(path[i + 1][1]))
			var diff: Vector2 = b - a
			if diff.length() < 0.1 or diff.length() > 700.0:
				continue
			var side: Vector2 = Vector2(-diff.y, diff.x).normalized() * width * 0.5
			var v0 := Vector3(a.x + side.x, 0.035, a.y + side.y)
			var v1 := Vector3(a.x - side.x, 0.035, a.y - side.y)
			var v2 := Vector3(b.x + side.x, 0.035, b.y + side.y)
			var v3 := Vector3(b.x - side.x, 0.035, b.y - side.y)
			_push_tri(surface, v0, v1, v2)
			_push_tri(surface, v1, v3, v2)
			triangles += 2
	if triangles <= 0:
		return
	surface.generate_normals()
	var road_mesh := MeshInstance3D.new()
	road_mesh.mesh = surface.commit()
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.23, 0.26, 0.28)
	material.roughness = 0.96
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	road_mesh.material_override = material
	_roads_root.add_child(road_mesh)

func _on_building_broken(building: Node3D) -> void:
	building_broken.emit(building)

func debris_count() -> int:
	var total: int = 0
	for building in buildings:
		for child in building.get_children():
			if child is RigidBody3D and not child.is_queued_for_deletion():
				total += 1
	return total

func destroyed_count() -> int:
	var total: int = 0
	for building in buildings:
		if building.broken:
			total += 1
	return total

func strike_building(building: Node3D, point: Vector3, impulse: float) -> Array[Node3D]:
	var affected: Array[Node3D] = []
	if not is_instance_valid(building) or building.broken:
		return affected
	var budget: int = maxi(0, MAX_DEBRIS - debris_count())
	if building.shatter(point, impulse, budget):
		affected.append(building)
		_last_broken = affected
	return affected

func strike_radius(point: Vector3, radius: float, impulse: float) -> Array[Node3D]:
	var affected: Array[Node3D] = []
	var remaining: int = maxi(0, MAX_DEBRIS - debris_count())
	for building in buildings:
		if building.broken:
			continue
		var distance: float = Vector2(building.global_position.x - point.x, building.global_position.z - point.z).length()
		var footprint_radius: float = building.bounds.size.length() * 0.30
		if distance > radius + footprint_radius:
			continue
		var falloff: float = clampf(1.0 - distance / maxf(radius, 1.0), 0.25, 1.0)
		var allotment: int = mini(8, remaining)
		if building.shatter(point, impulse * falloff, allotment):
			remaining -= allotment
			affected.append(building)
	_last_broken = affected
	return affected

func undo_last() -> int:
	var count: int = 0
	for building in _last_broken:
		if is_instance_valid(building) and building.broken:
			building.reset_building()
			count += 1
	_last_broken.clear()
	return count

func reset_all() -> void:
	for building in buildings:
		if building.broken:
			building.reset_building()
	_last_broken.clear()
