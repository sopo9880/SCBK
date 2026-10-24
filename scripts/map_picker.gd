extends Control
## Native Godot world-map selector: pan, zoom, click or drag a bounding box.
## Map imagery: OSM Standard tiles, cached for at least seven days.
## Geocoding: explicit Nominatim Search only (no autocomplete).
signal area_chosen(bounds: Dictionary, region_label: String)
signal dismissed

const Mercator = preload("res://scripts/map_math.gd")
const MapCanvas = preload("res://scripts/map_canvas.gd")
const TILE_DIR := "user://map_tiles"
const CACHE_SECONDS := 604800
const TILE_USER_AGENT := "SCBK-Windows/0.2.1 (https://github.com/sopo9880/SCBK)"
const TILE_HOST := "https://tile.openstreetmap.org"
const SEARCH_ENDPOINT := "https://nominatim.openstreetmap.org/search"
const MAX_TEXTURES := 70
const MAX_QUEUED := 25

var _center: Vector2 = Vector2(35.11619, 128.96733)
var _zoom: int = 16
var _mode_select: bool = true
var _dragging: bool = false
var _drag_origin: Vector2 = Vector2.ZERO
var _drag_current: Vector2 = Vector2.ZERO
var _selection_rect: Rect2 = Rect2()
var _selection: Dictionary = {}
var _canvas: Control
var _notice: Label
var _location: Label
var _search_input: LineEdit
var _results: OptionButton
var _search_button: Button
var _place_results: Array = []
var _radius: OptionButton
var _choose_button: Button
var _mode_button: Button
var _tile_http: HTTPRequest
var _search_http: HTTPRequest
var _textures: Dictionary = {}
var _queue: Array[Dictionary] = []
var _active_tile: Dictionary = {}
var _tile_inflight: bool = false
var _last_search_ms: int = -100000
var _last_pan_update: int = 0
var _tile_errors: int = 0
var _tile_warning: Label

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(TILE_DIR))
	_build_ui()
	_tile_http = HTTPRequest.new()
	_tile_http.timeout = 10.0
	add_child(_tile_http)
	_tile_http.request_completed.connect(_tile_done)
	_search_http = HTTPRequest.new()
	_search_http.timeout = 12.0
	add_child(_search_http)
	_search_http.request_completed.connect(_search_done)
	_refresh_tiles()
	_update_selection_status()

func open_picker(lat: float = 35.11619, lon: float = 128.96733) -> void:
	_center = Vector2(clampf(lat, -Mercator.MERCATOR_LIMIT, Mercator.MERCATOR_LIMIT), Mercator.wrap_longitude(lon))
	_selection.clear()
	_selection_rect = Rect2()
	_dragging = false
	visible = true
	_refresh_tiles()
	_update_selection_status()

