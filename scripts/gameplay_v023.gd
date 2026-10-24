extends "res://scripts/gameplay_v022.gd"
## SCBK 0.2.3: measured map progress, seismic scale, original-inspired
## path laser and single-player cinematic weapon tuning.

const GIANT_NUKE := 8000.0
const QUAKE_DEFAULT := 6.0
const BAT_DEFAULT := 1.0

var _loading_panel: PanelContainer
var _loading_stage: Label
var _loading_bar: ProgressBar
var _loading_indeterminate: bool = false
var _loading_phase_clock: float = 0.0
var _quake_row: HBoxContainer
var _quake_slider: HSlider
var _quake_caption: Label
var _quake_strength: float = QUAKE_DEFAULT
var _bat_row: HBoxContainer
var _bat_slider: HSlider
var _bat_caption: Label
var _bat_size: float = BAT_DEFAULT
var _cinematic_mode: String = ""
var _saved_distance: float = 0.0
var _cinematic_distance: float = 0.0
var _cinematic_original_far: float = 3200.0

func _ready() -> void:
	super._ready()
	_install_loading_meter()
	_install_weapon_options()
	_maps.load_stage.connect(_on_loader_stage)
	_world.world_build_progress.connect(_on_world_build_progress)
	_v2_fx.laser_ground_cut.connect(_on_laser_ground_cut)
	_v2_fx.seismic_wave.connect(_on_seismic_wave)
	_v2_fx.massive_impact.connect(_on_massive_impact)
	_v2_fx.action_started.connect(_on_cinematic_start)
	_v2_fx.action_finished.connect(_on_cinematic_end)
	_v2_fx.set_quake_magnitude(_quake_strength)
	_v2_fx.set_bat_scale(_bat_size)
	_cinematic_original_far = _camera.far
	if _maps.is_busy():
		_show_loader("지도 서버 응답 대기 · 진행률 측정 불가", 12.0, true)
	else:
		_hide_loader()

func _install_loading_meter() -> void:
	var layer: CanvasLayer = get_node("HUD")
	_loading_panel = PanelContainer.new()
	_loading_panel.name = "MapLoadingMeter"
	_loading_panel.anchor_left = 0.5
	_loading_panel.anchor_right = 0.5
	_loading_panel.offset_left = -220.0
	_loading_panel.offset_right = 220.0
	_loading_panel.offset_top = 12.0
	_loading_panel.offset_bottom = 77.0
	_loading_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_loading_panel.add_theme_stylebox_override("panel", _card_style())
	layer.add_child(_loading_panel)
	var margin := MarginContainer.new()
	for edge in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + edge, 8)
	_loading_panel.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	margin.add_child(box)
	_loading_stage = _add_label(box, "지도 서버 연결 중", 12, COLOR_WHITE)
	_loading_stage.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading_stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_loading_bar = ProgressBar.new()
	_loading_bar.name = "MapProgress"
	_loading_bar.min_value = 0.0
	_loading_bar.max_value = 100.0
	_loading_bar.value = 0.0
	_loading_bar.show_percentage = false
	_loading_bar.custom_minimum_size = Vector2(415, 13)
	_loading_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(_loading_bar)
	_loading_panel.visible = false

func _show_loader(message: String, percent: float, indeterminate: bool) -> void:
	if _loading_panel == null:
		return
	_loading_panel.visible = true
	_loading_indeterminate = indeterminate
	_loading_stage.text = message + ("  ·  응답 시간은 서버 상황에 따라 달라집니다" if indeterminate else " · %d%%" % int(round(percent)))
	_loading_bar.value = clampf(percent, 0.0, 100.0)

func _hide_loader() -> void:
	_loading_indeterminate = false
	if _loading_panel != null:
		_loading_panel.visible = false

func _on_map_loading_started(region_label: String) -> void:
	super._on_map_loading_started(region_label)
	_show_loader("지도 요청 · " + region_label.left(24), 0.0, false)

func _on_map_loading_cancelled() -> void:
	super._on_map_loading_cancelled()
	_hide_loader()

func _on_region_failed(message: String) -> void:
	super._on_region_failed(message)
	_hide_loader()

func _on_region_loaded(region: Dictionary, source: String) -> void:
	_cinematic_mode = ""
	super._on_region_loaded(region, source)
	if _camera != null:
		_camera.far = 3200.0
	_show_loader("실제 지역 3D 생성 완료", 100.0, false)
	_hide_loader()

func _load_training_block() -> void:
	super._load_training_block()
	_hide_loader()

func _on_loader_stage(fraction: float, description: String, indeterminate: bool) -> void:
	if _map_state == "cancelled" or _map_state == "failed":
		return
	if fraction >= 1.0:
		_hide_loader()
		return
	_show_loader(description, fraction * 100.0, indeterminate)

