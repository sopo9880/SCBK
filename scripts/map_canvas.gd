extends Control
## The native Godot canvas forwards drawing to the map picker controller.
var controller: Control

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	resized.connect(queue_redraw)

func _draw() -> void:
	if controller != null:
		controller.paint_map(self)
