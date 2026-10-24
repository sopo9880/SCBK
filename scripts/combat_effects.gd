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
var _nuke_radius: float = 160.0

func set_nuke_radius(metres: float) -> void:
	_nuke_radius = clampf(metres, 40.0, 360.0)

func get_nuke_radius() -> float:
	return _nuke_radius

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
	_active = true
	_epoch += 1
	var id: int = _epoch
	action_started.emit(WEAPON_BOMB)
	_bomb_sequence(target, id)

func _bomb_sequence(target: Vector3, id: int) -> void:
	_warning(target, 28.0, Color(1.0, 0.62, 0.17, 0.60), 0.63)
	var shell := MeshInstance3D.new()
	var body := CylinderMesh.new()
	body.top_radius = 1.1
	body.bottom_radius = 1.9
	body.height = 9.0
	shell.mesh = body
	var metal := StandardMaterial3D.new()
	metal.albedo_color = Color(0.21, 0.25, 0.24)
	metal.metallic = 0.65
	shell.material_override = metal
	shell.position = target + Vector3.UP * 110.0
	add_child(shell)
	var tween := create_tween()
	tween.tween_property(shell, "position", target + Vector3.UP * 1.0, 0.70).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	await tween.finished
	if id != _epoch:
		return
	shell.queue_free()
	_flash(target + Vector3.UP * 8.0, 13.0, Color(1.0, 0.75, 0.37, 0.55), 0.25)
	_shockwave(target, 45.0, Color(0.97, 0.61, 0.26, 0.48), 0.42)
	_burst_particles(target, 30.0, 25, 1.5, Color(0.34, 0.30, 0.26, 0.72), false)
	_burst_particles(target, 24.0, 18, 0.65, Color(1.0, 0.53, 0.20, 0.88), true)
	impact_triggered.emit(target, 38.0, 20.0, WEAPON_BOMB, 11, Vector3.UP * 0.40)
	terrain_struck.emit(target, 25.0, 5.0)
	_camera_blast(5.5, 0.35)
	_active = false
	action_finished.emit(WEAPON_BOMB)

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
	if nuclear:
		var warhead := CylinderMesh.new()
		warhead.top_radius = 2.0
		warhead.bottom_radius = 3.8
		warhead.height = 24.0
		projectile.mesh = warhead
	else:
		var rock := SphereMesh.new()
		rock.radius = 10.0
		rock.height = 20.0
		projectile.mesh = rock
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.42, 0.43, 0.41) if nuclear else Color(0.55, 0.24, 0.10)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.28, 0.08)
	mat.emission_energy_multiplier = 0.5 if nuclear else 2.0
	projectile.material_override = mat
	projectile.position = target + Vector3(0.0, 290.0 if nuclear else 200.0, 0.0)
	add_child(projectile)
	_warning(target, _nuke_radius if nuclear else 70.0, Color(1.0, 0.33, 0.19, 0.50), 1.65 if nuclear else 1.0)
	if not nuclear:
		_burst_particles(projectile.position, 9.0, 14, 0.8, Color(1.0, 0.42, 0.14, 0.60), true)
	var tween := create_tween()
	tween.tween_property(projectile, "position", target + Vector3(0, 7.0, 0), 1.8 if nuclear else 1.1).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	await tween.finished
	if id != _epoch:
		return
	projectile.queue_free()
	if nuclear:
		_detonate_nuke(target, id)
	else:
		_shockwave(target, 125.0, Color(1.0, 0.42, 0.12, 0.60), 0.72)
		_flash(target + Vector3.UP * 13.0, 19.0, Color(1.0, 0.78, 0.38, 0.42), 0.38)
		_burst_particles(target, 65.0, 42, 1.75, Color(0.30, 0.26, 0.23, 0.82), false)
		_burst_particles(target, 40.0, 28, 0.85, Color(1.0, 0.36, 0.10, 0.84), true)
		impact_triggered.emit(target, 84.0, 32.0, WEAPON_METEOR, 16, Vector3.DOWN)
		terrain_struck.emit(target, 58.0, 13.0)
		_camera_blast(13.0, 0.72)
		_active = false
		action_finished.emit(weapon)

