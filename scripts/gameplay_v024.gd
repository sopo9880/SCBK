extends "res://scripts/gameplay_v023.gd"
## Independent Godot gameplay parity: deeper ground, per-action rewind,
## varied buildings, night sky, camera presets and arcade debris bonuses.
## No reference game source/assets/UI layouts are copied.

const REWIND_SECONDS := 0.58

var _depth_panel: PanelContainer
var _depth_readout: Label
var _depth_progress: ProgressBar
var _rewind_caption: Label
var _rewinding: bool = false
var _rewind_generation: int = 0
var _stars: MultiMeshInstance3D
var _moon: MeshInstance3D
var _sound_toggle: Button
var _sound_on: bool = true
var _feedback_clock: float = 0.0
var _orbit_candidate: bool = false
var _orbit_moved: bool = false
var _orbit_begin: Vector2 = Vector2.ZERO

func _ready() -> void:
	super._ready()
	_install_depth_hud()
	_install_local_controls()
	_build_night_sky()
	_v2_fx.action_finished.connect(_finish_weapon_action)
	_refresh_depth_readout()
	_set_status("로컬 파괴 게임: 깊이 파기, 연속 되감기, 공중 콤보와 카메라 보기를 지원합니다.")

func _install_depth_hud() -> void:
	var layer: CanvasLayer = get_node("HUD")
	_depth_panel = PanelContainer.new()
	_depth_panel.name = "EarthDepthGauge"
	_depth_panel.anchor_top = 1.0
	_depth_panel.anchor_bottom = 1.0
	_depth_panel.offset_left = 18.0
	_depth_panel.offset_right = 309.0
	_depth_panel.offset_top = -122.0
	_depth_panel.offset_bottom = -18.0
	_depth_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_depth_panel.add_theme_stylebox_override("panel", _card_style())
	layer.add_child(_depth_panel)
	var margin := MarginContainer.new()
	for edge in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + edge, 10)
	_depth_panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 5)
	margin.add_child(column)
	_depth_readout = _add_label(column, "최대 게임 심도: 0 km · 지표", 13, COLOR_GOLD)
	_depth_readout.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_depth_progress = ProgressBar.new()
	_depth_progress.max_value = 6371.0
	_depth_progress.show_percentage = false
	_depth_progress.custom_minimum_size = Vector2(258.0, 12.0)
	_depth_progress.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(_depth_progress)
	var hint := _add_label(column, "G: 가장 깊은 구멍  ·  V: 위에서 보기", 11, COLOR_BLUE)
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rewind_caption = _add_label(layer, "되감는 중…", 28, COLOR_GOLD)
	_rewind_caption.anchor_left = 0.5
	_rewind_caption.anchor_right = 0.5
	_rewind_caption.anchor_top = 0.43
	_rewind_caption.anchor_bottom = 0.43
	_rewind_caption.offset_left = -175.0
	_rewind_caption.offset_right = 175.0
	_rewind_caption.offset_top = -36.0
	_rewind_caption.offset_bottom = 24.0
	_rewind_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_rewind_caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rewind_caption.visible = false

func _install_local_controls() -> void:
	var view_row := HBoxContainer.new()
	view_row.name = "LocalCameraControls"
	view_row.add_theme_constant_override("separation", 4)
	_world_body.add_child(view_row)
	_button(view_row, "처음 시점 [Home]", _home_view, 101)
	_button(view_row, "위에서 [V]", _overhead_view, 77)
	_button(view_row, "구멍 [G]", _focus_deepest, 65)
	var audio_row := HBoxContainer.new()
	audio_row.name = "LocalAudioControls"
	_world_body.add_child(audio_row)
	_sound_toggle = _button(audio_row, "소리 켜짐", _toggle_sound, 108)
	_button(audio_row, "되감기 [Ctrl+Z]", _undo, 130)
	_button(audio_row, "모두 복구 [R]", _reset, 116)
	var guide := _add_label(_world_body, "드래그: 회전 · 오른쪽 드래그: 이동 · 클릭: 공격", 11, COLOR_BLUE)
	guide.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