func _on_world_build_progress(phase: String, completed: float) -> void:
	# Loader parsed 68% of the pipeline. Counted building construction and
	# vegetation finish the measurable remaining 32%.
	_show_loader(phase, 68.0 + clampf(completed, 0.0, 1.0) * 31.0, false)

func _install_weapon_options() -> void:
	var dock: PanelContainer = get_node("HUD/WeaponsDock")
	var stack: VBoxContainer = _tool_label.get_parent() as VBoxContainer
	var large_nuke: Button = _button(_nuke_row, "8 km", _set_nuke_radius.bind(GIANT_NUKE), 58)
	large_nuke.tooltip_text = "특수 핵폭탄: 반경 8km. 현재 로드된 지역의 건물에 상세 판정 적용."
	_quake_row = HBoxContainer.new()
	_quake_row.name = "QuakeMagnitudeControls"
	_quake_row.add_theme_constant_override("separation", 8)
	stack.add_child(_quake_row)
	_quake_caption = _add_label(_quake_row, "지진 규모 6.0", 13, COLOR_GOLD)
	_quake_caption.custom_minimum_size = Vector2(104, 0)
	_quake_slider = HSlider.new()
	_quake_slider.name = "QuakeMagnitude"
	_quake_slider.min_value = 4.0
	_quake_slider.max_value = 10.0
	_quake_slider.step = 0.1
	_quake_slider.value = QUAKE_DEFAULT
	_quake_slider.custom_minimum_size = Vector2(140, 20)
	_quake_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_quake_slider.value_changed.connect(_set_quake_magnitude)
	_quake_row.add_child(_quake_slider)
	for level in [4.0, 6.0, 8.0, 10.0]:
		_button(_quake_row, "M%.0f" % level, _set_quake_magnitude.bind(level), 45)
	_quake_row.visible = false
	_bat_row = HBoxContainer.new()
	_bat_row.name = "BatSizeControls"
	_bat_row.add_theme_constant_override("separation", 8)
	stack.add_child(_bat_row)
	_bat_caption = _add_label(_bat_row, "배트 크기 x1.0", 13, COLOR_GOLD)
	_bat_caption.custom_minimum_size = Vector2(120, 0)
	_bat_slider = HSlider.new()
	_bat_slider.name = "BatSize"
	_bat_slider.min_value = 0.5
	_bat_slider.max_value = 3.0
	_bat_slider.step = 0.25
	_bat_slider.value = BAT_DEFAULT
	_bat_slider.custom_minimum_size = Vector2(135, 20)
	_bat_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_bat_slider.value_changed.connect(_set_bat_size)
	_bat_row.add_child(_bat_slider)
	for factor in [0.5, 1.0, 2.0, 3.0]:
		_button(_bat_row, "x%.1f" % factor, _set_bat_size.bind(factor), 45)
	_bat_row.visible = false
	dock.offset_top = -115.0
	_select_tool(_active_tool)

func _set_nuke_radius(metres: float) -> void:
	_nuke_range = GIANT_NUKE if metres >= GIANT_NUKE else clampf(metres, 40.0, 360.0)
	if _nuke_slider != null:
		_nuke_slider.set_value_no_signal(minf(_nuke_range, 360.0))
	if _nuke_radius_label != null:
		_nuke_radius_label.text = "핵폭탄 반경 8 km" if _nuke_range >= GIANT_NUKE else "핵폭탄 반경 %dm" % int(_nuke_range)
	if _v2_fx != null:
		_v2_fx.set_nuke_radius(_nuke_range)
	_preview_radius = -1.0
	if _nuke_range >= GIANT_NUKE:
		_set_status("8km 핵폭탄: 폭발 반경은 8km이지만 현재 로드된 3D 지도 내 건물만 파괴됩니다.")

func _set_quake_magnitude(magnitude: float) -> void:
	_quake_strength = clampf(magnitude, 4.0, 10.0)
	if _quake_slider != null:
		_quake_slider.set_value_no_signal(_quake_strength)
	if _quake_caption != null:
		_quake_caption.text = "지진 규모 %.1f" % _quake_strength
	if _v2_fx != null:
		_v2_fx.set_quake_magnitude(_quake_strength)

func _set_bat_size(factor: float) -> void:
	_bat_size = clampf(factor, 0.5, 3.0)
	if _bat_slider != null:
		_bat_slider.set_value_no_signal(_bat_size)
	if _bat_caption != null:
		_bat_caption.text = "배트 크기 x%.2f" % _bat_size
	if _v2_fx != null:
		_v2_fx.set_bat_scale(_bat_size)