func _build_ui() -> void:
	var shade := ColorRect.new()
	shade.color = Color(0.04, 0.07, 0.12, 0.94)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(shade)
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.offset_left = 26.0
	panel.offset_top = 18.0
	panel.offset_right = -26.0
	panel.offset_bottom = -18.0
	add_child(panel)
	var margins := MarginContainer.new()
	for edge in ["left", "right", "top", "bottom"]:
		margins.add_theme_constant_override("margin_" + edge, 12)
	panel.add_child(margins)
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 8)
	margins.add_child(vbox)
	var head := HBoxContainer.new()
	vbox.add_child(head)
	var title := Label.new()
	title.text = "SCBK  /  실제 장소 선택"
	title.add_theme_font_size_override("font_size", 20)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var close_btn := Button.new()
	close_btn.text = "게임으로 돌아가기  [ESC]"
	close_btn.pressed.connect(_close)
	head.add_child(close_btn)
	var search_bar := HBoxContainer.new()
	vbox.add_child(search_bar)
	_search_input = LineEdit.new()
	_search_input.placeholder_text = "장소 또는 주소 (부산, 서울, Tokyo 등)"
	_search_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_search_input.text_submitted.connect(_submit_search)
	search_bar.add_child(_search_input)
	_search_button = Button.new()
	_search_button.text = "검색"
	_search_button.pressed.connect(_search)
	search_bar.add_child(_search_button)
	_results = OptionButton.new()
	_results.visible = false
	_results.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_results.item_selected.connect(_choose_result)
	vbox.add_child(_results)
	var bar := HBoxContainer.new()
	vbox.add_child(bar)
	_mode_button = Button.new()
	_mode_button.text = "영역 선택 (클릭/드래그)"
	_mode_button.pressed.connect(_switch_mode)
	bar.add_child(_mode_button)
	var pan_button := Button.new()
	pan_button.text = "지도 이동"
	pan_button.pressed.connect(_set_pan_mode)
	bar.add_child(pan_button)
	var zoom_in := Button.new()
	zoom_in.text = "+"
	zoom_in.pressed.connect(func() -> void: _zoom_at(1))
	bar.add_child(zoom_in)
	var zoom_out := Button.new()
	zoom_out.text = "-"
	zoom_out.pressed.connect(func() -> void: _zoom_at(-1))
	bar.add_child(zoom_out)
	var radius_label := Label.new()
	radius_label.text = "클릭 반경:"
	bar.add_child(radius_label)
	_radius = OptionButton.new()
	_radius.add_item("250 m", 250)
	_radius.add_item("450 m", 450)
	_radius.add_item("700 m", 700)
	_radius.select(1)
	bar.add_child(_radius)
	_location = Label.new()
	_location.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_location.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	bar.add_child(_location)
	_canvas = MapCanvas.new()
	_canvas.controller = self
	_canvas.custom_minimum_size = Vector2(420, 280)
	_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_canvas.gui_input.connect(_map_input)
	_canvas.resized.connect(_refresh_tiles)
	vbox.add_child(_canvas)
	_tile_warning = Label.new()
	_tile_warning.visible = false
	_tile_warning.text = "지도 배경 타일 연결이 불안정합니다. 좌표 입력은 게임 화면에서도 가능합니다."
	_tile_warning.add_theme_color_override("font_color", Color(1.0, 0.73, 0.38))
	_tile_warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(_tile_warning)
	var actions := HBoxContainer.new()
	vbox.add_child(actions)
	_notice = Label.new()
	_notice.text = "지도를 확대하고 원하는 영역을 클릭하거나 드래그하세요."
	_notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_notice.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_child(_notice)
	_choose_button = Button.new()
	_choose_button.text = "선택 지역 3D 생성"
	_choose_button.disabled = true
	_choose_button.pressed.connect(_confirm)
	actions.add_child(_choose_button)
	var attribution := Label.new()
	attribution.text = "Map © OpenStreetMap contributors (ODbL)  |  Tiles © OpenStreetMap contributors  |  Search by Nominatim  |  selection limit 1.6 km per side"
	attribution.add_theme_font_size_override("font_size", 11)
	vbox.add_child(attribution)

func _set_pan_mode() -> void:
	_mode_select = false
	_mode_button.text = "지도 이동 (드래그)"

func _switch_mode() -> void:
	_mode_select = true
	_mode_button.text = "SELECT AREA (click / drag)"

func _close() -> void:
	visible = false
	dismissed.emit()

func _unhandled_key_input(event: InputEvent) -> void:
	if visible and event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		_close()
		get_viewport().set_input_as_handled()

func _map_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if not event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			if _dragging:
				_dragging = false
				if _mode_select:
					_commit_area(_drag_origin, event.position)
			_canvas.queue_redraw()
		elif event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			_dragging = true
			_drag_origin = event.position
			_drag_current = event.position
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom_at(1)
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom_at(-1)
	elif event is InputEventMouseMotion and _dragging:
		_drag_current = event.position
		if not _mode_select:
			_pan(event.relative)
		else:
			_canvas.queue_redraw()

func _pan(delta: Vector2) -> void:
	var center_px: Vector2 = Mercator.project(_center.x, _center.y, _zoom)
	var next: Vector2 = Mercator.unproject(center_px - delta, _zoom)
	_center = next
	_selection.clear()
	_selection_rect = Rect2()
	_choose_button.disabled = true
	_refresh_tiles()

func _zoom_at(direction: int) -> void:
	_zoom = clampi(_zoom + direction, 3, 18)
	_selection.clear()
	_selection_rect = Rect2()
	_choose_button.disabled = true
	_refresh_tiles()

func _commit_area(a: Vector2, b: Vector2) -> void:
	if (a - b).length() < 9.0:
		var center_px: Vector2 = Mercator.project(_center.x, _center.y, _zoom)
		var local_point: Vector2 = center_px + a - _canvas.size * 0.5
		var geo: Vector2 = Mercator.unproject(local_point, _zoom)
		_selection = Mercator.centered_bounds(geo.x, geo.y, float(_radius.get_selected_id()))
	else:
		_selection = Mercator.from_pixels(a, b, _center, _canvas.size, _zoom)
	_selection_rect = Rect2(a, b - a).abs()
	# A click represents a region rather than a 0x0 pixel square.
	if (a - b).length() < 9.0:
		var upper: Vector2 = Mercator.project(float(_selection["north"]), float(_selection["west"]), _zoom)
		var lower: Vector2 = Mercator.project(float(_selection["south"]), float(_selection["east"]), _zoom)
		var origin: Vector2 = Mercator.project(_center.x, _center.y, _zoom) - _canvas.size * 0.5
		_selection_rect = Rect2(upper - origin, lower - upper).abs()
	_update_selection_status()
	_canvas.queue_redraw()

