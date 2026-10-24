extends Node3D
## Native Godot weapon choreography: distinct gameplay timing, VFX and impacts.
## No assets copied from the SMASH project.

signal impact_triggered(point: Vector3, radius: float, impulse: float, weapon: int, per_building: int, direction: Vector3)
signal terrain_struck(point: Vector3, radius: float, depth: float)
signal camera_kicked(power: float, seconds: float)
signal action_started(weapon: int)
signal action_finished(weapon: int)

const WEAPON_BOMB := 0
const WEAPON_BAT := 1
const WEAPON_LASER := 2
const WEAPON_METEOR := 3
const WEAPON_QUAKE := 4
const WEAPON_NUKE := 5

var _epoch: int = 0
var _night: bool = false
var _active: bool = false

func is_busy() -> bool:
	return _active

func cancel_pending() -> void:
	_epoch += 1
	_active = false
	Engine.time_scale = 1.0
	for item in get_children():
		item.queue_free()

func set_night(enabled: bool) -> void:
	_night = enabled

func strike(weapon: int, target: Vector3, view_dir: Vector3 = Vector3.FORWARD) -> void:
	if _active:
		return
	match weapon:
		WEAPON_BOMB:
			_bomb(target)
		WEAPON_BAT:
			_bat(target, view_dir)
		WEAPON_METEOR:
			_drop(target, WEAPON_METEOR)
		WEAPON_QUAKE:
			_start_quake(target)
		WEAPON_NUKE:
			_drop(target, WEAPON_NUKE)
		_:
			_bomb(target)

func laser_stroke(points: Array[Vector3]) -> void:
	if _active or points.is_empty():
		return
	_active = true
	_epoch += 1
	var id: int = _epoch
	action_started.emit(WEAPON_LASER)
	_camera_blast(2.0, 0.15)
	_laser_sequence(points, id)

func _laser_sequence(points: Array[Vector3], id: int) -> void:
	# Visible charge time and sequential impacts along the drawn stroke.
	await get_tree().create_timer(0.30).timeout
	if id != _epoch:
		return
	var limit: int = mini(points.size(), 16)
	for i in range(limit):
		if id != _epoch:
			return
		var point: Vector3 = points[i]
		_shockwave(point, 15.0, Color(0.16, 0.83, 1.0, 0.72), 0.19)
		_flash(point + Vector3.UP * 7.0, 2.8, Color(0.50, 0.85, 1.0), 0.11)
		impact_triggered.emit(point, 14.0, 18.0, WEAPON_LASER, 5, Vector3.UP * 0.8)
		if i % 3 == 0:
			terrain_struck.emit(point, 9.0, 0.9)
		await get_tree().create_timer(0.065).timeout
	if id == _epoch:
		_active = false
		action_finished.emit(WEAPON_LASER)

func _bomb(target: Vector3) -> void:
	_shockwave(target, 50.0, Color(1.0, 0.55, 0.16, 0.67), 0.42)
	_flash(target + Vector3.UP * 4.0, 8.0, Color(1.0, 0.90, 0.53), 0.19)
	impact_triggered.emit(target, 38.0, 19.0, WEAPON_BOMB, 10, Vector3.UP * 0.25)
	terrain_struck.emit(target, 21.0, 4.0)
	_camera_blast(5.8, 0.34)

func _bat(target: Vector3, view_dir: Vector3) -> void:
	var push: Vector3 = (-view_dir + Vector3.UP * 0.48).normalized()
	_swing(target, push)
	impact_triggered.emit(target, 9.0, 29.0, WEAPON_BAT, 5, push)
	_camera_blast(1.6, 0.16)

func _drop(target: Vector3, weapon: int) -> void:
	if _active:
		return
	_active = true
	_epoch += 1
	var id: int = _epoch
	action_started.emit(weapon)
	var nuclear: bool = weapon == WEAPON_NUKE
	var projectile := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 6.0 if nuclear else 10.0
	sphere.height = 12.0 if nuclear else 20.0
	projectile.mesh = sphere
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.42, 0.43, 0.41) if nuclear else Color(0.55, 0.24, 0.10)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.28, 0.08)
	mat.emission_energy_multiplier = 0.5 if nuclear else 2.0
	projectile.material_override = mat
	projectile.position = target + Vector3(0.0, 290.0 if nuclear else 200.0, 0.0)
	add_child(projectile)
	var tween := create_tween()
	tween.tween_property(projectile, "position", target + Vector3(0, 7.0, 0), 1.8 if nuclear else 1.1).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	await tween.finished
	if id != _epoch:
		return
	projectile.queue_free()
	if nuclear:
		_detonate_nuke(target, id)
	else:
		_shockwave(target, 125.0, Color(1.0, 0.42, 0.12, 0.70), 0.72)
		_flash(target + Vector3.UP * 13.0, 19.0, Color(1.0, 0.78, 0.38), 0.38)
		impact_triggered.emit(target, 84.0, 32.0, WEAPON_METEOR, 16, Vector3.DOWN)
		terrain_struck.emit(target, 58.0, 13.0)
		_camera_blast(13.0, 0.72)
		_active = false
		action_finished.emit(weapon)

