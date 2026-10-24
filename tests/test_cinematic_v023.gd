extends SceneTree
## V0.2.3 offline gameplay checks: massive nuke, M4-10, visual reset, HUD.
func _initialize() -> void:
	call_deferred("_run")

func _fail(detail: String) -> void:
	printerr("SCBK v0.2.3 cinematic regression failed: ", detail)
	quit(1)

func _run() -> void:
	var game_scene: PackedScene = load("res://scenes/main.tscn")
	if game_scene == null:
		_fail("Cannot load the main game scene.")
		return
	var game: Node3D = game_scene.instantiate()
	root.add_child(game)
	await process_frame
	game.call("_load_training_block")
	var fx: Node = game.get("_v2_fx")
	var world: Node3D = game.get_node("World")
	var nuke: HSlider = game.get("_nuke_slider")
	if fx == null or nuke == null:
		_fail("Missing effects or nuclear controls.")
		return
	game.call("_select_tool", 5)
	game.call("_set_nuke_radius", 8000.0)
	if not is_equal_approx(float(fx.call("get_nuke_radius")), 8000.0):
		_fail("The extra-large nuclear preset must have a true 8km radius.")
		return
	if absf(nuke.value - 360.0) > 0.01:
		_fail("Standard nuclear slider must stay in its usable 40-360m range.")
		return
	var count: int = world.buildings.size()
	if count <= 0:
		_fail("Fictional training map must include destructible buildings.")
		return
	world.call("begin_massive_blast")
	var inner: Dictionary = world.call("massive_blast", Vector3.ZERO, 170.0, 100.0)
	var impact: Dictionary = world.call("massive_blast", Vector3.ZERO, 8000.0, 120.0)
	if world.destroyed_count() != count or int(inner.get("buildings", 0)) + int(impact.get("buildings", 0)) != count:
		_fail("An 8km hit must collapse every LOADED building, not stop at 160 fragments.")
		return
	if world.debris_count() > 160:
		_fail("Huge-area physics must obey the global 160 fragment cap.")
		return
	var restored: int = world.undo_last()
	if restored != count or world.destroyed_count() != 0:
		_fail("Undo must recover distant lightweight-collapsed buildings.")
		return
	game.call("_select_tool", 4)
	var quake_controls: HBoxContainer = game.get("_quake_row")
	var quake_slider: HSlider = game.get("_quake_slider")
	if quake_controls == null or quake_slider == null or not quake_controls.visible:
		_fail("Magnitude slider must appear when earthquake is selected.")
		return
	game.call("_set_quake_magnitude", 9.3)
	if absf(quake_slider.value - 9.3) > 0.051 or absf(float(fx.call("get_quake_magnitude")) - 9.3) > 0.051:
		_fail("Seismic slider and simulation must share the same magnitude.")
		return
	game.call("_select_tool", 1)
	var bat_controls: HBoxContainer = game.get("_bat_row")
	if bat_controls == null or not bat_controls.visible:
		_fail("The bat size adjustment must appear for weapon 2.")
		return
	game.call("_set_bat_size", 2.5)
	if absf(float(fx.get("_bat_scale")) - 2.5) > 0.01:
		_fail("Bat size UI must be connected to real swing/strike parameters.")
		return
	game.call("_on_cinematic_start", 5)
	var camera: Camera3D = game.get("_camera")
	if camera.far < 19999.0:
		_fail("Wide blast camera must extend far clipping to include its effects.")
		return
	game.call("_on_cinematic_end", 5)
	game.call("_on_map_loading_started", "Offline test")
	var loading_panel: PanelContainer = game.get("_loading_panel")
	if loading_panel == null or not loading_panel.visible:
		_fail("A map request must show the graphical progress panel.")
		return
	game.call("_on_loader_stage", 0.45, "Vector analysis", false)
	var progress: ProgressBar = game.get("_loading_bar")
	if absf(progress.value - 45.0) > 0.01:
		_fail("Real measurable stage progress must update the progress bar.")
		return
	game.call("_on_loader_stage", 0.12, "HTTP pending", true)
	if not bool(game.get("_loading_indeterminate")):
		_fail("Unknown HTTP transfer length must remain indeterminate.")
		return
	game.call("_on_map_loading_cancelled")
	if loading_panel.visible:
		_fail("Cancellation must hide the progress bar.")
		return
	var service: Node = game.get_node_or_null("MapService")
	if service != null:
		service.cancel_load()
	print("SCBK v0.2.3 8km nuke / collapse cap / undo / M4-10 quake / bat / loading HUD: PASS")
	quit(0)
