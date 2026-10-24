extends "res://scripts/main.gd"
## SCBK v0.2.0 Windows gameplay layer.
## Keeps the v0.1.0 map picker and coordinates UI while replacing weapon
## interactions with distinct cinematics, actual DEM and arcade feedback.

const Effects = preload("res://scripts/combat_effects.gd")
const Elevation = preload("res://scripts/elevation_loader.gd")
const Score = preload("res://scripts/score_system.gd")
const Synth = preload("res://scripts/synth_sfx.gd")
const Mercator = preload("res://scripts/map_math.gd")

var _v2_fx: Node3D
var _v2_dem: Node
var _v2_score: Node
var _v2_audio: AudioStreamPlayer
var _v2_environment: Environment
var _v2_sun: DirectionalLight3D
var _v2_night: bool = false
var _v2_score_label: Label
var _v2_style_label: Label
var _v2_night_button: Button
var _v2_laser_line: Line2D
var _v2_dragging: bool = false
var _v2_screen_points: Array[Vector2] = []
var _v2_shake_left: float = 0.0
var _v2_shake_power: float = 0.0

func _ready() -> void:
	super._ready()
	_v2_fx = Effects.new()
	_v2_fx.name = "CinematicWeapons"
	add_child(_v2_fx)
	_v2_fx.impact_triggered.connect(_on_v2_weapon_impact)
	_v2_fx.terrain_struck.connect(_on_v2_crater)
	_v2_fx.camera_kicked.connect(_on_v2_camera_shake)
	_v2_dem = Elevation.new()
	_v2_dem.name = "RealTerrainService"
	add_child(_v2_dem)
	_v2_dem.elevation_ready.connect(_on_v2_dem_ready)
	_v2_dem.elevation_failed.connect(_on_v2_dem_failed)
	_v2_score = Score.new()
	add_child(_v2_score)
	_v2_score.updated.connect(_on_v2_score_updated)
	_v2_audio = Synth.new()
	add_child(_v2_audio)
	for item in get_children():
		if item is WorldEnvironment:
			_v2_environment = item.environment
		elif item is DirectionalLight3D:
			_v2_sun = item
	if _v2_sun != null:
		_v2_sun.shadow_enabled = true
	_build_v2_hud()
	var current_bounds: Dictionary = _world.region_bounds
	if Mercator.validated(current_bounds):
		_v2_dem.load_bounds(current_bounds)
	_v2_score.reset()
	_set_status("SCBK v0.2.0 preview: partial destruction, cinematic tools, DEM terrain.")

func _build_v2_hud() -> void:
	var layer: CanvasLayer = get_node("HUD") as CanvasLayer
	var score_panel := PanelContainer.new()
	score_panel.name = "ArcadeScore"
	score_panel.anchor_left = 1.0
	score_panel.anchor_right = 1.0
	score_panel.offset_left = -310.0
	score_panel.offset_right = -18.0
	score_panel.offset_top = 16.0
	score_panel.offset_bottom = 108.0
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.084, 0.122, 0.91)
	style.border_color = Color(0.34, 0.53, 0.59)
	style.border_width_left = 1
	style.border_width_right = 1
	style.border_width_top = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = 12
	style.corner_radius_top_right = 12
	style.corner_radius_bottom_left = 12
	style.corner_radius_bottom_right = 12
	score_panel.add_theme_stylebox_override("panel", style)
	layer.add_child(score_panel)
	var margins := MarginContainer.new()
	for key in ["left", "right", "top", "bottom"]:
		margins.add_theme_constant_override("margin_" + key, 10)
	score_panel.add_child(margins)
	var vbox := VBoxContainer.new()
	margins.add_child(vbox)
	_v2_score_label = Label.new()
	_v2_score_label.text = "SCORE 000000"
	_v2_score_label.add_theme_font_size_override("font_size", 24)
	_v2_score_label.add_theme_color_override("font_color", Color(1.0, 0.77, 0.43))
	vbox.add_child(_v2_score_label)
	_v2_style_label = Label.new()
	_v2_style_label.text = "STYLE D  |  COMBO 0  |  x1.0"
	_v2_style_label.add_theme_color_override("font_color", Color(0.63, 0.88, 1.0))
	vbox.add_child(_v2_style_label)
	var hud_panel: PanelContainer = layer.get_child(0) as PanelContainer
	var column: VBoxContainer = hud_panel.get_child(0).get_child(0) as VBoxContainer
	_v2_night_button = Button.new()
	_v2_night_button.text = "N  NIGHT MODE  /  M  WORLD MAP"
	_v2_night_button.pressed.connect(_v2_toggle_night)
	column.add_child(_v2_night_button)
	var hint := Label.new()
	hint.text = "LASER = drag to draw beam; 1–6 weapons"
	hint.add_theme_color_override("font_color", Color(0.57, 0.80, 0.91))
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(hint)
	_v2_laser_line = Line2D.new()
	_v2_laser_line.width = 4.0
	_v2_laser_line.default_color = Color(0.11, 0.84, 1.0, 0.90)
	_v2_laser_line.z_index = 100
	_v2_laser_line.visible = false
	layer.add_child(_v2_laser_line)
	# Keep the map picker above score/UI and laser aim overlay when open.
	layer.move_child(_picker, layer.get_child_count() - 1)

