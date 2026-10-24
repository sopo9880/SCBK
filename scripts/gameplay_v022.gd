extends "res://scripts/game_ui_v021.gd"
## Gameplay v0.2.2: live terrain targeting, user-scaled nukes and map projection.
const MapProjection = preload("res://scripts/ground_map_projection.gd")

const NUKE_MIN := 40.0
const NUKE_MAX := 360.0
const NUKE_START := 160.0

var _map_projection: Node
var _current_region: Dictionary = {}
var _map_projected: Texture2D
var _projection_visible: bool = true
var _projection_label: Label
var _projection_button: Button
var _nuke_row: HBoxContainer
var _nuke_slider: HSlider
var _nuke_radius_label: Label
var _nuke_range: float = NUKE_START
var _nuke_preview: MeshInstance3D
var _preview_center: Vector3 = Vector3(INF, INF, INF)
var _preview_radius: float = -1.0

func _ready() -> void:
	super._ready()
	_map_projection = MapProjection.new()
	_map_projection.name = "MapProjection"
	add_child(_map_projection)
	_map_projection.projection_ready.connect(_on_projection_ready)
	_add_gameplay_controls()
	_build_aim_preview()
	_v2_fx.set_nuke_radius(_nuke_range)
	if not _current_region.is_empty():
		_project_current_region()

func _on_region_loaded(region: Dictionary, source: String) -> void:
	super._on_region_loaded(region, source)
	_current_region = region.duplicate(true)
	if _map_projection != null:
		_project_current_region()

func _load_training_block() -> void:
	_current_region.clear()
	_map_projected = null
	if _nuke_preview != null:
		_nuke_preview.visible = false
	super._load_training_block()
	if _projection_label != null:
		_projection_label.text = "Map © OpenStreetMap contributors (ODbL) | 가상 훈련 구역"

func _project_current_region() -> void:
	var bounds: Dictionary = _current_region.get("bounds", {})
	if not Mercator.validated(bounds):
		return
	_map_projection.build_projection(_current_region, _world.terrain_extent())

func _on_projection_ready(texture: Texture2D, description: String) -> void:
	_map_projected = texture
	if _projection_visible:
		_world.set_ground_projection(texture)
	if _projection_label != null:
		_projection_label.text = "© OpenStreetMap contributors (ODbL) · " + description
	_set_status("지형 지도 투영 완료. 지면에도 폭탄·운석·지진·핵폭탄을 사용할 수 있습니다.")

func _toggle_projection() -> void:
	_projection_visible = not _projection_visible
	_world.set_ground_projection(_map_projected if _projection_visible else null)
	if _projection_button != null:
		_projection_button.text = "지형 지도 [T]: 켜짐" if _projection_visible else "지형 지도 [T]: 꺼짐"
	_set_status("지형 지도 표시를 변경했습니다. 지도 데이터는 그대로 유지됩니다.")

func _add_gameplay_controls() -> void:
	_projection_button = _button(_world_body, "지형 지도 [T]: 켜짐", _toggle_projection)
	_projection_button.tooltip_text = "지도에서 이미 본 타일을 재사용하거나 OSM 도로·건물 데이터로 표면 지도를 만듭니다."
	var layer: CanvasLayer = get_node("HUD")
	_projection_label = _add_label(layer, "Map © OpenStreetMap contributors (ODbL)", 11, Color(0.95, 0.96, 0.94))
	_projection_label.anchor_top = 1.0
	_projection_label.anchor_bottom = 1.0
	_projection_label.offset_left = 14.0
	_projection_label.offset_right = 355.0
	_projection_label.offset_top = -26.0
	_projection_label.offset_bottom = -8.0
	_projection_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var dock: PanelContainer = layer.get_node("WeaponsDock")
	var stack: VBoxContainer = _tool_label.get_parent() as VBoxContainer
	_nuke_row = HBoxContainer.new()
	_nuke_row.name = "NukeRangeControls"
	_nuke_row.add_theme_constant_override("separation", 8)
	stack.add_child(_nuke_row)
	_nuke_radius_label = _add_label(_nuke_row, "핵폭탄 반경 160m", 13, COLOR_GOLD)
	_nuke_radius_label.custom_minimum_size = Vector2(140, 0)
	_nuke_slider = HSlider.new()
	_nuke_slider.name = "NukeRadius"
	_nuke_slider.min_value = NUKE_MIN
	_nuke_slider.max_value = NUKE_MAX
	_nuke_slider.step = 10.0
	_nuke_slider.value = _nuke_range
	_nuke_slider.custom_minimum_size = Vector2(210, 25)
	_nuke_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_nuke_slider.value_changed.connect(_set_nuke_radius)
	_nuke_row.add_child(_nuke_slider)
	for meters in [60, 160, 320]:
		_button(_nuke_row, "%dm" % meters, _set_nuke_radius.bind(float(meters)), 53)
	_nuke_row.visible = false
	dock.offset_top = -115.0

func _set_nuke_radius(metres: float) -> void:
	_nuke_range = clampf(metres, NUKE_MIN, NUKE_MAX)
	if _nuke_slider != null and not is_equal_approx(_nuke_slider.value, _nuke_range):
		_nuke_slider.set_value_no_signal(_nuke_range)
	if _nuke_radius_label != null:
		_nuke_radius_label.text = "핵폭탄 반경 %dm" % int(_nuke_range)
	if _v2_fx != null:
		_v2_fx.set_nuke_radius(_nuke_range)
	_preview_radius = -1.0

