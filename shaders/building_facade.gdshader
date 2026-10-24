shader_type spatial;
render_mode cull_disabled, diffuse_burley, specular_schlick_ggx;

// Narrowed windows, warm masonry and deep glass avoid the flat blue
// checkerboard appearance seen in the initial Windows preview.
uniform vec4 wall_color : source_color = vec4(0.61, 0.60, 0.57, 1.0);
uniform vec4 trim_color : source_color = vec4(0.38, 0.39, 0.38, 1.0);
uniform vec4 glass_color : source_color = vec4(0.10, 0.16, 0.22, 1.0);
uniform float night_factor : hint_range(0.0, 1.0) = 0.0;
uniform float damage_tint : hint_range(0.0, 1.0) = 0.0;

float rand2(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
	vec2 room = floor(UV);
	vec2 unit = fract(UV);
	float age = rand2(room * 0.17);
	float facade_band = 1.0 - step(0.075, unit.y);
	float pillar = 1.0 - step(0.052, unit.x);
	float window_h = step(0.37, unit.y) * (1.0 - step(0.82, unit.y));
	float window_w = step(0.255, unit.x) * (1.0 - step(0.755, unit.x));
	float opening = window_w * window_h;
	float inner_h = step(0.395, unit.y) * (1.0 - step(0.795, unit.y));
	float inner_w = step(0.28, unit.x) * (1.0 - step(0.73, unit.x));
	float glass_mask = inner_w * inner_h;
	float mullion = 1.0 - step(0.02, abs(unit.x - 0.50));
	float sills = step(0.20, unit.x) * (1.0 - step(0.81, unit.x)) * step(0.345, unit.y) * (1.0 - step(0.37, unit.y));
	float brick = rand2(floor(UV * vec2(3.0, 7.0))) * 0.07;
	vec3 plaster = wall_color.rgb * (0.89 + brick + 0.06 * age);
	plaster = mix(plaster, trim_color.rgb, max(facade_band * 0.26, pillar * 0.14));
	plaster = mix(plaster, trim_color.rgb * 0.67, opening);
	vec3 glass = glass_color.rgb * (0.85 + 0.28 * rand2(room));
	float reflect = smoothstep(0.42, 0.80, unit.x + unit.y * 0.17) * 0.11;
	glass += reflect;
	glass = mix(glass, trim_color.rgb, mullion * 0.62);
	vec3 color = mix(plaster, glass, glass_mask);
	color = mix(color, trim_color.rgb, sills * 0.68);
	color = mix(color, vec3(0.25, 0.23, 0.22), damage_tint * 0.32);
	ALBEDO = color;
	ROUGHNESS = mix(0.90, 0.28, glass_mask);
	METALLIC = glass_mask * 0.06;
	float lit = step(0.75, rand2(room + vec2(17.0, 3.0)));
	EMISSION = glass_mask * lit * night_factor * vec3(1.0, 0.78, 0.46) * 0.50;
}