func _build_night_sky() -> void:
	# 120 small instances, not 120 draw calls or remote texture assets.
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 2.0
	mesh.radial_segments = 4
	mesh.rings = 2
	var white := StandardMaterial3D.new()
	white.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	white.albedo_color = Color(0.84, 0.90, 1.0)
	white.emission_enabled = true
	white.emission = Color(0.78, 0.87, 1.0)
	white.emission_energy_multiplier = 0.8
	mesh.material = white
	var many := MultiMesh.new()
	many.transform_format = MultiMesh.TRANSFORM_3D
	many.mesh = mesh
	many.instance_count = 120
	for i in range(120):
		var az: float = float(i) * 2.3999632
		var elevation: float = lerpf(0.16, 1.23, float(posmod(i * 47, 120)) / 119.0)
		var radius: float = 1400.0
		var position := Vector3(
			radius * cos(elevation) * cos(az),
			radius * sin(elevation),
			radius * cos(elevation) * sin(az))
		var size: float = 1.05 + float(posmod(i * 13, 7)) * 0.23
		many.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ONE * size), position))
	_stars = MultiMeshInstance3D.new()
	_stars.name = "NightStars"
	_stars.multimesh = many
	_stars.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_stars.visible = _v2_night
	add_child(_stars)
	_moon = MeshInstance3D.new()
	_moon.name = "NightMoon"
	var sphere := SphereMesh.new()
	sphere.radius = 29.0
	sphere.height = 58.0
	sphere.radial_segments = 18
	sphere.rings = 9
	_moon.mesh = sphere
	var moon_mat := StandardMaterial3D.new()
	moon_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	moon_mat.albedo_color = Color(0.90, 0.92, 0.88)
	moon_mat.emission_enabled = true
	moon_mat.emission = Color(0.71, 0.79, 0.98)
	moon_mat.emission_energy_multiplier = 0.60
	_moon.material_override = moon_mat
	_moon.position = Vector3(-760.0, 1070.0, -450.0)
	_moon.visible = _v2_night
	_moon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_moon)

func _v2_toggle_night() -> void:
	super._v2_toggle_night()
	if _stars != null:
		_stars.visible = _v2_night
	if _moon != null:
		_moon.visible = _v2_night

func _toggle_sound() -> void:
	_sound_on = not _sound_on
	if _v2_audio != null:
		_v2_audio.volume_db = -11.0 if _sound_on else -80.0
	if _sound_toggle != null:
		_sound_toggle.text = "소리 켜짐" if _sound_on else "소리 꺼짐"

func _home_view() -> void:
	_cinematic_mode = ""
	_camera.far = 3200.0
	_yaw = 0.6
	_pitch = -0.70
	_distance = clampf(maxf(_world.terrain_extent().x, _world.terrain_extent().y) * 0.72, 260.0, 1160.0)
	_camera_target = Vector3(0.0, 12.0, 0.0)
	_update_camera()

func _overhead_view() -> void:
	_cinematic_mode = ""
	_camera.far = 3200.0
	_pitch = -1.48
	_distance = clampf(maxf(_world.terrain_extent().x, _world.terrain_extent().y) * 0.80, 300.0, 1550.0)
	_camera_target = Vector3(0.0, 0.0, 0.0)
	_update_camera()

func _focus_deepest() -> void:
	var info: Dictionary = _world.earth_depth_info()
	if float(info.get("world_depth_m", 0.0)) <= 0.1:
		_set_status("아직 파인 구멍이 없습니다. 폭탄이나 레이저로 지면을 공격해 보세요.")
		return
	_cinematic_mode = ""
	_camera.far = 3200.0
	_camera_target = info["point"] + Vector3.UP * 4.0
	_yaw = 0.58
	_pitch = -1.13
	_distance = clampf(110.0 + float(info["world_depth_m"]) * 0.43, 90.0, 640.0)
	_update_camera()