func _on_region_loaded(region: Dictionary, source: String) -> void:
	super._on_region_loaded(region, source)
	if _v2_fx == null:
		return
	_v2_fx.cancel_pending()
	_v2_score.reset()
	_v2_dem.cancel_pending()
	var bounds: Dictionary = region.get("bounds", {})
	if Mercator.validated(bounds):
		_v2_dem.load_bounds(bounds)
		_set_status("Loading real terrain elevation for " + str(region.get("label", "map")) + "...")

func _load_training_block() -> void:
	super._load_training_block()
	if _v2_fx != null:
		_v2_fx.cancel_pending()
	if _v2_dem != null:
		_v2_dem.cancel_pending()
	if _v2_score != null:
		_v2_score.reset()

func _on_v2_dem_ready(bounds: Dictionary, grid: PackedFloat32Array, width: int, depth: int) -> void:
	if _world.region_bounds != bounds:
		return
	_world.apply_dem(grid, width, depth)
	_set_status("Real terrain elevation applied. Craters are now deformable.")

func _on_v2_dem_failed(message: String) -> void:
	if not _world.has_dem():
		_set_status("Real terrain unavailable: " + message + " (flat fallback).")

func _on_v2_weapon_impact(point: Vector3, radius: float, impulse: float, weapon: int, per_building: int, direction: Vector3) -> void:
	var result: Dictionary = _world.strike_radius(point, radius, impulse, direction, per_building)
	_v2_award(weapon, result)

func _on_v2_crater(point: Vector3, radius: float, depth: float) -> void:
	_world.crater_at(point, radius, depth)

func _on_v2_camera_shake(power: float, seconds: float) -> void:
	_v2_shake_power = maxf(_v2_shake_power, power)
	_v2_shake_left = maxf(_v2_shake_left, seconds)

func _on_v2_score_updated(points: int, combo_multiplier: float, style: String, combo: int) -> void:
	if _v2_score_label != null:
		_v2_score_label.text = "SCORE  %s" % str(points)
	if _v2_style_label != null:
		_v2_style_label.text = "STYLE %s  |  COMBO %d  |  x%.1f" % [style, combo, combo_multiplier]

func _v2_award(weapon: int, result: Dictionary) -> void:
	var pieces: int = int(result.get("pieces", 0))
	var hit_buildings: int = int(result.get("buildings", 0))
	var gained: int = _v2_score.add_hit(weapon, hit_buildings, pieces)
	if gained > 0:
		_set_status("%s  •  %d chunks  •  +%d score" % [TOOL_NAMES[weapon], pieces, gained])
	elif hit_buildings <= 0:
		_set_status("No intact section in range. Aim at a different floor.")

func _pick_and_fire(screen: Vector2) -> void:
	if _v2_fx == null or _v2_fx.is_busy():
		return
	var hit: Dictionary = _v2_raycast(screen)
	if hit.is_empty():
		return
	var impact: Vector3 = hit["position"]
	var collider: Object = hit["collider"]
	if collider is RigidBody3D and collider.has_meta("scbk_fragment"):
		var outcome: Dictionary = _world.strike_debris(collider, impact, 20.0)
		_v2_award(_active_tool, outcome)
	var view_dir: Vector3 = -_camera.global_transform.basis.z
	_v2_fx.strike(_active_tool, impact, view_dir)
	_v2_audio.weapon_sound(_active_tool)

