extends Node3D
## SCBK v0.1.0 - Windows-native, data-driven 3D destruction sandbox.
## The first scene is explicitly fictional. Live campus geography is fetched
## from OpenStreetMap on demand and cached for subsequent launches.

const WorldBuilder = preload("res://scripts/world_builder.gd")
const RegionLoader = preload("res://scripts/region_loader.gd")
const MapPicker = preload("res://scripts/map_picker.gd")
const DONGA_LAT := 35.11619
const DONGA_LON := 128.96733
const DONGA_RADIUS := 450
const TOOL_NAMES := ["BOMB", "BAT", "LASER", "METEOR", "QUAKE", "NUKE"]
const TOOL_RADII := [38.0, 5.0, 12.0, 85.0, 130.0, 210.0]
const TOOL_IMPULSES := [13.0, 25.0, 18.0, 24.0, 9.0, 32.0]

var _world: Node3D
var _maps: Node
var _picker: Control
var _last_map_lat: float = DONGA_LAT
var _last_map_lon: float = DONGA_LON
var _camera: Camera3D
var _camera_target: Vector3 = Vector3(0.0, 5.0, 0.0)
var _yaw: float = 0.6
var _pitch: float = -0.92
var _distance: float = 580.0
var _active_tool: int = 0
var _tool_buttons: Array[Button] = []
var _tool_label: Label
var _status_label: Label
var _details_label: Label
var _perf_label: Label
var _lat_input: LineEdit
var _lon_input: LineEdit
var _radius_select: OptionButton
var _fps_clock: float = 0.0

func _ready() -> void:
	_world = WorldBuilder.new()
	_world.name = "World"
	add_child(_world)
	_maps = RegionLoader.new()
	_maps.name = "MapService"
	add_child(_maps)
	_maps.region_loaded.connect(_on_region_loaded)
	_maps.region_failed.connect(_on_region_failed)
	_setup_lighting()
	_camera = Camera3D.new()
	_camera.name = "OrbitCamera"
	_camera.current = true
	_camera.near = 0.4
	_camera.far = 3200.0
	_camera.fov = 60.0
	add_child(_camera)
	_update_camera()
	_make_interface()
	_load_training_block()
	# A single cache-aware map request on startup; subsequent launches use disk.
	_load_donga()

func _setup_lighting() -> void:
	var ambient := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.55, 0.72, 0.89)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.79, 0.85, 0.94)
	environment.ambient_light_energy = 0.65
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	ambient.environment = environment
	add_child(ambient)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-53.0, -35.0, 0.0)
	sun.light_energy = 1.2
	sun.shadow_enabled = false
	add_child(sun)

func _update_camera() -> void:
	if _camera == null:
		return
	var horiz: float = cos(_pitch)
	var offset := Vector3(sin(_yaw) * horiz, -sin(_pitch), cos(_yaw) * horiz) * _distance
	_camera.global_position = _camera_target + offset
	_camera.look_at(_camera_target, Vector3.UP)

func _load_training_block() -> void:
	var raw: String = FileAccess.get_file_as_string("res://data/offline_demo.json")
	var data: Variant = JSON.parse_string(raw)
	if not data is Dictionary:
		_set_status("Offline demo file is damaged.")
		return
	_world.load_region(data, "Fictional training data")
	_details_label.text = "OFFLINE TRAINING BLOCK (fictional)\nNo connection needed."
	_camera_target = Vector3.ZERO
	_update_camera()
	_set_status("Training block ready. Left click to destroy.")

func _load_donga() -> void:
	_set_status("Loading Dong-A Seunghak via OpenStreetMap (or cache)...")
	_maps.load_region(DONGA_LAT, DONGA_LON, DONGA_RADIUS, "Dong-A University Seunghak Campus")

func _load_custom_region() -> void:
	if not _lat_input.text.is_valid_float() or not _lon_input.text.is_valid_float():
		_set_status("Enter valid numeric latitude and longitude.")
		return
	var lat: float = _lat_input.text.to_float()
	var lon: float = _lon_input.text.to_float()
	var radius: int = _radius_select.get_selected_id()
	_set_status("Loading %.5f, %.5f (radius %d m)..." % [lat, lon, radius])
	_maps.load_region(lat, lon, radius, "Custom map (%.5f, %.5f)" % [lat, lon])

func _on_region_loaded(region: Dictionary, source: String) -> void:
	_last_map_lat = float(region.get("center_lat", _last_map_lat))
	_last_map_lon = float(region.get("center_lon", _last_map_lon))
	var count: int = _world.load_region(region, source)
	_camera_target = Vector3(0.0, 8.0, 0.0)
	_distance = 580.0
	_update_camera()
	_details_label.text = "%s\n%d OSM buildings  |  %s" % [str(region.get("label", "Map")), count, source]
	var total: int = int(region.get("total_buildings", count))
	if count == 0:
		_set_status("No building footprints mapped in this area. Try a nearby location.")
	elif total > count:
		_set_status("Loaded %d/%d buildings (nearest first for performance). Heights may be estimated." % [count, total])
	else:
		_set_status("Real OSM footprints loaded. Building heights may be estimated.")

