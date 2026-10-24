extends AudioStreamPlayer
## Short procedurally synthesized weapon sounds, no downloadable sound assets.
const MIX_RATE := 22050
var _last_time: int = -100000

func _ready() -> void:
	volume_db = -11.0

func weapon_sound(weapon: int) -> void:
	var now: int = Time.get_ticks_msec()
	if now - _last_time < 115:
		return
	_last_time = now
	var duration: float = 0.30
	if weapon == 2:
		duration = 0.45
	elif weapon == 4:
		duration = 0.55
	elif weapon == 5:
		duration = 0.78
	var audio := AudioStreamGenerator.new()
	audio.mix_rate = MIX_RATE
	audio.buffer_length = 1.0
	stream = audio
	play()
	var playback: AudioStreamGeneratorPlayback = get_stream_playback() as AudioStreamGeneratorPlayback
	if playback == null:
		return
	var total: int = int(duration * float(MIX_RATE))
	for i in range(total):
		var t: float = float(i) / float(MIX_RATE)
		var fade: float = pow(1.0 - t / duration, 1.7)
		var white: float = randf_range(-1.0, 1.0)
		var oscillation: float = sin(TAU * (110.0 - 50.0 * t / duration) * t)
		var sample: float
		if weapon == 2:
			sample = (0.23 * white + 0.55 * sin(TAU * (620.0 + 230.0 * t) * t)) * fade
		elif weapon == 1:
			sample = (white * 0.7 + oscillation * 0.2) * fade
		else:
			sample = (white * 0.5 + oscillation * 0.48) * fade
		var amplitude: float = clampf(sample * 0.8, -0.96, 0.96)
		playback.push_frame(Vector2(amplitude, amplitude))