func _v2_raycast(screen: Vector2) -> Dictionary:
	var start: Vector3 = _camera.project_ray_origin(screen)
	var finish: Vector3 = start + _camera.project_ray_normal(screen) * 3500.0
	var query := PhysicsRayQueryParameters3D.create(start, finish)
	query.collision_mask = 3
	return get_world_3d().direct_space_state.intersect_ray(query)

func _v2_fire_laser(screen: Vector2) -> void:
	if _v2_fx == null or _v2_fx.is_busy():
		_v2_screen_points.clear()
		return
	if _v2_screen_points.is_empty():
		_v2_screen_points.append(screen)
	_v2_screen_points.append(screen)
	var chosen: Array[Vector3] = []
	var stride: int = maxi(1, int(ceil(float(_v2_screen_points.size()) / 15.0)))
	for i in range(0, _v2_screen_points.size(), stride):
		var ray_hit: Dictionary = _v2_raycast(_v2_screen_points[i])
		if ray_hit.is_empty():
			continue
		var target: Vector3 = ray_hit["position"]
		if chosen.is_empty() or chosen.back().distance_to(target) >= 5.0:
			chosen.append(target)
	_v2_screen_points.clear()
	if chosen.is_empty():
		_set_status("Laser missed. Drag across buildings or ground.")
	else:
		_v2_fx.laser_stroke(chosen)
		_v2_audio.weapon_sound(2)

func _unhandled_input(event: InputEvent) -> void:
	if _picker != null and _picker.visible:
		return
	if event is InputEventMouseMotion and _v2_dragging:
		if _v2_screen_points.is_empty() or _v2_screen_points.back().distance_to(event.position) >= 9.0:
			_v2_screen_points.append(event.position)
			if _v2_screen_points.size() > 180:
				_v2_screen_points.remove_at(0)
			_v2_laser_line.points = PackedVector2Array(_v2_screen_points)
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed and _active_tool == 2:
			_v2_dragging = true
			_v2_screen_points = [event.position]
			_v2_laser_line.points = PackedVector2Array(_v2_screen_points)
			_v2_laser_line.visible = true
			return
		if not event.pressed and _v2_dragging:
			_v2_dragging = false
			_v2_laser_line.visible = false
			_v2_fire_laser(event.position)
			return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_N:
			_v2_toggle_night()
			return
		if event.keycode == KEY_M:
			_open_map_picker()
			return
		if event.keycode == KEY_ESCAPE and _v2_dragging:
			_v2_dragging = false
			_v2_laser_line.visible = false
			return
	super._unhandled_input(event)

func _v2_toggle_night() -> void:
	_v2_night = not _v2_night
	_world.set_night(_v2_night)
	_v2_fx.set_night(_v2_night)
	if _v2_environment != null:
		_v2_environment.background_color = Color(0.016, 0.032, 0.07) if _v2_night else Color(0.55, 0.72, 0.89)
		_v2_environment.ambient_light_color = Color(0.13, 0.21, 0.32) if _v2_night else Color(0.79, 0.85, 0.94)
		_v2_environment.ambient_light_energy = 0.23 if _v2_night else 0.65
	if _v2_sun != null:
		_v2_sun.light_energy = 0.22 if _v2_night else 1.2
	if _v2_night_button != null:
		_v2_night_button.text = "N  DAY MODE  /  M  WORLD MAP" if _v2_night else "N  NIGHT MODE  /  M  WORLD MAP"

func _undo() -> void:
	super._undo()
	_set_status("Last damaged building group restored. Score remains unchanged.")

func _reset() -> void:
	if _v2_fx != null:
		_v2_fx.cancel_pending()
	super._reset()
	if _v2_score != null:
		_v2_score.reset()

func _process(delta: float) -> void:
	super._process(delta)
	if _v2_shake_left > 0.0:
		_v2_shake_left = maxf(0.0, _v2_shake_left - delta)
		_update_camera()
		_camera.global_position += Vector3(
			randf_range(-1.0, 1.0),
			randf_range(-0.5, 0.5),
			randf_range(-1.0, 1.0)) * _v2_shake_power * minf(1.0, _v2_shake_left / 0.3)
	elif _v2_shake_power > 0.0:
		_v2_shake_power = 0.0
		_update_camera()
	if _perf_label != null:
		_perf_label.text = "FPS %d  |  collapsed %d/%d  |  fragments %d/160" % [
			Engine.get_frames_per_second(),
			_world.destroyed_count(), _world.buildings.size(),
			_world.debris_count()
		]