func _on_region_failed(message: String) -> void:
	_set_status(message)
	if _world.region_name.begins_with("OFFLINE"):
		_details_label.text = "OFFLINE TRAINING BLOCK (fictional)\nMap download failed; click CAMPUS to retry."

func _set_status(value: String) -> void:
	if _status_label != null:
		_status_label.text = value

func _make_interface() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	add_child(layer)
	var panel := PanelContainer.new()
	panel.position = Vector2(18.0, 18.0)
	panel.custom_minimum_size = Vector2(314.0, 0.0)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	layer.add_child(panel)
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 12)
	panel.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	margin.add_child(column)

	var title := Label.new()
	title.text = "SCBK  /  CAMPUS SMASH"
	title.add_theme_font_size_override("font_size", 21)
	column.add_child(title)
	_details_label = Label.new()
	_details_label.text = "Loading world..."
	_details_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_details_label.custom_minimum_size = Vector2(284, 52)
	column.add_child(_details_label)
	_make_separator(column)
	var campus_btn := Button.new()
	campus_btn.text = "LOAD DONG-A CAMPUS"
	campus_btn.pressed.connect(_load_donga)
	column.add_child(campus_btn)
	var map_btn := Button.new()
	map_btn.text = "OPEN WORLD MAP  /  SEARCH + DRAW"
	map_btn.pressed.connect(_open_map_picker)
	column.add_child(map_btn)
	var demo_btn := Button.new()
	demo_btn.text = "OFFLINE TRAINING BLOCK"
	demo_btn.pressed.connect(_load_training_block)
	column.add_child(demo_btn)
	_make_separator(column)
	var map_title := Label.new()
	map_title.text = "ANY REGION  /  coordinates"
	column.add_child(map_title)
	var lat_row := HBoxContainer.new()
	column.add_child(lat_row)
	_lat_input = LineEdit.new()
	_lat_input.placeholder_text = "Latitude"
	_lat_input.text = str(DONGA_LAT)
	_lat_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lat_row.add_child(_lat_input)
	_lon_input = LineEdit.new()
	_lon_input.placeholder_text = "Longitude"
	_lon_input.text = str(DONGA_LON)
	_lon_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lat_row.add_child(_lon_input)
	var radius_row := HBoxContainer.new()
	column.add_child(radius_row)
	_radius_select = OptionButton.new()
	_radius_select.add_item("250 m radius", 250)
	_radius_select.add_item("450 m radius", 450)
	_radius_select.add_item("700 m radius", 700)
	_radius_select.select(1)
	_radius_select.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	radius_row.add_child(_radius_select)
	var load_btn := Button.new()
	load_btn.text = "LOAD REGION"
	load_btn.pressed.connect(_load_custom_region)
	radius_row.add_child(load_btn)
	_make_separator(column)

	var tools_title := Label.new()
	tools_title.text = "DESTRUCTION TOOLS  /  keys 1–6"
	column.add_child(tools_title)
	for row_index in range(2):
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 3)
		column.add_child(row)
		for col_index in range(3):
			var index: int = row_index * 3 + col_index
			var tool := Button.new()
			tool.text = "%d %s" % [index + 1, TOOL_NAMES[index]]
			tool.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			tool.pressed.connect(_select_tool.bind(index))
			row.add_child(tool)
			_tool_buttons.append(tool)
	_tool_label = Label.new()
	column.add_child(_tool_label)
	var controls := HBoxContainer.new()
	column.add_child(controls)
	var undo_btn := Button.new()
	undo_btn.text = "UNDO  Ctrl+Z"
	undo_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	undo_btn.pressed.connect(_undo)
	controls.add_child(undo_btn)
	var reset_btn := Button.new()
	reset_btn.text = "RESET  R"
	reset_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	reset_btn.pressed.connect(_reset)
	controls.add_child(reset_btn)
	_make_separator(column)
	_status_label = Label.new()
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.custom_minimum_size = Vector2(284.0, 48.0)
	column.add_child(_status_label)
	_perf_label = Label.new()
	column.add_child(_perf_label)
	var instructions := Label.new()
	instructions.text = "LMB use tool  •  RMB drag orbit\nMMB drag pan  •  Wheel zoom\nMap data © OpenStreetMap (ODbL)"
	instructions.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(instructions)
	_select_tool(0)
	_picker = MapPicker.new()
	_picker.name = "WorldMapPicker"
	_picker.visible = false
	layer.add_child(_picker)
	_picker.area_chosen.connect(_on_map_area_chosen)
	_picker.dismissed.connect(func() -> void: _set_status("Map selector closed."))

