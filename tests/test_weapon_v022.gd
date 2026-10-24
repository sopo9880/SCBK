extends SceneTree
## Headless verification for ground-only hits, bat restrictions and nuke range UI.
func _initialize() -> void:
	call_deferred("_run")

func _fail(why: String) -> void:
	printerr("SCBK weapon selection test failed: ", why)
	quit(1)

func _run() -> void:
	var packed: PackedScene = load("res://scenes/main.tscn")
	if packed == null:
		_fail("Game scene is unavailable.")
		return
	var game: Node3D = packed.instantiate()
	root.add_child(game)
	await process_frame
	for weapon in range(6):
		var ground_allowed: bool = bool(game.call("_weapon_allows_ground", weapon))
		if ground_allowed != (weapon != 1):
			_fail("Only bat must refuse ground targets (weapon %d)." % weapon)
			return
	var hit: Dictionary = game.call("_ground_ray", Vector3(0, 130, 0), Vector3.DOWN)
	if hit.is_empty() or not hit.has("collider"):
		_fail("A straight downward ray must find the ground without a building.")
		return
	var world: Node3D = game.get_node("World")
	if not world.point_over_ground(hit["position"]):
		_fail("Ground point must lie within visible map extent.")
		return
	if not game.call("_ground_ray", Vector3(50000, 100, 0), Vector3.DOWN).is_empty():
		_fail("Cannot blast an invisible area outside the selected map.")
		return
	game.call("_select_tool", 5)
	var nuke: HBoxContainer = game.get("_nuke_row")
	var slider: HSlider = game.get("_nuke_slider")
	var fx: Node3D = game.get("_v2_fx")
	if nuke == null or slider == null or not nuke.visible:
		_fail("Nuclear range controls must become visible after selecting weapon 6.")
		return
	game.call("_set_nuke_radius", 260.0)
	if absf(slider.value - 260.0) > 0.01 or absf(float(fx.call("get_nuke_radius")) - 260.0) > 0.01:
		_fail("Nuclear slider, preview and weapon mechanics must share one radius.")
		return
	game.call("_select_tool", 1)
	if nuke.visible:
		_fail("Ground-blast radius controls should hide when switching to bat.")
		return
	var projector: Node = game.get_node_or_null("MapProjection")
	if projector == null:
		_fail("Live game must load the new map-projection service.")
		return
	var map_service: Node = game.get_node_or_null("MapService")
	if map_service != null:
		map_service.cancel_load()
	print("SCBK v0.2.2 weapon ground/only-bat/adjustable nuke UI: PASS")
	quit(0)
