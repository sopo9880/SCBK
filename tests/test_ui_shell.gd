extends SceneTree
## Verify booted UI tree, compact HUD collapse, visible weapons and retry state.
func _initialize() -> void:
	call_deferred("_run")

func _fail(why: String) -> void:
	printerr("SCBK UI integration test failed: ", why)
	quit(1)

func _run() -> void:
	var scene: PackedScene = load("res://scenes/main.tscn")
	var game: Node3D = scene.instantiate()
	root.add_child(game)
	await process_frame
	var card: Control = game.get_node_or_null("HUD/WorldCard")
	var dock: Control = game.get_node_or_null("HUD/WeaponsDock")
	var picker: Control = game.get_node_or_null("HUD/WorldMapPicker")
	if card == null or dock == null or picker == null:
		_fail("Game must boot with compact world HUD, bottom dock and map overlay.")
		return
	if not card.visible or not dock.visible or picker.visible:
		_fail("Game must start with unobstructed 3D view and visible weapon dock.")
		return
	var body: Control = game.get("_world_body")
	if body == null or not body.visible:
		_fail("World controls must initially be available.")
		return
	game.call("_toggle_world_card")
	if body.visible:
		_fail("World panel must be collapsible.")
		return
	game.call("_toggle_world_card")
	if not body.visible:
		_fail("World panel must reopen.")
		return
	game.call("_on_region_failed", "Simulated HTTP failure")
	var retry: Button = game.get("_map_retry")
	var cancel: Button = game.get("_map_cancel")
	if not retry.visible or cancel.visible:
		_fail("Only real loading errors should show the Retry action.")
		return
	game.call("_select_tool", 2)
	var indicator: Label = game.get("_tool_label")
	if indicator == null or not indicator.text.contains("레이저"):
		_fail("Selected laser tool must be clearly indicated.")
		return
	var loader: Node = game.get_node_or_null("MapService")
	if loader != null:
		loader.cancel_load()
	print("SCBK v0.2.1 compact HUD + weapon dock + retry UI: PASS")
	quit(0)