func _make_separator(parent: VBoxContainer) -> void:
	var line := HSeparator.new()
	parent.add_child(line)

func _select_tool(index: int) -> void:
	_active_tool = clampi(index, 0, TOOL_NAMES.size() - 1)
	for i in range(_tool_buttons.size()):
		_tool_buttons[i].disabled = i == _active_tool
	if _tool_label != null:
		_tool_label.text = "Selected: %s  /  radius %.0f m" % [TOOL_NAMES[_active_tool], TOOL_RADII[_active_tool]]

func _unhandled_input(event: InputEvent) -> void:
	if _picker != null and _picker.visible:
		return
	if event is InputEventMouseMotion:
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
			_yaw -= event.relative.x * 0.006
			_pitch = clampf(_pitch - event.relative.y * 0.006, -1.47, -0.17)
			_update_camera()
			get_viewport().set_input_as_handled()
		elif Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
			var right: Vector3 = _camera.global_transform.basis.x
			var forward: Vector3 = _camera.global_transform.basis.z
			forward.y = 0.0
			_camera_target += (-right * event.relative.x + forward.normalized() * event.relative.y) * (_distance / 900.0)
			_update_camera()
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton:
		if event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_distance = clampf(_distance * 0.88, 25.0, 1900.0)
			_update_camera()
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_distance = clampf(_distance * 1.14, 25.0, 1900.0)
			_update_camera()
		elif event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			_pick_and_fire(event.position)
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode >= KEY_1 and event.keycode <= KEY_6:
			_select_tool(event.keycode - KEY_1)
		elif event.keycode == KEY_R:
			_reset()
		elif event.keycode == KEY_Z and event.ctrl_pressed:
			_undo()

func _open_map_picker() -> void:
	_picker.open_picker(_last_map_lat, _last_map_lon)
	_set_status("Use the world map to search and select an area.")

func _on_map_area_chosen(bounds: Dictionary, label: String) -> void:
	_set_status("Fetching selected map area, then building the 3D scene...")
	_maps.load_bounds(bounds, label)

func _pick_and_fire(screen: Vector2) -> void:
	var start: Vector3 = _camera.project_ray_origin(screen)
	var finish: Vector3 = start + _camera.project_ray_normal(screen) * 3500.0
	var query := PhysicsRayQueryParameters3D.create(start, finish)
	query.collision_mask = 1
	var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty():
		return
	var impact: Vector3 = hit["position"]
	var building: Node3D = null
	var body: Object = hit["collider"]
	if body.has_meta("scbk_building"):
		building = body.get_meta("scbk_building")
	_fire(impact, building)

func _fire(impact: Vector3, building: Node3D) -> void:
	var affected: Array[Node3D]
	match _active_tool:
		1:
			if building != null and not building.broken:
				affected = _world.strike_building(building, impact, TOOL_IMPULSES[1])
			else:
				affected = _world.strike_radius(impact, TOOL_RADII[1], TOOL_IMPULSES[1])
		_:
			affected = _world.strike_radius(impact, TOOL_RADII[_active_tool], TOOL_IMPULSES[_active_tool])
	if affected.size() > 0:
		_set_status("%s: %d building(s) destroyed." % [TOOL_NAMES[_active_tool], affected.size()])
	else:
		_set_status("No new buildings in the impact area.")
	_spawn_hit_effect(impact, TOOL_RADII[_active_tool])

func _spawn_hit_effect(impact: Vector3, radius: float) -> void:
	var burst := MeshInstance3D.new()
	var ball := SphereMesh.new()
	ball.radius = 1.0
	ball.height = 2.0
	burst.mesh = ball
	burst.position = impact
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.74, 0.30, 0.38)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	burst.material_override = mat
	add_child(burst)
	var tween := create_tween()
	tween.tween_property(burst, "scale", Vector3.ONE * maxf(2.0, radius * 0.45), 0.34)
	tween.tween_callback(burst.queue_free)

func _undo() -> void:
	var count: int = _world.undo_last()
	_set_status("Undo: restored %d building(s)." % count)

func _reset() -> void:
	_world.reset_all()
	_set_status("All buildings restored.")

func _process(delta: float) -> void:
	_fps_clock += delta
	if _fps_clock < 0.45:
		return
	_fps_clock = 0.0
	if _perf_label != null:
		_perf_label.text = "FPS %d  |  buildings %d/%d  |  debris %d/128" % [
			Engine.get_frames_per_second(),
			_world.destroyed_count(), _world.buildings.size(), _world.debris_count()
		]
