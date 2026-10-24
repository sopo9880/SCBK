extends StaticBody3D
## Local 49x49 terrain patch. Terrain is visible and collidable, and stores
## a real DEM when available; it can be deformed by impact craters.

const Mercator = preload("res://scripts/map_math.gd")
const GRID := 49

var extent: Vector2 = Vector2(2200.0, 2200.0)
var _heights: PackedFloat32Array = PackedFloat32Array()
var _mesh: MeshInstance3D
var _collider: CollisionShape3D
var _land_material: StandardMaterial3D
var _base_heightmap: PackedFloat32Array = PackedFloat32Array()
var _has_dem: bool = false

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
	if Mercator.validated(bounds):
		extent = Mercator.meters(bounds)
		extent += Vector2(160.0, 160.0)
	else:
		extent = Vector2(2200.0, 2200.0)
	_heights.resize(GRID * GRID)
	_heights.fill(0.0)
	_base_heightmap = _heights.duplicate()
	_has_dem = false
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
	_has_dem = true
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
	var modified: bool = false
	for z in range(GRID):
		for x in range(GRID):
			var at := Vector2(
				(float(x) / float(GRID - 1) - 0.5) * extent.x,
				(float(z) / float(GRID - 1) - 0.5) * extent.y)
			var d: float = at.distance_to(Vector2(world_position.x, world_position.z))
			if d >= radius:
				continue
			var t: float = d / radius
			# Bowl shape: smooth rim and a deeper centre.
			_heights[z * GRID + x] -= depth * pow(1.0 - t * t, 2.0)
			modified = true
	if modified:
		_rebuild_surface()

func restore() -> void:
	_heights = _base_heightmap.duplicate()
	_rebuild_surface()

func _vertex(tool: SurfaceTool, point: Vector3, tint: Color) -> void:
	tool.set_color(tint)
	tool.set_uv(Vector2(point.x, point.z) / 45.0)
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
			for triangle in [[a, c, b], [b, c, d]]:
				var e: Vector3 = triangle[0]
				var f: Vector3 = triangle[1]
				var g: Vector3 = triangle[2]
				var height_diff: float = maxf(absf(e.y-f.y), maxf(absf(f.y-g.y), absf(g.y-e.y)))
				var steepness: float = clampf(height_diff / 16.0, 0.0, 1.0)
				var grassy := Color(0.33, 0.44, 0.31).lerp(Color(0.50, 0.46, 0.38), steepness)
				for p in [e, f, g]:
					_vertex(tool, p, grassy)
					faces.append(p)
	tool.generate_normals()
	_mesh.mesh = tool.commit()
	_mesh.material_override = _land_material
	# Concave collision exactly matches visible irregular terrain; rebuild
	# after craters only. A 49^2 patch costs far less than a city-scale mesh.
	var shape := ConcavePolygonShape3D.new()
	shape.data = faces
	_collider.shape = shape