func _update_selection_status() -> void:
	if _location != null:
		_location.text = "Lat %.4f  Lon %.4f  z%d" % [_center.x, _center.y, _zoom]
	if _notice == null:
		return
	if _selection.is_empty():
		_notice.text = "지역 선택: 클릭 또는 드래그 / 지도를 움직이려면 '지도 이동' 선택"
		_choose_button.disabled = true
		return
	var extent: Vector2 = Mercator.meters(_selection)
	if not Mercator.validated(_selection):
		_notice.text = "선택 영역 %.0f x %.0f m은 범위를 벗어났습니다 (한 변 50~1600 m)." % [extent.x, extent.y]
		_choose_button.disabled = true
		return
	_notice.text = "선택 영역 %.0f × %.0f m. '3D 생성'을 누르면 실제 건물을 가져옵니다." % [extent.x, extent.y]
	_choose_button.disabled = false

func _confirm() -> void:
	if Mercator.validated(_selection):
		var bounds: Dictionary = _selection.duplicate(true)
		var lat: float = (float(bounds["north"]) + float(bounds["south"])) * 0.5
		var lon: float = (float(bounds["east"]) + float(bounds["west"])) * 0.5
		var label: String = "Selected map (%.5f, %.5f)" % [lat, lon]
		visible = false
		area_chosen.emit(bounds, label)

func _submit_search(_text: String) -> void:
	_search()

func _search() -> void:
	var query: String = _search_input.text.strip_edges()
	if query.length() < 3:
		_notice.text = "장소 이름을 세 글자 이상 입력해 주세요."
		return
	if _search_http.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		_notice.text = "장소 검색 중입니다. 완료 후 다시 시도해 주세요."
		return
	var now: int = Time.get_ticks_msec()
	if now - _last_search_ms < 1100:
		_notice.text = "공공 지도 서버 이용 제한: 검색 간격은 1초 이상이어야 합니다."
		return
	_last_search_ms = now
	_results.clear()
	_results.visible = false
	_place_results.clear()
	_search_button.disabled = true
	_notice.text = "OpenStreetMap에서 장소 검색 중..."
	var url: String = SEARCH_ENDPOINT + "?format=jsonv2&limit=5&q=" + query.uri_encode()
	var headers := PackedStringArray(["User-Agent: " + TILE_USER_AGENT, "Accept: application/json"])
	var err: Error = _search_http.request(url, headers)
	if err != OK:
		_search_button.disabled = false
		_notice.text = "장소 검색을 시작하지 못했습니다."

