extends "res://scripts/gameplay_v2.gd"
## SCBK v0.2.1 - actual-play-first UI and transparent map recovery.
## Replaces the old 350px debug sidebar with a compact collapsible world card
## and a bottom-centred weapon dock. All original map/game actions remain.

var _world_body: VBoxContainer
var _advanced_coordinates: VBoxContainer
var _map_collapse: Button
var _advanced_button: Button
var _map_retry: Button
var _map_cancel: Button
var _world_card: PanelContainer
var _map_state: String = "idle"
var _last_feedback: String = ""
var _suppress_feedback: bool = false

const KOREAN_TOOLS := ["폭탄", "배트", "레이저", "운석", "지진", "핵폭탄"]
const COLOR_GOLD := Color(1.0, 0.75, 0.42)
const COLOR_WHITE := Color(0.92, 0.95, 0.98)
const COLOR_BLUE := Color(0.61, 0.84, 0.96)

func _ready() -> void:
	super._ready()
	_maps.loading_started.connect(_on_map_loading_started)
	_maps.loading_progress.connect(_on_map_loading_progress)
	_maps.loading_cancelled.connect(_on_map_loading_cancelled)
	if _maps.is_busy():
		_on_map_loading_started(_maps.get_requested_region())
	else:
		_map_state = "ready"
		_update_map_buttons()
		if _world.source_label == "Fictional training data":
			_set_status("연습용 가상 맵입니다. '지도'에서 실제 장소를 선택하거나 캠퍼스를 다시 시도하세요.")
		else:
			_set_status("지도 준비 완료. 아래에서 무기를 선택하고 건물을 공격해 보세요.")

func _card_style() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.055, 0.078, 0.11, 0.90)
	box.border_color = Color(0.25, 0.38, 0.45, 0.80)
	box.border_width_left = 1
	box.border_width_top = 1
	box.border_width_right = 1
	box.border_width_bottom = 1
	box.corner_radius_top_left = 12
	box.corner_radius_top_right = 12
	box.corner_radius_bottom_left = 12
	box.corner_radius_bottom_right = 12
	box.shadow_color = Color(0.0, 0.0, 0.0, 0.22)
	box.shadow_size = 7
	return box

func _add_label(parent: Node, value: String, points: int = 13, tint: Color = COLOR_WHITE) -> Label:
	var node := Label.new()
	node.text = value
	node.add_theme_font_size_override("font_size", points)
	node.add_theme_color_override("font_color", tint)
	parent.add_child(node)
	return node

func _button(parent: Node, value: String, target: Callable, min_width: float = 0.0) -> Button:
	var button := Button.new()
	button.text = value
	button.custom_minimum_size = Vector2(min_width, 30.0)
	button.pressed.connect(target)
	parent.add_child(button)
	return button

