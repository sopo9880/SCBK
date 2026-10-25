extends SceneTree
## Offline integration: original-feel HUD and camera, controls, sound and sky.
func _initialize() -> void:
	call_deferred("_run")

func _fail(message: String) -> void:
	printerr("SCBK v0.2.4 local-feel integration failed: ", message)
	quit(1)

func _run() -> void:
	var scene: PackedScene = load("res://scenes/main.tscn")
	if scene == null:
		_fail("Cannot load playable scene.")
		return
	var game: Node3D = scene.instantiate()
	root.add_child(game)
	await process_frame
	game.call("_load_training_block")
	var depth: PanelContainer = game.get_node_or_null("HUD/EarthDepthGauge")
	var history: Label = game.get("_rewind_caption")
	var stars: MultiMeshInstance3D = game.get_node_or_null("NightStars")
	var moon: MeshInstance3D = game.get_node_or_null("NightMoon")
	if depth == null or history == null or stars == null or moon == null:
		_fail("Game must show the native depth gauge and contain procedural night sky.")
		return
	if stars.visible or moon.visible:
		_fail("Stars and moon must start hidden in daylight mode.")
		return
	game.call("_v2_toggle_night")
	if not stars.visible or not moon.visible:
		_fail("Night mode must show stars and moon.")
		return
	game.call("_v2_toggle_night")
	if stars.visible or moon.visible:
		_fail("Returning to day must hide celestial objects.")
		return
	game.call("_toggle_sound")
	var audio: AudioStreamPlayer = game.get("_v2_audio")
	if audio == null or audio.volume_db > -70.0:
		_fail("User must be able to mute synthesized weapon sound.")
		return
	game.call("_toggle_sound")
	if audio.volume_db < -20.0:
		_fail("Sound enable must restore a usable level.")
		return
	game.call("_overhead_view")
	if absf(float(game.get("_pitch")) + 1.48) > 0.01:
		_fail("Top-down view preset must be overhead.")
		return
	game.call("_home_view")
	if absf(float(game.get("_yaw")) - 0.6) > 0.01:
		_fail("Home view must reset orbit orientation.")
		return
	game.call("_select_tool", 0)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.position = Vector2(650.0, 560.0)
	press.pressed = true
	game.call("_unhandled_input", press)
	if not bool(game.get("_orbit_candidate")):
		_fail("Left press begins the camera-orbit/click detection.")
		return
	var drag := InputEventMouseMotion.new()
	drag.position = Vector2(676.0, 560.0)
	drag.relative = Vector2(26.0, 0.0)
	game.call("_unhandled_input", drag)
	if not bool(game.get("_orbit_moved")):
		_fail("Left dragging past the threshold must orbit rather than shoot.")
		return
	press.pressed = false
	press.position = drag.position
	game.call("_unhandled_input", press)
	if bool(game.get("_orbit_candidate")):
		_fail("Releasing left mouse button must end orbit state.")
		return
	game.call("_select_tool", 2)
	if bool(game.get("_orbit_candidate")):
		_fail("Laser selection must disable camera left-drag state.")
		return
	var fx: Node = game.get("_v2_fx")
	if not fx.has_method("skip_cinematic"):
		_fail("Drop cinematics must support skipping without cancelling damage.")
		return
	var service: Node = game.get_node_or_null("MapService")
	if service != null:
		service.cancel_load()
	print("SCBK v0.2.4 local camera / night / audio / depth HUD / laser orbit controls: PASS")
	quit(0)