func _select_tool(index: int) -> void:
	super._select_tool(index)
	if _nuke_row != null:
		_nuke_row.visible = _active_tool == 5
		var dock: Control = get_node_or_null("HUD/WeaponsDock")
		if dock != null:
			dock.offset_top = -151.0 if _active_tool == 5 else -115.0
	if _nuke_preview != null:
		_nuke_preview.visible = _active_tool == 5

func _weapon_allows_ground(index: int) -> bool:
	# The bat is the only building/debris-only weapon.
	return index != 1

func _ground_ray(origin: Vector3, direction: Vector3) -> Dictionary:
	if direction.y >= -0.005:
		return {}
	var reach: float = (0.0 - origin.y) / direction.y
	if reach <= 0.0 or reach > 3500.0:
		return {}
	var world_pos: Vector3 = origin + direction * reach
	for iteration in range(3):
		if not _world.point_over_ground(world_pos):
			return {}
		var height: float = _world.terrain_height_at(world_pos.x, world_pos.z)
		reach = (height - origin.y) / direction.y
		if reach <= 0.0 or reach > 3500.0:
			return {}
		world_pos = origin + direction * reach
	if not _world.point_over_ground(world_pos):
		return {}
	return {"position": world_pos, "collider": _world.get_node("Terrain")}

func _aim_target(screen: Vector2, needs_building: bool = false) -> Dictionary:
	var hit: Dictionary = _v2_raycast(screen)
	if not hit.is_empty():
		var collider: Object = hit.get("collider", null)
		if needs_building:
			if collider != null and collider.has_meta("scbk_building"):
				return hit
			return {}
		var point: Vector3 = hit["position"]
		if _world.point_over_ground(point):
			point.y = _world.terrain_height_at(point.x, point.z)
			hit["position"] = point
		return hit
	if needs_building:
		return {}
	var from: Vector3 = _camera.project_ray_origin(screen)
	var heading: Vector3 = _camera.project_ray_normal(screen)
	return _ground_ray(from, heading)

func _pick_and_fire(screen: Vector2) -> void:
	if _v2_fx == null or _v2_fx.is_busy():
		return
	var ground_allowed: bool = _weapon_allows_ground(_active_tool)
	var hit: Dictionary = _aim_target(screen, not ground_allowed)
	if hit.is_empty():
		_set_status("배트는 건물에만 사용할 수 있습니다." if not ground_allowed else "맵 내부 지형이나 건물을 선택해 주세요.")
		return
	var point: Vector3 = hit["position"]
	var collider: Object = hit.get("collider", null)
	if collider is RigidBody3D and collider.has_meta("scbk_fragment"):
		var outcome: Dictionary = _world.strike_debris(collider, point, 20.0)
		_v2_award(_active_tool, outcome)
	var direction: Vector3 = -_camera.global_transform.basis.z
	_v2_fx.strike(_active_tool, point, direction)
	_v2_audio.weapon_sound(_active_tool)

func _v2_award(weapon: int, result: Dictionary) -> void:
	if weapon != 1 and int(result.get("buildings", 0)) == 0 and int(result.get("pieces", 0)) == 0:
		_set_status("지면 충격 완료. 주변 파괴 가능한 건물이 없거나 이미 파괴됐습니다.")
		return
	super._v2_award(weapon, result)

func _build_aim_preview() -> void:
	_nuke_preview = MeshInstance3D.new()
	_nuke_preview.name = "NukeRadiusPreview"
	_nuke_preview.visible = false
	_nuke_preview.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.71, 0.19, 0.95)
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_nuke_preview.material_override = mat
	add_child(_nuke_preview)

func _draw_ground_ring(center: Vector3, radius: float) -> void:
	var line := ImmediateMesh.new()
	line.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for i in range(97):
		var angle: float = TAU * float(i) / 96.0
		var x: float = center.x + cos(angle) * radius
		var z: float = center.z + sin(angle) * radius
		var y: float = _world.terrain_height_at(x, z) + 2.0
		line.surface_add_vertex(Vector3(x, y, z))
	line.surface_end()
	_nuke_preview.mesh = line
	_nuke_preview.visible = true
	_preview_center = center
	_preview_radius = radius

func _physics_process(_delta: float) -> void:
	if _nuke_preview == null:
		return
	if _active_tool != 5 or (_picker != null and _picker.visible) or (_v2_fx != null and _v2_fx.is_busy()):
		_nuke_preview.visible = false
		return
	var screen: Vector2 = get_viewport().get_mouse_position()
	if screen.x < 0.0 or screen.y < 0.0 or screen.x > get_viewport().get_visible_rect().size.x or screen.y > get_viewport().get_visible_rect().size.y:
		_nuke_preview.visible = false
		return
	var hit: Dictionary = _aim_target(screen)
	if hit.is_empty():
		_nuke_preview.visible = false
		return
	var at: Vector3 = hit["position"]
	if not _nuke_preview.visible or at.distance_to(_preview_center) > 1.5 or not is_equal_approx(_preview_radius, _nuke_range):
		_draw_ground_ring(at, _nuke_range)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_T:
		if _picker == null or not _picker.visible:
			_toggle_projection()
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseButton and event.pressed and event.shift_pressed and _active_tool == 5:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP or event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_set_nuke_radius(_nuke_range + (10.0 if event.button_index == MOUSE_BUTTON_WHEEL_UP else -10.0))
			get_viewport().set_input_as_handled()
			return
	super._unhandled_input(event)
