extends SceneTree
## Offline Godot gameplay regression: bounded fracture, terrain crater and score.
const Building = preload("res://scripts/destructible_building.gd")
const Terrain = preload("res://scripts/terrain_surface.gd")
const Scoring = preload("res://scripts/score_system.gd")

func _initialize() -> void:
	call_deferred("_run")

func _fail(why: String) -> void:
	printerr("SCBK gameplay test failed: ", why)
	quit(1)

func _run() -> void:
	var stage := Node3D.new()
	root.add_child(stage)
	var building: Node3D = Building.new()
	stage.add_child(building)
	building.configure({
		"id": "test-building",
		"name": "Test building",
		"height": 32.0,
		"outline": [[-22.0, -18.0], [22.0, -18.0], [22.0, 18.0], [-22.0, 18.0]]
	})
	var first: int = building.damage_at(Vector3(0, 30, 0), 18.0, 9.0, Vector3.UP, 12, 4)
	if first <= 0 or building.damage_fraction() <= 0.0 or building.damage_fraction() >= 1.0:
		_fail("A hit must fracture only part of an intact building.")
		return
	if building.active_debris_count() > first:
		_fail("Debris budget overflow.")
		return
	var second: int = building.damage_at(Vector3(12, 12, 6), 16.0, 9.0, Vector3.UP, 8, 4)
	if second <= 0:
		_fail("Later hits should damage a different building section.")
		return
	building.reset_building()
	if building.damage_fraction() != 0.0 or building.active_debris_count() != 0:
		_fail("Reset did not restore an intact building.")
		return
	var terrain: StaticBody3D = Terrain.new()
	stage.add_child(terrain)
	var before: float = terrain.height_at(0, 0)
	terrain.crater_at(Vector3.ZERO, 130.0, 10.0)
	if terrain.height_at(0, 0) >= before - 0.5:
		_fail("Explosion did not create a physical terrain crater.")
		return
	terrain.restore()
	if absf(terrain.height_at(0, 0) - before) > 0.001:
		_fail("Restoring the terrain did not undo the crater.")
		return
	var score: Node = Scoring.new()
	stage.add_child(score)
	if score.add_hit(0, 1, first) <= 0 or score.score <= 0:
		_fail("Scoring did not reward a fractured building.")
		return
	if score.add_hit(1, 1, second) <= 0 or score.combo < 2:
		_fail("Combo did not increase after switching tools.")
		return
	print("SCBK v0.2.0 fracture / crater / combo regression passed.")
	quit(0)