func _make_interface() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	add_child(layer)
	_world_card = PanelContainer.new()
	_world_card.name = "WorldCard"
	_world_card.position = Vector2(16, 16)
	_world_card.custom_minimum_size = Vector2(300, 0)
	_world_card.mouse_filter = Control.MOUSE_FILTER_STOP
	_world_card.add_theme_stylebox_override("panel", _card_style())
	layer.add_child(_world_card)
	var margin := MarginContainer.new()
	for edge in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + edge, 11)
	_world_card.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 7)
	margin.add_child(column)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 7)
	column.add_child(header)
	var heading := _add_label(header, "SCBK", 21, COLOR_GOLD)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var open_map := _button(header, "지도  [M]", _open_map_picker, 84)
	open_map.tooltip_text = "전 세계 지도에서 실제 지역 선택"
	_map_collapse = _button(header, "접기", _toggle_world_card, 53)
	_world_body = VBoxContainer.new()
	_world_body.add_theme_constant_override("separation", 7)
	column.add_child(_world_body)
	_details_label = _add_label(_world_body, "연습용 지도로 시작합니다.", 13, COLOR_WHITE)
	_details_label.custom_minimum_size = Vector2(268, 0)
	_details_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_details_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_status_label = _add_label(_world_body, "", 12, COLOR_BLUE)
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.custom_minimum_size = Vector2(270, 0)
	var progress := HBoxContainer.new()
	progress.add_theme_constant_override("separation", 7)
	_world_body.add_child(progress)
	_map_cancel = _button(progress, "불러오기 취소", _cancel_map_loading, 126)
	_map_cancel.visible = false
	_map_retry = _button(progress, "지도 재시도", _retry_map_loading, 117)
	_map_retry.visible = false
	var quick := HBoxContainer.new()
	quick.add_theme_constant_override("separation", 6)
	_world_body.add_child(quick)
	var campus := _button(quick, "동아대 캠퍼스", _load_donga, 142)
	campus.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var practice := _button(quick, "연습 맵", _load_training_block, 108)
	practice.tooltip_text = "실제 동아대가 아닌 가상 건물 예시"
	_world_body.add_child(HSeparator.new())
	_advanced_button = _button(_world_body, "직접 좌표 입력  ▾", _toggle_coordinates)
	_advanced_coordinates = VBoxContainer.new()
	_advanced_coordinates.add_theme_constant_override("separation", 5)
	_advanced_coordinates.visible = false
	_world_body.add_child(_advanced_coordinates)
	var latlon := HBoxContainer.new()
	_advanced_coordinates.add_child(latlon)
	_lat_input = LineEdit.new()
	_lat_input.placeholder_text = "위도"
	_lat_input.text = str(DONGA_LAT)
	_lat_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	latlon.add_child(_lat_input)
	_lon_input = LineEdit.new()
	_lon_input.placeholder_text = "경도"
	_lon_input.text = str(DONGA_LON)
	_lon_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	latlon.add_child(_lon_input)
	var radius_box := HBoxContainer.new()
	_advanced_coordinates.add_child(radius_box)
	_radius_select = OptionButton.new()
	_radius_select.add_item("250 m", 250)
	_radius_select.add_item("450 m", 450)
	_radius_select.add_item("700 m", 700)
	_radius_select.select(1)
	_radius_select.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	radius_box.add_child(_radius_select)
	_button(radius_box, "이 지역 열기", _load_custom_region, 109)
	var tools_row := HBoxContainer.new()
	tools_row.add_theme_constant_override("separation", 6)
	_world_body.add_child(tools_row)
	_v2_night_button = _button(tools_row, "야간 모드  [N]", _v2_toggle_night)
	_v2_night_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_button(tools_row, "되돌리기", _undo, 66)
	_button(tools_row, "초기화", _reset, 56)
	_perf_label = _add_label(_world_body, "FPS --", 11, Color(0.62, 0.73, 0.78))
	var help := _add_label(_world_body, "마우스 오른쪽: 회전  |  휠: 확대/축소", 11, Color(0.56, 0.70, 0.75))
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

	# Combat is the primary interaction; dock weapon selection in the arena.
	var dock := PanelContainer.new()
	dock.name = "WeaponsDock"
	dock.anchor_left = 0.5
	dock.anchor_right = 0.5
	dock.anchor_top = 1.0
	dock.anchor_bottom = 1.0
	dock.offset_left = -404.0
	dock.offset_right = 404.0
	dock.offset_top = -115.0
	dock.offset_bottom = -12.0
	dock.add_theme_stylebox_override("panel", _card_style())
	layer.add_child(dock)
	var dock_margin := MarginContainer.new()
	for edge in ["left", "right", "top", "bottom"]:
		dock_margin.add_theme_constant_override("margin_" + edge, 10)
	dock.add_child(dock_margin)
	var dock_column := VBoxContainer.new()
	dock_column.add_theme_constant_override("separation", 6)
	dock_margin.add_child(dock_column)
	_tool_label = _add_label(dock_column, "무기 선택  ·  건물을 클릭하세요", 13, COLOR_GOLD)
	_tool_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var weapon_row := HBoxContainer.new()
	weapon_row.add_theme_constant_override("separation", 5)
	dock_column.add_child(weapon_row)
	_tool_buttons.clear()
	for index in range(KOREAN_TOOLS.size()):
		var number: int = index + 1
		var option := _button(weapon_row, "%d  %s" % [number, KOREAN_TOOLS[index]], _select_tool.bind(index), 124)
		option.custom_minimum_size.y = 48.0
		option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_tool_buttons.append(option)
	_select_tool(0)
	_picker = MapPicker.new()
	_picker.name = "WorldMapPicker"
	_picker.visible = false
	layer.add_child(_picker)
	_picker.area_chosen.connect(_on_map_area_chosen)
	_picker.dismissed.connect(func() -> void: _set_status("지도를 닫았습니다. 게임으로 돌아왔습니다."))

func _toggle_world_card() -> void:
	_world_body.visible = not _world_body.visible
	_map_collapse.text = "접기" if _world_body.visible else "펼치기"

func _toggle_coordinates() -> void:
	_advanced_coordinates.visible = not _advanced_coordinates.visible
	_advanced_button.text = "직접 좌표 입력  ▴" if _advanced_coordinates.visible else "직접 좌표 입력  ▾"

func _select_tool(index: int) -> void:
	_active_tool = clampi(index, 0, KOREAN_TOOLS.size() - 1)
	for i in range(_tool_buttons.size()):
		_tool_buttons[i].disabled = false
		_tool_buttons[i].modulate = COLOR_GOLD if i == _active_tool else COLOR_WHITE
	if _tool_label != null:
		_tool_label.text = "선택: %s  |  %s" % [
			KOREAN_TOOLS[_active_tool],
			"누르고 드래그해서 발사" if _active_tool == 2 else "화면을 클릭해 공격"
		]