func _detonate_nuke(target: Vector3, id: int) -> void:
	var radius: float = _nuke_radius
	Engine.time_scale = 0.52
	_flash(target + Vector3.UP * radius * 0.16, radius * 0.28, Color(1.0, 0.98, 0.88, 0.66), 0.32)
	_shockwave(target, radius, Color(1.0, 0.54, 0.25, 0.58), 1.8)
	_burst_particles(target, radius * 0.48, 70, 3.8, Color(0.36, 0.32, 0.28, 0.85), false)
	_burst_particles(target, radius * 0.30, 42, 1.05, Color(1.0, 0.44, 0.16, 0.90), true)
	# Mushroom stem/cap is assembled from multiple rolling smoke lobes rather
	# than a single expanding sphere; size follows the selected blast radius.
	for i in range(5):
		var rise: float = radius * (0.11 + float(i) * 0.12)
		_smoke_lobe(target + Vector3.UP * rise, radius * (0.09 + float(i) * 0.023), 2.2 + float(i) * 0.20)
	_smoke_lobe(target + Vector3.UP * radius * 0.78, radius * 0.33, 3.7)
	# A staged pressure wave releases nearby facades before further outward
	# sections; no large constant-radius instant white sphere.
	for fraction in [0.33, 0.66, 1.0]:
		if id != _epoch:
			return
		var reach: float = radius * float(fraction)
		impact_triggered.emit(target, reach, 26.0 + reach * 0.09, WEAPON_NUKE, 24, Vector3.UP * 0.6)
		if fraction == 0.33:
			terrain_struck.emit(target, radius * 0.52, clampf(radius * 0.12, 5.0, 37.0))
			_camera_blast(clampf(radius * 0.095, 7.0, 32.0), 1.2)
		await get_tree().create_timer(0.16, true, false, true).timeout
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
			terrain_struck.emit(target + wobble, 16.0, 1.3)
		await get_tree().create_timer(0.31).timeout
	if id == _epoch:
		_active = false
		action_finished.emit(WEAPON_QUAKE)

func _warning(point: Vector3, radius: float, tint: Color, seconds: float) -> void:
	var preview := MeshInstance3D.new()
	var mesh := TorusMesh.new()
	mesh.inner_radius = 0.965
	mesh.outer_radius = 1.0
	mesh.ring_segments = 54
	mesh.rings = 5
	preview.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = tint
	preview.material_override = mat
	preview.position = point + Vector3.UP * 1.8
	preview.scale = Vector3(radius * 0.85, 0.08, radius * 0.85)
	add_child(preview)
	var animation := create_tween()
	animation.tween_property(preview, "scale", Vector3(radius, 0.08, radius), seconds)
	animation.parallel().tween_property(mat, "albedo_color:a", 0.0, seconds)
	animation.tween_callback(preview.queue_free)

func _burst_particles(point: Vector3, spread_m: float, count: int, lifetime_seconds: float, tint: Color, sparks: bool) -> void:
	var particles := CPUParticles3D.new()
	particles.amount = clampi(count, 6, 100)
	particles.one_shot = true
	particles.explosiveness = 0.95
	particles.lifetime = lifetime_seconds
	particles.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	particles.emission_sphere_radius = maxf(1.0, spread_m * 0.08)
	particles.direction = Vector3.UP
	particles.spread = 90.0 if sparks else 64.0
	particles.initial_velocity_min = spread_m * 0.32
	particles.initial_velocity_max = spread_m * (1.05 if sparks else 0.52)
	particles.gravity = Vector3(0.0, -16.0 if sparks else -3.8, 0.0)
	particles.scale_amount_min = 0.7
	particles.scale_amount_max = 2.4 if sparks else 5.2
	particles.local_coords = false
	var pebble := SphereMesh.new()
	pebble.radius = 0.65 if sparks else 1.8
	pebble.height = 1.3 if sparks else 3.6
	pebble.radial_segments = 7
	pebble.rings = 4
	var dust := StandardMaterial3D.new()
	dust.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED if sparks else BaseMaterial3D.SHADING_MODE_PER_PIXEL
	dust.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dust.albedo_color = tint
	dust.cull_mode = BaseMaterial3D.CULL_DISABLED
	pebble.material = dust
	particles.mesh = pebble
	particles.position = point + Vector3.UP * 3.0
	add_child(particles)
	particles.finished.connect(particles.queue_free)
	particles.emitting = true

func _smoke_lobe(point: Vector3, width: float, duration: float) -> void:
	var lobe := MeshInstance3D.new()
	var plume := SphereMesh.new()
	plume.radius = 1.0
	plume.height = 2.0
	plume.radial_segments = 9
	plume.rings = 5
	lobe.mesh = plume
	var soot := StandardMaterial3D.new()
	soot.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	soot.albedo_color = Color(0.24, 0.24, 0.25, 0.56)
	soot.cull_mode = BaseMaterial3D.CULL_DISABLED
	lobe.material_override = soot
	lobe.position = point
	lobe.scale = Vector3(width, width * 0.40, width)
	add_child(lobe)
	var animation := create_tween()
	animation.tween_property(lobe, "scale", Vector3(width * 1.45, width * 0.75, width * 1.45), duration)
	animation.parallel().tween_property(soot, "albedo_color:a", 0.0, duration)
	animation.tween_callback(lobe.queue_free)

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
