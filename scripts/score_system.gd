extends Node
## Local arcade style tracking, independent from online leaderboards.
signal updated(score: int, multiplier: float, rank: String, combo: int)

const RANKS := ["D", "C", "B", "A", "S", "SS", "SSS"]
var score: int = 0
var multiplier: float = 1.0
var combo: int = 0
var best_combo: int = 0
var rank: String = "D"
var _last_tool: int = -1
var _last_hit: float = -100.0
var _game_time: float = 0.0
var _style_points: float = 0.0

func _process(delta: float) -> void:
	_game_time += delta
	if combo <= 0:
		return
	if _game_time - _last_hit > 4.0:
		combo = 0
		multiplier = 1.0
		_style_points = maxf(0.0, _style_points - 25.0)
		_update_rank()
		updated.emit(score, multiplier, rank, combo)

func add_hit(tool: int, buildings: int, pieces: int) -> int:
	if buildings <= 0 and pieces <= 0:
		return 0
	var fast: bool = _game_time - _last_hit < 3.0
	if fast:
		combo += 1
	else:
		combo = 1
	if tool != _last_tool:
		_style_points += 20.0
		multiplier = minf(5.0, multiplier + 0.30)
	else:
		multiplier = maxf(1.0, multiplier - 0.10)
	best_combo = maxi(best_combo, combo)
	_last_tool = tool
	_last_hit = _game_time
	_style_points += float(pieces) * 3.0 + float(buildings) * 10.0
	_update_rank()
	var earned: int = int(float(pieces * 100 + buildings * 330) * multiplier)
	score += earned
	updated.emit(score, multiplier, rank, combo)
	return earned

func reset() -> void:
	score = 0
	multiplier = 1.0
	combo = 0
	best_combo = 0
	rank = "D"
	_last_tool = -1
	_last_hit = -100.0
	_style_points = 0.0
	updated.emit(score, multiplier, rank, combo)

func _update_rank() -> void:
	var thresholds := [0.0, 50.0, 125.0, 220.0, 350.0, 500.0, 700.0]
	var index: int = 0
	for i in range(thresholds.size()):
		if _style_points >= thresholds[i]:
			index = i
	rank = RANKS[index]
