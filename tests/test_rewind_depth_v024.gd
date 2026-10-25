extends SceneTree
## Full state rewind: terrain checkpoint, partially broken building and score.
const Terrain = preload("res://scripts/terrain_surface.gd")
const Building = preload("res://scripts/destructible_building.gd")
const Builder = preload("res://scripts/world_builder.gd")
const Scores = preload("res://scripts/score_system.gd")

func _initialize() -> void:
	call_deferred("_run")

func _fail(message: String) -> void:
	printerr("SCBK v0.2.4 depth/rewind regression failed: ", message)
	quit(1)

func _run() -> void:
	var stage := Node3D.new()
	root.add_child(stage)
	var ground: StaticBody3D = Terrain.new()
	stage.add_child(ground)
	var original: Dictionary = ground.capture_checkpoint()
	var surface: float = ground.height_at(0, 0)
	ground.crater_at(Vector3.ZERO, 120.0, 14.0)
	var excavation: Dictionary = ground.depth_info()
	if ground.height_at(0, 0) >= surface - 6.0:
		_fail("Real collidable terrain must deform when excavated.")
		return
	if float(excavation["virtual_depth_km"]) < 35.0 or str(excavation["layer"]) != "맨틀":
		_fail("Deep craters must reveal a simulated mantle and a depth reading.")
		return
	ground.restore_checkpoint(original)
	if absf(ground.height_at(0, 0) - surface) > 0.0001:
		_fail("One-step ground history must refill the crater exactly.")
		return
	var builder: Node3D = Builder.new()
	stage.add_child(builder)
	var example: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/offline_demo.json"))
	if not example is Dictionary:
		_fail("Training city fixture unavailable.")
		return
	builder.load_region(example, "Fictional training")
	if builder.buildings.is_empty():
		_fail("Training city has no destructible targets.")
		return
	var first_building: Node3D = builder.buildings[0]
	var start: Vector3 = first_building.global_position
	var scorer: Node = Scores.new()
	stage.add_child(scorer)
	var original_score: Dictionary = scorer.capture_score()
	builder.begin_rewind_action(original_score)
	var impact: Dictionary = builder.strike_radius(start + Vector3.UP * 8.0, 39.0, 25.0, Vector3.UP, 4)
	builder.crater_at(Vector3(start.x, 0.0, start.z), 42.0, 14.0)
	scorer.add_hit(0, int(impact["buildings"]), int(impact["pieces"]))
	builder.commit_rewind_action()
	if builder.rewind_action_count() != 1:
		_fail("A weapon must store one compound building+terrain checkpoint.")
		return
	if first_building.damage_fraction() <= 0.0:
		_fail("The test attack must damage a building.")
		return
	if float(builder.earth_depth_info()["world_depth_m"]) < 2.0:
		_fail("The test attack must excavate a visible crater.")
		return
	var undone: Dictionary = builder.undo_rewind_action()
	scorer.restore_score(undone["score"])
	if first_building.damage_fraction() > 0.001 or builder.debris_count() != 0:
		_fail("Undo must reconstruct the previous building state, not leave debris.")
		return
	if float(builder.earth_depth_info()["world_depth_m"]) > 0.0001:
		_fail("Undo must restore terrain from the same attack.")
		return
	if scorer.score != 0 or builder.rewind_action_count() != 0:
		_fail("Undo must restore the exact scoring state and remove the action.")
		return
	var stand_alone: Node3D = Building.new()
	stage.add_child(stand_alone)
	stand_alone.configure({
		"id": "parity-fragment-test",
		"name": "Stone tower",
		"height": 32.0,
		"outline": [[-22.0, -18.0], [22.0, -18.0], [22.0, 18.0], [-22.0, 18.0]]
	})
	if stand_alone.damage_at(Vector3(0, 30, 0), 18.0, 9.0, Vector3.UP, 12, 4) < 1:
		_fail("Fixture should fracture a few tower cells.")
		return
	var halfway: Dictionary = stand_alone.capture_damage_state()
	var proportion: float = stand_alone.damage_fraction()
	stand_alone.damage_at(Vector3(12, 12, 6), 16.0, 9.0, Vector3.UP, 8, 4)
	stand_alone.restore_damage_state(halfway)
	if absf(stand_alone.damage_fraction() - proportion) > 0.01:
		_fail("Rewind must retain older partial structural damage exactly.")
		return
	var previous_fragments: Array = halfway["fragments"]
	if stand_alone.active_debris_count() != previous_fragments.size():
		_fail("Rewind must rebuild the original fragment count.")
		return
	var backup: Dictionary = ground.capture_checkpoint()
	ground.crater_at(Vector3.ZERO, 95.0, 11.0)
	var flat := PackedFloat32Array()
	flat.resize(49 * 49)
	flat.fill(0.0)
	if not ground.apply_dem(flat, 49, 49):
		_fail("Elevation fixture could not be applied.")
		return
	ground.restore_checkpoint(backup)
	if absf(ground.height_at(0, 0) - surface) > 0.0001:
		_fail("Undo must adapt old checkpoints to a newly downloaded DEM.")
		return
	print("SCBK v0.2.4 layered-earth depth / atomic rewind / partial fragment+score+DEM: PASS")
	quit(0)