func _detonate_nuke(target: Vector3, id: int) -> void:
	Engine.time_scale = 0.45
	_flash(target + Vector3.UP * 70.0, 90.0, Color(1.0, 0.99, 0.83), 0.65)
	_shockwave(target, 350.0, Color(1.0, 0.52, 0.21, 0.62), 2.2)
	# Four lobes and a cap, an entirely procedural mushroom silhouette.
	for i in range(4):
		_flash(target + Vector3(0, float(i) * 26.0 + 18.0, 0), float(i) * 13.0 + 25.0, Color(0.82, 0.47, 0.23, 0.40), 1.3)
	_flash(target + Vector3(0, 142.0, 0), 72.0, Color(0.89, 0.60, 0.33, 0.46), 1.8)
	impact_triggered.emit(target, 235.0, 42.0, WEAPON_NUKE, 32, Vector3.UP)
	terrain_struck.emit(target, 130.0, 24.0)
	_camera_blast(24.0, 1.3)
	await get_tree().create_timer(1.15, true, false, true).timeout
	if id == _epoch:
		Engine.time_scale = 1.0
		_active = false
		action_finished.emit(WEAPON_NUKE)

func _start_quake(target: Vector3) -> void:
	_active = true
	_epoch += 1
	var id: int = _epoch
	action_started.emit(WEAPON_QUAKE)
	_quake_sequence(target, id)

func _quake_sequence(target: Vector3, id: int) -> void:
	for i in range(9):
		if id != _epoch:
			return
		var wobble := Vector3(randf_range(-18.0, 18.0), 0, randf_range(-18.0, 18.0))
		_camera_blast(2.5 + float(i) * 0.45, 0.25)
		impact_triggered.emit(target + wobble, 125.0, 5.5 + float(i) * 0.7, WEAPON_QUAKE, 4, Vector3.UP * 0.2)
		if i % 3 == 0:
			_shockwave(target + wobble, 34.0 + float(i) * 6.0, Color(0.77, 0.74, 0.53, 0.26), 0.36)
		await get_tree().create_timer(0.31).timeout
	if id == _epoch:
		_active = false
		action_finished.emit(WEAPON_QUAKE)

func _camera_blast(power: float, duration: float) -> void:
	camera_kicked.emit(power, duration)

func _flash(point: Vector3, scale_size: float, color: Color, fade_time: float) -> void:
	var sphere := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 2.0
	sphere.mesh = mesh
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	sphere.material_override = material
	sphere.position = point
	sphere.scale = Vector3.ONE * maxf(1.0, scale_size * 0.4)
	add_child(sphere)
	var tween := create_tween()
	tween.tween_property(sphere, "scale", Vector3.ONE * scale_size, fade_time).set_trans(Tween.TRANS_SINE)
	tween.parallel().tween_property(material, "albedo_color:a", 0.0, fade_time)
	tween.tween_callback(sphere.queue_free)

func _shockwave(point: Vector3, radius: float, color: Color, seconds: float) -> void:
	var ring := MeshInstance3D.new()
	var mesh := TorusMesh.new()
	mesh.inner_radius = 0.84
	mesh.outer_radius = 1.0
	mesh.rings = 8
	mesh.ring_segments = 40
	ring.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = color
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	ring.material_override = mat
	ring.position = point + Vector3.UP * 1.5
	ring.scale = Vector3(1.0, 0.2, 1.0)
	add_child(ring)
	var tween := create_tween()
	tween.tween_property(ring, "scale", Vector3(radius, 0.20, radius), seconds).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(mat, "albedo_color:a", 0.0, seconds)
	tween.tween_callback(ring.queue_free)

func _swing(target: Vector3, direction: Vector3) -> void:
	var bat := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.7
	mesh.bottom_radius = 1.2
	mesh.height = 36.0
	mesh.radial_segments = 7
	bat.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.73, 0.52, 0.29)
	bat.material_override = material
	bat.position = target - direction * 12.0 + Vector3.UP * 10.0
	bat.rotation_degrees = Vector3(55.0, 0.0, 18.0)
	add_child(bat)
	var tween := create_tween()
	tween.tween_property(bat, "position", target + direction * 25.0 + Vector3.UP * 8.0, 0.22)
	tween.parallel().tween_property(bat, "rotation_degrees", Vector3(10.0, 0.0, 155.0), 0.22)
	tween.tween_callback(bat.queue_free)
