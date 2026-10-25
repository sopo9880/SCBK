extends SceneTree
## Offline map pipeline progress and 3D laser trench tests.
const Loader = preload("res://scripts/region_loader.gd")
const Mercator = preload("res://scripts/map_math.gd")
const Terrain = preload("res://scripts/terrain_surface.gd")

func _initialize() -> void:
	call_deferred("_run")

func _fail(message: String) -> void:
	printerr("SCBK v0.2.3 map progress/laser terrain regression failed: ", message)
	quit(1)

func _run() -> void:
	var loader: Node = Loader.new()
	root.add_child(loader)
	var bounds: Dictionary = Mercator.centered_bounds(31.75423, -96.4381, 280.0)
	var stages: Array[Dictionary] = []
	var results: Array[String] = []
	loader.load_stage.connect(func(value: float, label: String, unknown: bool) -> void:
		stages.append({"value": value, "label": label, "unknown": unknown})
	)
	loader.region_loaded.connect(func(_region: Dictionary, origin: String) -> void:
		results.append(origin)
	)
	loader._bounds = bounds.duplicate(true)
	var cache: String = loader._cache_path()
	var file: FileAccess = FileAccess.open(cache, FileAccess.WRITE)
	if file == null:
		_fail("Could not create a temporary offline map cache.")
		return
	file.store_string(JSON.stringify({"label": "Fixture", "buildings": [], "roads": [], "bounds": bounds}))
	file.close()
	loader.load_bounds(bounds, "Offline stage test")
	if results.size() != 1 or stages.size() < 2 or absf(float(stages.back()["value"]) - 1.0) > 0.001:
		_fail("Cached maps must report staged progress and completion without HTTP.")
		return
	DirAccess.remove_absolute(ProjectSettings.globalize_path(cache))
	stages.clear()
	loader._bounds = bounds.duplicate(true)
	var sample: Array = []
	for i in range(140):
		sample.append({"type": "way", "id": i, "tags": {"highway": "service"}, "geometry": [
			{"lat": 31.7540, "lon": -96.4380}, {"lat": 31.7541, "lon": -96.4378}
		]})
	loader._convert_osm({"elements": sample})
	if stages.size() < 3:
		_fail("Real vector conversion must report measured processed-element counts.")
		return
	for step in stages:
		if bool(step["unknown"]):
			_fail("Counting parsed OSM entries must be determinate, not guessed.")
			return
	var terrain: StaticBody3D = Terrain.new()
	root.add_child(terrain)
	var path: Array[Vector3] = [
		Vector3(-85, 0, -85), Vector3(-30, 0, -30),
		Vector3(0, 0, 0), Vector3(30, 0, 30), Vector3(85, 0, 85)
	]
	var base_y: float = terrain.height_at(0.0, 0.0)
	terrain.laser_cut(path, 12.0, 6.0)
	if terrain.height_at(0.0, 0.0) > base_y - 4.0:
		_fail("A continuous laser path must cut a real groove into the ground.")
		return
	var samples := PackedFloat32Array()
	samples.resize(49 * 49)
	samples.fill(0.0)
	if not terrain.apply_dem(samples, 49, 49) or terrain.height_at(0, 0) > base_y - 4.0:
		_fail("Asynchronous DEM must not repair laser-cut ground.")
		return
	terrain.restore()
	if absf(terrain.height_at(0, 0) - base_y) > 0.001:
		_fail("Reset must restore the laser trench.")
		return
	print("SCBK v0.2.3 loader real-stage percentages / one-pass laser cut / delayed DEM: PASS")
	quit(0)