func _search_done(result: int, status: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_search_button.disabled = false
	if result != HTTPRequest.RESULT_SUCCESS or status != 200:
		_notice.text = "장소 검색 서버에 연결하지 못했습니다. 지도를 움직이거나 직접 좌표를 입력해 주세요."
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if not parsed is Array:
		_notice.text = "지도 검색 응답 형식이 잘못됐습니다."
		return
	for p in parsed:
		if p is Dictionary and p.has("lat") and p.has("lon"):
			_place_results.append(p)
			_results.add_item(str(p.get("display_name", "Place")))
	if _place_results.is_empty():
		_notice.text = "검색 결과가 없습니다. 다른 이름으로 다시 검색하세요."
		return
	_results.visible = true
	_results.select(0)
	_choose_result(0)
	_notice.text = "%d개 장소를 찾았습니다. 선택 후 지도에서 영역을 지정하세요." % _place_results.size()

func _choose_result(index: int) -> void:
	if index < 0 or index >= _place_results.size():
		return
	var result: Dictionary = _place_results[index]
	_center = Vector2(float(result["lat"]), float(result["lon"]))
	_zoom = 16
	_selection.clear()
	_selection_rect = Rect2()
	_choose_button.disabled = true
	_refresh_tiles()

func _tile_key(z: int, x: int, y: int) -> String:
	return "%d/%d/%d" % [z, x, y]

func _tile_file(key: String) -> String:
	return TILE_DIR + "/" + key + ".png"

func _visible_tiles() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if _canvas == null or _canvas.size.x <= 0.0:
		return out
	var n: int = 1 << _zoom
	var center_px: Vector2 = Mercator.project(_center.x, _center.y, _zoom)
	var lo: Vector2 = center_px - _canvas.size * 0.5
	var hi: Vector2 = center_px + _canvas.size * 0.5
	for y in range(maxi(0, int(floor(lo.y / 256.0))), mini(n - 1, int(floor(hi.y / 256.0))) + 1):
		for world_x in range(int(floor(lo.x / 256.0)), int(floor(hi.x / 256.0)) + 1):
			var x: int = posmod(world_x, n)
			var key: String = _tile_key(_zoom, x, y)
			var pos: Vector2 = Vector2(float(world_x * 256), float(y * 256)) - lo
			out.append({"key": key, "x": x, "y": y, "z": _zoom, "pos": pos})
	return out

func _refresh_tiles() -> void:
	if _canvas == null:
		return
	if _textures.size() > MAX_TEXTURES:
		_textures.clear()
	_queue.clear()
	var tiles: Array[Dictionary] = _visible_tiles()
	var count: int = 0
	for tile in tiles:
		var key: String = tile["key"]
		if _textures.has(key):
			continue
		var path: String = _tile_file(key)
		var fresh: bool = false
		if FileAccess.file_exists(path):
			var age: int = int(Time.get_unix_time_from_system()) - int(FileAccess.get_modified_time(path))
			fresh = age < CACHE_SECONDS
			var img := Image.new()
			if img.load(path) == OK:
				_textures[key] = ImageTexture.create_from_image(img)
		if not fresh and count < MAX_QUEUED and _active_tile.get("key", "") != key:
			_queue.append(tile)
			count += 1
	_canvas.queue_redraw()
	_update_selection_status()
	_pump_tiles()

func _pump_tiles() -> void:
	if _tile_inflight or _queue.is_empty() or not visible:
		return
	_active_tile = _queue.pop_front()
	_tile_inflight = true
	var z: int = int(_active_tile["z"])
	var x: int = int(_active_tile["x"])
	var y: int = int(_active_tile["y"])
	var url: String = "%s/%d/%d/%d.png" % [TILE_HOST, z, x, y]
	var headers := PackedStringArray(["User-Agent: " + TILE_USER_AGENT, "Accept: image/png"])
	var err: Error = _tile_http.request(url, headers)
	if err != OK:
		_tile_inflight = false
		_active_tile.clear()

func _tile_done(result: int, response: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var key: String = str(_active_tile.get("key", ""))
	_tile_inflight = false
	_active_tile.clear()
	if result == HTTPRequest.RESULT_SUCCESS and response == 200 and body.size() > 100 and key != "":
		_tile_errors = 0
		if _tile_warning != null:
			_tile_warning.visible = false
		var image := Image.new()
		if image.load_png_from_buffer(body) == OK:
			_textures[key] = ImageTexture.create_from_image(image)
			var filename: String = _tile_file(key)
			DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(filename.get_base_dir()))
			var f := FileAccess.open(filename, FileAccess.WRITE)
			if f != null:
				f.store_buffer(body)
				f.close()
	else:
		_tile_errors += 1
		if _tile_errors >= 3 and _tile_warning != null:
			_tile_warning.visible = true
	if _canvas != null:
		_canvas.queue_redraw()
	# Throttle public OSM imagery; only tiles visible in the active viewport.
	if is_inside_tree():
		get_tree().create_timer(0.25).timeout.connect(_pump_tiles)

func paint_map(target: Control) -> void:
	target.draw_rect(Rect2(Vector2.ZERO, target.size), Color(0.14, 0.17, 0.21))
	for tile in _visible_tiles():
		var pos: Vector2 = tile["pos"]
		var rect := Rect2(pos, Vector2(256, 256))
		var key: String = tile["key"]
		if _textures.has(key):
			target.draw_texture_rect(_textures[key], rect, false)
		else:
			target.draw_rect(rect, Color(0.19, 0.23, 0.27), true)
			target.draw_rect(rect, Color(0.36, 0.42, 0.48), false, 1.0)
	if not _selection.is_empty():
		target.draw_rect(_selection_rect, Color(0.07, 0.73, 0.98, 0.21), true)
		target.draw_rect(_selection_rect, Color(0.05, 0.86, 1.0), false, 2.5)
	elif _dragging and _mode_select:
		var drag_rect := Rect2(_drag_origin, _drag_current - _drag_origin).abs()
		target.draw_rect(drag_rect, Color(0.0, 0.78, 1.0, 0.18), true)
		target.draw_rect(drag_rect, Color(0.0, 0.85, 1.0), false, 2.0)
	var midpoint: Vector2 = target.size * 0.5
	target.draw_line(midpoint - Vector2(9, 0), midpoint + Vector2(9, 0), Color(1.0, 0.31, 0.28), 1.5)
	target.draw_line(midpoint - Vector2(0, 9), midpoint + Vector2(0, 9), Color(1.0, 0.31, 0.28), 1.5)
