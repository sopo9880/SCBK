extends SceneTree
## Completely offline map projection and deformable ground physics regression.
const Mercator = preload("res://scripts/map_math.gd")
const GroundMap = preload("res://scripts/ground_map_projection.gd")
const Terrain = preload("res://scripts/terrain_surface.gd")

func _initialize() -> void:
	call_deferred("_run")

func _fail(message: String) -> void:
	printerr("SCBK projection / crater regression failed: ", message)
	quit(1)

func _run() -> void:
	var mapper: Node = GroundMap.new()
	root.add_child(mapper)
	var bounds: Dictionary = Mercator.centered_bounds(34.59123, 127.43782, 330.0)
	var region: Dictionary = {
		"bounds": bounds,
		"roads": [{"width": 9.0, "path": [[-100.0, 0.0], [100.0, 0.0]]}],
		"buildings": [{
			"name": "Mapped test building",
			"outline": [[-30.0, -32.0], [30.0, -32.0], [30.0, -9.0], [-30.0, -9.0]]
		}]
	}
	var floor: StaticBody3D = Terrain.new()
	root.add_child(floor)
	floor.reset_plane(bounds)
	var textures: Array[Texture2D] = []
	mapper.projection_ready.connect(func(texture: Texture2D, _source: String) -> void:
		textures.append(texture)
	)
	mapper.build_projection(region, floor.extent)
	if textures.size() != 1:
		_fail("A user-selected real region must produce one projected map image.")
		return
	var texture: Texture2D = textures[0]
	if texture.get_width() != 512 or texture.get_height() != 512:
		_fail("Ground image must be bounded to 512x512 pixels.")
		return
	var raster: Image = texture.get_image()
	if raster == null or raster.get_pixel(256, 256).r <= raster.get_pixel(12, 12).r + 0.1:
		_fail("OSM road geometry was not projected onto the centre of the map.")
		return
	floor.set_map_texture(texture)
	if floor.get("_map_texture") != texture:
		_fail("Ground mesh must retain map texture across deformations.")
		return
	var initial: float = floor.height_at(0.0, 0.0)
	floor.crater_at(Vector3.ZERO, 29.0, 9.0)
	if floor.height_at(0.0, 0.0) > initial - 5.0:
		_fail("Bomb must create an actual collidable depression at ground level.")
		return
	var scorch: PackedFloat32Array = floor.get("_scorch")
	var midpoint: int = 24 * 49 + 24
	if scorch[midpoint] < 0.2:
		_fail("The crater must leave a scorched ground surface.")
		return
	if floor.get("_map_texture") != texture:
		_fail("Deforming terrain must not drop the projected map image.")
		return
	floor.restore()
	if absf(floor.height_at(0.0, 0.0) - initial) > 0.001:
		_fail("Reset must restore the ground elevation.")
		return
	scorch = floor.get("_scorch")
	if scorch[midpoint] > 0.001:
		_fail("Reset must clear the crater scorch.")
		return
	floor.reset_plane({})
	if floor.get("_map_texture") != null:
		_fail("Switching to an offline map must clear the real region texture.")
		return
	print("SCBK v0.2.2 offline map projection / ground crater / scorch / reset: PASS")
	quit(0)