func _select_tool(index: int) -> void:
	super._select_tool(index)
	if _quake_row != null:
		_quake_row.visible = _active_tool == 4
	if _bat_row != null:
		_bat_row.visible = _active_tool == 1
	var dock: Control = get_node_or_null("HUD/WeaponsDock")
	if dock != null:
		dock.offset_top = -151.0 if _active_tool in [1, 4, 5] else -115.0
	if _tool_label != null and _active_tool == 4:
		_tool_label.text = "지진 규모 %.1f  ·  클릭하면 약 3초 동안 흔들립니다" % _quake_strength
	if _tool_label != null and _active_tool == 5 and _nuke_range >= GIANT_NUKE:
		_tool_label.text = "초대형 핵폭탄 8 km  ·  로드된 영역의 모든 건물에 광역 효과"

func _on_laser_ground_cut(points: Array[Vector3], width: float, depth: float) -> void:
	_world.laser_cut(points, width, depth)

func _on_seismic_wave(point: Vector3, magnitude: float, beat: int) -> void:
	var outcome: Dictionary = _world.quake_pulse(point, magnitude, beat)
	_v2_award(4, outcome)

func _on_massive_impact(point: Vector3, radius: float, impulse: float) -> void:
	var outcome: Dictionary = _world.massive_blast(point, radius, impulse)
	# Spawn only a few bounded rubble-cloud cues; far buildings collapse
	# visually without each requiring its own physical debris simulation.
	var sites: PackedVector3Array = outcome.get("visual_sites", PackedVector3Array())
	for site in sites:
		_v2_fx.dust_column_at(site)
	_v2_award(5, outcome)

func _v2_fire_laser(screen: Vector2) -> void:
	if _v2_fx == null or _v2_fx.is_busy():
		_v2_screen_points.clear()
		return
	if _v2_screen_points.is_empty():
		_v2_screen_points.append(screen)
	_v2_screen_points.append(screen)
	var chosen: Array[Vector3] = []
	var stride: int = maxi(1, int(ceil(float(_v2_screen_points.size()) / 45.0)))
	for i in range(0, _v2_screen_points.size(), stride):
		var hit: Dictionary = _aim_target(_v2_screen_points[i])
		if hit.is_empty():
			continue
		var point: Vector3 = hit["position"]
		if not chosen.is_empty():
			var old: Vector3 = chosen.back()
			var distance: float = old.distance_to(point)
			var steps: int = clampi(int(ceil(distance / 10.0)), 1, 12)
			for n in range(1, steps + 1):
				if chosen.size() >= 96:
					break
				chosen.append(old.lerp(point, float(n) / float(steps)))
		else:
			chosen.append(point)
		if chosen.size() >= 96:
			break
	_v2_screen_points.clear()
	if chosen.is_empty():
		_set_status("레이저 경로가 지형이나 건물에 닿지 않았습니다.")
		return
	_v2_fx.laser_stroke(chosen)
	_v2_audio.weapon_sound(2)

func _on_cinematic_start(weapon: int) -> void:
	# Staged quakes and the six nuke blast waves are one undo transaction.
	if weapon == 4 or (weapon == 5 and _nuke_range >= GIANT_NUKE):
		_world.begin_massive_blast()
	if weapon != 3 and weapon != 5:
		return
	_saved_distance = _distance
	_cinematic_original_far = _camera.far
	_camera.far = 20000.0
	_cinematic_distance = maxf(_distance, 1100.0 if weapon == 3 else (3400.0 if _nuke_range >= GIANT_NUKE else _nuke_range * 2.3))
	_cinematic_mode = "out"

func _on_cinematic_end(weapon: int) -> void:
	if weapon != 3 and weapon != 5:
		return
	_cinematic_distance = _saved_distance
	_cinematic_mode = "back"

func _load_training_block() -> void:
	_cinematic_mode = ""
	super._load_training_block()
	if _camera != null:
		_camera.far = 3200.0

func _reset() -> void:
	_cinematic_mode = ""
	super._reset()
	if _camera != null:
		_camera.far = 3200.0

func _process(delta: float) -> void:
	if _loading_indeterminate and _loading_bar != null:
		_loading_phase_clock = fposmod(_loading_phase_clock + delta * 0.45, 1.0)
		# Animated activity, not a claimed network-download percentage.
		_loading_bar.value = 15.0 + 70.0 * absf(sin(_loading_phase_clock * PI))
	if _cinematic_mode != "":
		_distance = lerpf(_distance, _cinematic_distance, clampf(delta * 2.0, 0.0, 1.0))
		_update_camera()
		if _cinematic_mode == "back" and absf(_distance - _cinematic_distance) < 3.0:
			_distance = _cinematic_distance
			_cinematic_mode = ""
			_camera.far = _cinematic_original_far
	super._process(delta)