func _refresh_depth_readout() -> void:
	if _depth_readout == null or _depth_progress == null or _world == null:
		return
	var depth: Dictionary = _world.earth_depth_info()
	var km: float = float(depth.get("virtual_depth_km", 0.0))
	_depth_readout.text = "최대 게임 심도 %.1f km  ·  %s" % [km, str(depth.get("layer", "지표"))]
	_depth_progress.value = km
	_depth_readout.tooltip_text = "지형 깊이를 게임 진행을 위해 압축한 값입니다. 실제 지구 내부를 정확한 축척으로 재현한 것은 아닙니다."

func _select_tool(index: int) -> void:
	_orbit_candidate = false
	super._select_tool(index)

func _pick_and_fire(screen: Vector2) -> void:
	if _rewinding or _v2_fx == null or _v2_fx.is_busy():
		return
	var airborne: bool = false
	var hit: Dictionary = _aim_target(screen)
	var target: Object = hit.get("collider", null)
	if target is RigidBody3D and target.has_meta("scbk_fragment"):
		var owner: Node3D = target.get_meta("scbk_building", null)
		if is_instance_valid(owner):
			airborne = target.global_position.y >= owner.global_position.y + owner.height_m * 0.43
	_world.begin_rewind_action(_v2_score.capture_score())
	super._pick_and_fire(screen)
	if airborne:
		var bonus: int = _v2_score.award_bonus("AIR COMBO", 420)
		_set_status("공중 콤보! +%d 점" % bonus)
	if not _v2_fx.is_busy():
		_world.commit_rewind_action()

func _v2_fire_laser(screen: Vector2) -> void:
	if _rewinding or _v2_fx == null or _v2_fx.is_busy():
		return
	_world.begin_rewind_action(_v2_score.capture_score())
	super._v2_fire_laser(screen)
	if not _v2_fx.is_busy():
		_world.commit_rewind_action()

func _finish_weapon_action(_weapon: int) -> void:
	_world.commit_rewind_action()
	_refresh_depth_readout()

func _undo() -> void:
	if _rewinding or _world == null:
		return
	if _v2_fx != null and _v2_fx.is_busy():
		_v2_fx.cancel_pending()
		_cinematic_mode = ""
		_camera.far = 3200.0
	_world.commit_rewind_action()
	if _world.rewind_action_count() <= 0:
		_set_status("되감을 파괴 기록이 없습니다.")
		return
	_rewinding = true
	_rewind_generation += 1
	var expected: int = _rewind_generation
	if _rewind_caption != null:
		_rewind_caption.visible = true
	var animation := create_tween()
	animation.tween_interval(REWIND_SECONDS)
	var animated: int = 0
	for building in _world.latest_rewind_buildings():
		var pieces: Array = building.get("_pieces")
		for node in pieces:
			if animated >= 48:
				break
			if node is RigidBody3D and is_instance_valid(node) and not node.is_queued_for_deletion():
				node.freeze = true
				var original: Vector3 = building.global_position + Vector3.UP * (building.height_m * 0.48)
				animation.parallel().tween_property(node, "global_position", original, REWIND_SECONDS).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
				animated += 1
		if animated >= 48:
			break
	await animation.finished
	if expected != _rewind_generation:
		return
	var result: Dictionary = _world.undo_rewind_action()
	_v2_score.restore_score(result.get("score", {}))
	_rewinding = false
	if _rewind_caption != null:
		_rewind_caption.visible = false
	_refresh_depth_readout()
	_set_status("되감기 완료: 건물 %d개와 해당 공격의 지형·점수를 복구했습니다." % int(result.get("buildings", 0)))

func _on_region_loaded(region: Dictionary, source: String) -> void:
	_rewind_generation += 1
	_rewinding = false
	super._on_region_loaded(region, source)
	if _world != null:
		_world.clear_rewind_history()
	if _rewind_caption != null:
		_rewind_caption.visible = false
	_refresh_depth_readout()

