extends SceneTree
## Fast map conversion and bounding-box smoke test; no network needed.
const Mercator = preload("res://scripts/map_math.gd")

func _initialize() -> void:
	for location in [
		Vector2(35.11619, 128.96733),
		Vector2(37.5665, 126.9780),
		Vector2(35.1796, 129.0756),
		Vector2(40.7128, -74.0060),
		Vector2(-33.8688, 151.2093)
	]:
		var px: Vector2 = Mercator.project(location.x, location.y, 16)
		var roundtrip: Vector2 = Mercator.unproject(px, 16)
		if absf(roundtrip.x - location.x) > 0.0001 or absf(roundtrip.y - location.y) > 0.0001:
			printerr("Web Mercator conversion failed: ", location, " -> ", roundtrip)
			quit(1)
			return
	var box: Dictionary = Mercator.centered_bounds(35.11619, 128.96733, 450)
	var dimensions: Vector2 = Mercator.meters(box)
	if not Mercator.validated(box) or absf(dimensions.x - 900.0) > 3.0 or absf(dimensions.y - 900.0) > 3.0:
		printerr("Centered 900 m bounding region invalid: ", box, " / ", dimensions)
		quit(1)
		return
	var screen_bounds: Dictionary = Mercator.from_pixels(Vector2(100, 100), Vector2(500, 500), Vector2(35.11619, 128.96733), Vector2(900, 600), 16)
	if screen_bounds.is_empty() or not Mercator.validated(screen_bounds):
		printerr("Pixel selection did not generate a valid regional bounding box")
		quit(1)
		return
	var huge: Dictionary = Mercator.centered_bounds(35.1, 129.0, 5000)
	if Mercator.validated(huge):
		printerr("Large selections must be rejected to protect Overpass/physics resources")
		quit(1)
		return
	print("SCBK map math tests passed")
	quit(0)
