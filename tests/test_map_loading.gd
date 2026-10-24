extends SceneTree
## Offline regression: cached maps, repeated in-progress click and cancellation.
const Loader = preload("res://scripts/region_loader.gd")
const Mercator = preload("res://scripts/map_math.gd")

func _initialize() -> void:
	call_deferred("_run")

func _fail(why: String) -> void:
	printerr("SCBK map recovery test failed: ", why)
	quit(1)

func _run() -> void:
	var service: Node = Loader.new()
	root.add_child(service)
	var bounds: Dictionary = Mercator.centered_bounds(23.49432, 129.43123, 280.0)
	var regions: Array[String] = []
	var problems: Array[String] = []
	var progress: Array[String] = []
	var cancellations: Array[int] = []
	service.region_loaded.connect(func(_data: Dictionary, source: String) -> void: regions.append(source))
	service.region_failed.connect(func(message: String) -> void: problems.append(message))
	service.loading_progress.connect(func(message: String, _attempt: int, _total: int) -> void: progress.append(message))
	service.loading_cancelled.connect(func() -> void: cancellations.append(1))
	service._bounds = bounds.duplicate(true)
	var path: String = service._cache_path()
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		_fail("Could not write offline test cache.")
		return
	file.store_string(JSON.stringify({
		"label": "Sample", "center_lat": 23.49432,
		"center_lon": 129.43123, "buildings": [], "roads": []
	}))
	file.close()
	service.load_bounds(bounds, "Cached sample")
	if regions.size() != 1 or regions[0] != "Cached OpenStreetMap" or service.is_busy():
		_fail("Cached map must load instantly, without new HTTP.")
		return
	service._active = true
	service._bounds = bounds.duplicate(true)
	service.load_bounds(bounds, "Repeated click")
	if problems.size() != 0 or progress.size() != 1:
		_fail("Duplicate in-flight selection must show progress, not an error.")
		return
	service.cancel_load()
	if service.is_busy() or cancellations.size() != 1:
		_fail("Cancel button must release loading state.")
		return
	service.retry_last()
	if regions.size() != 2 or not problems.is_empty():
		_fail("Retry must preserve selected coordinates and reuse cache.")
		return
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	print("SCBK v0.2.1 cache / no-false-error / cancel / retry: PASS")
	quit(0)