func _load_training_block() -> void:
	_rewind_generation += 1
	_rewinding = false
	super._load_training_block()
	if _world != null:
		_world.clear_rewind_history()
	if _rewind_caption != null:
		_rewind_caption.visible = false
	_refresh_depth_readout()

func _reset() -> void:
	_rewind_generation += 1
	_rewinding = false
	super._reset()
	_world.clear_rewind_history()
	if _rewind_caption != null:
		_rewind_caption.visible = false
	_refresh_depth_readout()

func _unhandled_input(event: InputEvent) -> void:
	if _picker != null and _picker.visible:
		super._unhandled_input(event)
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_HOME:
			_home_view()
			get_viewport().set_input_as_handled()
			return
		if event.keycode == KEY_V:
			_overhead_view()
			get_viewport().set_input_as_handled()
			return
		if event.keycode == KEY_G:
			_focus_deepest()
			get_viewport().set_input_as_handled()
			return
		if event.keycode == KEY_ESCAPE and _v2_fx != null and _v2_fx.is_busy():
			if _v2_fx.skip_cinematic():
				_cinematic_distance = _saved_distance
				_cinematic_mode = "back"
				get_viewport().set_input_as_handled()
				return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and _active_tool in [3, 5] and _v2_fx != null and _v2_fx.is_busy():
		if _v2_fx.skip_cinematic():
			_cinematic_distance = _saved_distance
			_cinematic_mode = "back"
			get_viewport().set_input_as_handled()
			return
	if _rewinding:
		get_viewport().set_input_as_handled()
		return
	# Match the reference game's practical desktop feel using independent
	# input logic: left-drag orbits, simple click attacks, right-drag pans.
	# Laser (weapon 3) reserves left-drag for drawing the beam trajectory.
	if event is InputEventMouseMotion:
		if _orbit_candidate and _active_tool != 2:
			if event.position.distance_to(_orbit_begin) > 5.5:
				_orbit_moved = true
			if _orbit_moved:
				_yaw -= event.relative.x * 0.006
				_pitch = clampf(_pitch - event.relative.y * 0.006, -1.47, -0.17)
				_update_camera()
			get_viewport().set_input_as_handled()
			return
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
			var right: Vector3 = _camera.global_transform.basis.x
			var front: Vector3 = _camera.global_transform.basis.z
			front.y = 0.0
			if front.length_squared() > 0.0001:
				_camera_target += (-right * event.relative.x + front.normalized() * event.relative.y) * (_distance / 900.0)
				_update_camera()
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and _active_tool != 2:
		if event.pressed:
			_orbit_candidate = true
			_orbit_moved = false
			_orbit_begin = event.position
			get_viewport().set_input_as_handled()
			return
		if _orbit_candidate:
			_orbit_candidate = false
			if not _orbit_moved:
				_pick_and_fire(event.position)
			get_viewport().set_input_as_handled()
			return
	super._unhandled_input(event)

func _process(delta: float) -> void:
	super._process(delta)
	_feedback_clock += delta
	if _feedback_clock < 0.32 or _world == null:
		return
	_feedback_clock = 0.0
	_refresh_depth_readout()
	if _rewinding or _v2_score == null:
		return
	for item in get_tree().get_nodes_in_group("scbk_debris"):
		if not item is RigidBody3D or not is_instance_valid(item):
			continue
		if item.has_meta("scbk_home_run") or not item.has_meta("scbk_building"):
			continue
		var owner: Node3D = item.get_meta("scbk_building")
		if not is_instance_valid(owner):
			continue
		if item.global_position.distance_to(owner.global_position) >= 70.0:
			item.set_meta("scbk_home_run", true)
			var bonus: int = _v2_score.award_bonus("HOME RUN", 700)
			_set_status("홈런! 멀리 날아간 파편 보너스 +%d" % bonus)