func _build_v2_hud() -> void:
	var layer: CanvasLayer = get_node("HUD") as CanvasLayer
	var scoreboard := PanelContainer.new()
	scoreboard.name = "CombatScore"
	scoreboard.anchor_left = 1.0
	scoreboard.anchor_right = 1.0
	scoreboard.offset_left = -255.0
	scoreboard.offset_right = -16.0
	scoreboard.offset_top = 16.0
	scoreboard.offset_bottom = 93.0
	scoreboard.add_theme_stylebox_override("panel", _card_style())
	layer.add_child(scoreboard)
	var margin := MarginContainer.new()
	for edge in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + edge, 11)
	scoreboard.add_child(margin)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 5)
	margin.add_child(stack)
	_v2_score_label = _add_label(stack, "SCORE  0", 22, COLOR_GOLD)
	_v2_style_label = _add_label(stack, "STYLE D  ·  COMBO 0  ·  x1.0", 12, COLOR_BLUE)
	_v2_laser_line = Line2D.new()
	_v2_laser_line.width = 4.0
	_v2_laser_line.default_color = Color(0.14, 0.86, 1.0, 0.91)
	_v2_laser_line.z_index = 100
	_v2_laser_line.visible = false
	layer.add_child(_v2_laser_line)
	# Map overlay always wins mouse focus and z-order.
	layer.move_child(_picker, layer.get_child_count() - 1)

func _set_status(message: String) -> void:
	_last_feedback = message
	if _status_label != null:
		_status_label.text = message.left(135) + ("…" if message.length() > 135 else "")
		_status_label.tooltip_text = message

func _on_map_loading_started(region_label: String) -> void:
	_map_state = "loading"
	_set_status("실제 지도 다운로드 시작 · " + region_label)
	_update_map_buttons()

func _on_map_loading_progress(message: String, _attempt: int, _total: int) -> void:
	_map_state = "loading"
	_set_status(message)
	_update_map_buttons()

func _on_map_loading_cancelled() -> void:
	_map_state = "cancelled"
	_set_status("지도 불러오기를 취소했습니다. 현재 화면은 유지됩니다.")
	_update_map_buttons()

func _cancel_map_loading() -> void:
	_maps.cancel_load()

func _retry_map_loading() -> void:
	_maps.retry_last()

func _update_map_buttons() -> void:
	if _map_cancel != null:
		_map_cancel.visible = _map_state == "loading"
	if _map_retry != null:
		_map_retry.visible = _map_state == "failed" or _map_state == "cancelled"

func _on_region_loaded(region: Dictionary, source: String) -> void:
	super._on_region_loaded(region, source)
	var region_bounds: Dictionary = region.get("bounds", {})
	if Mercator.validated(region_bounds):
		var width: Vector2 = Mercator.meters(region_bounds)
		_distance = clampf(maxf(width.x, width.y) * 0.70, 180.0, 1100.0)
		_pitch = -0.68
		_camera_target = Vector3(0.0, 13.0, 0.0)
		_update_camera()
	_map_state = "ready"
	_update_map_buttons()
	if _details_label != null:
		var n: int = _world.buildings.size()
		_details_label.text = "%s  ·  건물 %d개" % [str(region.get("label", "지도")), n]
		_details_label.tooltip_text = "%s / %s" % [str(region.get("label", "지도")), source]
	if _world.buildings.is_empty():
		_set_status("선택한 영역에 등록된 건물이 없습니다. 지도에서 다른 장소를 선택해 주세요.")
	else:
		_set_status("실제 지역 %d개 건물을 표시했습니다. 무기를 선택해 공격해 보세요." % _world.buildings.size())

func _on_region_failed(message: String) -> void:
	# Failures are network errors, not evidence that the current demo map
	# downloaded incorrectly. Do not overwrite the current map identity.
	_map_state = "failed"
	_update_map_buttons()
	if _details_label != null and _world.source_label == "Fictional training data":
		_details_label.text = "현재: 가상 연습 맵  ·  실제 지도는 미로드"
	_set_status(message + "  ·  지도 재시도를 누르거나 지역을 바꿔 주세요.")

func _load_training_block() -> void:
	if _maps != null:
		_maps.cancel_load()
	super._load_training_block()
	# Bring the player close enough to actually see the training buildings.
	_distance = 290.0
	_pitch = -0.63
	_camera_target = Vector3(0.0, 13.0, 0.0)
	_update_camera()
	_map_state = "ready"
	_update_map_buttons()
	if _details_label != null:
		_details_label.text = "가상 연습 맵  ·  실제 지역이 아닙니다."
	_set_status("오프라인 연습 맵입니다. 실제 지역은 '지도'에서 선택할 수 있습니다.")

func _on_map_area_chosen(bounds: Dictionary, label: String) -> void:
	_set_status("선택한 지역의 건물·도로 데이터를 불러옵니다.")
	_maps.load_bounds(bounds, label)
